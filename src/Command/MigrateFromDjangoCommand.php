<?php

declare(strict_types=1);

namespace App\Command;

use App\Service\FieldEncryptor;
use Doctrine\DBAL\Connection;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;
use Symfony\Component\Uid\Uuid;

/**
 * Symfony-side half of the Django -> Symfony data migration tool (see
 * `backend/apps/accounts/management/commands/export_for_symfony_migration.py`
 * for the Django-side export and the design rationale — password
 * strategy, audit-log archival — documented there).
 *
 * Encrypted-field handling: the Django export contains decrypted
 * plaintext PII (Django's own field descriptors decrypt transparently
 * on attribute access — see that command's docblock), so every field
 * this command inserts into a now-encrypted-at-rest column
 * (User.mfaSecret/fullName, Employee.name, Appraisal.escalationReason,
 * Comment.content, GrowthPlan.overallAssessment, StrengthWeakness/
 * TrainingNeed/DevelopmentNeed.description, CareerPlan.aspiredRole) is
 * re-encrypted here via App\Service\FieldEncryptor::encrypt() before the
 * raw insert — these bypass the ORM/Doctrine-Type layer by design (see
 * below), so nothing else would encrypt them.
 *
 * Reads the JSONL directory produced by that export command and inserts
 * rows directly via DBAL (not the ORM: these entities are deliberately
 * constructor-only/setter-free by design, which is right for normal
 * app code but wrong for bulk data loading — raw parameterized INSERTs
 * sidestep that friction entirely, matching how this codebase already
 * handles the append-only AuditLog table at the SQL level).
 *
 * Password handling: migrated users get a random, unusable bcrypt hash
 * and a NULL last_password_change, which trips
 * PasswordChangeRequiredListener's reset-required gate on their first
 * request. A fresh PasswordResetToken is also minted for each migrated
 * user (written to a CSV alongside the input directory) so there's an
 * immediate way back in — this project has no outbound email wired up
 * yet (see the Symfony/Django parity gap list), so getting that link to
 * each user is an operational step for whoever runs this, not something
 * this command can do itself.
 *
 * Idempotency: this is a one-shot bulk load into what should be an
 * empty target database. It refuses to run if the `role` table already
 * has rows, rather than attempting upsert semantics.
 */
#[AsCommand(name: 'app:migrate-from-django', description: 'Import a Django export (see export_for_symfony_migration) into this database')]
final class MigrateFromDjangoCommand extends Command
{
    private const PASSWORD_RESET_TTL_HOURS = 72;

    public function __construct(private readonly Connection $connection)
    {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this
            ->addOption('input-dir', null, InputOption::VALUE_REQUIRED, 'Directory produced by export_for_symfony_migration')
            ->addOption('dry-run', null, InputOption::VALUE_NONE, 'Validate the export directory and print counts without writing anything');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);
        $inputDir = rtrim((string) $input->getOption('input-dir'), '/');
        $dryRun = (bool) $input->getOption('dry-run');

        $manifestPath = $inputDir.'/manifest.json';
        if (!is_file($manifestPath)) {
            $io->error("No manifest.json found at {$inputDir}. Point --input-dir at an export_for_symfony_migration output directory.");

            return Command::FAILURE;
        }
        $manifest = json_decode((string) file_get_contents($manifestPath), true, flags: \JSON_THROW_ON_ERROR);
        $io->section('Export manifest');
        $io->table(['Table', 'Rows'], array_map(static fn (string $k, int $v) => [$k, $v], array_keys($manifest['counts']), array_values($manifest['counts'])));

        if ($dryRun) {
            $io->note('Dry run — no data written.');

            return Command::SUCCESS;
        }

        $existingRoles = (int) $this->connection->fetchOne('SELECT COUNT(*) FROM role');
        if ($existingRoles > 0) {
            $io->error('The `role` table is not empty. This command is a one-shot bulk load into an empty database, not an upsert tool. Aborting.');

            return Command::FAILURE;
        }

        $resetTokens = [];

        $this->connection->transactional(function (Connection $conn) use ($inputDir, $io, &$resetTokens): void {
            $roleIdByName = $this->importRoles($conn, $inputDir);
            $this->importUsers($conn, $inputDir, $roleIdByName, $resetTokens);
            $this->importDepartments($conn, $inputDir);
            $this->importEmployees($conn, $inputDir);
            $perspectiveIdRemap = $this->importBscPerspectives($conn, $inputDir);
            $competencyIdRemap = $this->importCompetencies($conn, $inputDir);
            $this->importScoreDescriptors($conn, $inputDir);
            $this->importAppraisalCycles($conn, $inputDir);
            $this->importAppraisals($conn, $inputDir);
            $this->importKeyDeliverables($conn, $inputDir, $perspectiveIdRemap);
            $this->importCompetencyRatings($conn, $inputDir, $competencyIdRemap);
            $this->importComments($conn, $inputDir);
            $this->importSignatures($conn, $inputDir);
            $this->importGrowthPlans($conn, $inputDir);
            $this->importStrengthWeaknesses($conn, $inputDir);
            $this->importTrainingNeeds($conn, $inputDir);
            $this->importCareerPlans($conn, $inputDir);
            $this->importDevelopmentNeeds($conn, $inputDir);
            $this->importNotifications($conn, $inputDir);
            $this->importAuditLogArchive($conn, $inputDir);

            $io->writeln('  all tables imported inside one transaction.');
        });

        if ($resetTokens !== []) {
            $csvPath = $inputDir.'/password_reset_tokens.csv';
            $fh = fopen($csvPath, 'w');
            fputcsv($fh, ['email', 'reset_token', 'expires_at']);
            foreach ($resetTokens as $row) {
                fputcsv($fh, $row);
            }
            fclose($fh);
            $io->warning("Password reset tokens for {$this->count($resetTokens)} migrated user(s) written to {$csvPath}. This project has no outbound email wired up yet — distribute these links to users through whatever channel you use, then delete the file. Tokens expire in ".self::PASSWORD_RESET_TTL_HOURS.'h.');
        }

        $io->success('Migration complete.');

        return Command::SUCCESS;
    }

    private function count(array $a): int
    {
        return count($a);
    }

    /**
     * @return iterable<array<string, mixed>>
     */
    private function readJsonl(string $inputDir, string $name): iterable
    {
        $path = $inputDir."/{$name}.jsonl";
        if (!is_file($path)) {
            return;
        }
        $fh = fopen($path, 'r');
        while (($line = fgets($fh)) !== false) {
            $line = trim($line);
            if ($line === '') {
                continue;
            }
            yield json_decode($line, true, flags: \JSON_THROW_ON_ERROR);
        }
        fclose($fh);
    }

    /**
     * Doctrine DBAL's Connection::insert()/update() bind a raw PHP
     * `bool` as a plain string parameter with no type info, and PHP
     * casts `false` to `''` — which Postgres's `boolean` columns
     * reject outright (`invalid input syntax for type boolean: ""`).
     * Casting to 'true'/'false' text first sidesteps that.
     *
     * @param array<string, mixed> $data
     */
    private function insertRow(Connection $conn, string $table, array $data): void
    {
        $conn->insert($table, $this->castBooleans($data));
    }

    /**
     * @param array<string, mixed> $data
     * @param array<string, mixed> $criteria
     */
    private function updateRow(Connection $conn, string $table, array $data, array $criteria): void
    {
        $conn->update($table, $this->castBooleans($data), $criteria);
    }

    /**
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    private function castBooleans(array $data): array
    {
        foreach ($data as $key => $value) {
            if (is_bool($value)) {
                $data[$key] = $value ? 'true' : 'false';
            }
        }

        return $data;
    }

    /**
     * @return array<string, string> role name => uuid string
     */
    private function importRoles(Connection $conn, string $inputDir): array
    {
        $map = [];
        foreach ($this->readJsonl($inputDir, 'roles') as $row) {
            $this->insertRow($conn, 'role', ['id' => $row['id'], 'name' => $row['name']]);
            $map[$row['name']] = $row['id'];
        }

        return $map;
    }

    /**
     * @param array<string, string> $roleIdByName
     * @param list<array{0: string, 1: string, 2: string}> $resetTokens appended in place: [email, token, expiresAt]
     */
    private function importUsers(Connection $conn, string $inputDir, array $roleIdByName, array &$resetTokens): void
    {
        $now = new \DateTimeImmutable();
        foreach ($this->readJsonl($inputDir, 'users') as $row) {
            // Unusable random password + null last_password_change: no
            // Django hash format survives the port, so every migrated
            // user is forced through the reset flow on first request
            // (see PasswordChangeRequiredListener).
            $unusablePassword = password_hash(bin2hex(random_bytes(32)), \PASSWORD_BCRYPT);

            $this->insertRow($conn, '"user"', [
                'id' => $row['id'],
                'email' => $row['email'],
                'password' => $unusablePassword,
                'is_active' => $row['is_active'],
                'is_staff' => $row['is_staff'],
                'is_mfa_enabled' => $row['is_mfa_enabled'],
                'mfa_secret' => FieldEncryptor::encrypt($row['mfa_secret']),
                'failed_login_attempts' => $row['failed_login_attempts'],
                'locked_until' => $row['locked_until'],
                'next_attempt_after' => $row['next_attempt_after'],
                'full_name' => FieldEncryptor::encrypt($row['full_name']),
                'last_password_change' => null,
                'last_login' => $row['last_login'],
                'created_at' => $row['created_at'],
                'updated_at' => $row['updated_at'],
            ]);

            foreach ($row['role_names'] as $roleName) {
                if (!isset($roleIdByName[$roleName])) {
                    continue;
                }
                $this->insertRow($conn, 'user_role', ['user_id' => $row['id'], 'role_id' => $roleIdByName[$roleName]]);
            }

            if (!$row['is_active']) {
                continue;
            }
            $plainToken = bin2hex(random_bytes(32));
            $expiresAt = $now->modify('+'.self::PASSWORD_RESET_TTL_HOURS.' hours');
            $this->insertRow($conn, 'password_reset_token', [
                'id' => (string) Uuid::v7(),
                'user_id' => $row['id'],
                'token_hash' => hash('sha256', $plainToken),
                'created_at' => $now->format('Y-m-d H:i:s'),
                'expires_at' => $expiresAt->format('Y-m-d H:i:s'),
                'used_at' => null,
            ]);
            $resetTokens[] = [$row['email'], $plainToken, $expiresAt->format(\DateTimeInterface::ATOM)];
        }
    }

    private function importDepartments(Connection $conn, string $inputDir): void
    {
        $rows = iterator_to_array($this->readJsonl($inputDir, 'departments'));

        // parent_id is a NOT DEFERRABLE self-FK -- insert with it NULL
        // first, then a second pass to link parents, so ordering in
        // the source file never matters.
        foreach ($rows as $row) {
            $this->insertRow($conn, 'department', [
                'id' => $row['id'],
                'name' => $row['name'],
                'code' => $row['code'],
                'parent_id' => null,
                'created_at' => $row['created_at'],
                'updated_at' => $row['updated_at'],
            ]);
        }
        foreach ($rows as $row) {
            if ($row['parent_id'] === null) {
                continue;
            }
            $this->updateRow($conn, 'department', ['parent_id' => $row['parent_id']], ['id' => $row['id']]);
        }
    }

    private function importEmployees(Connection $conn, string $inputDir): void
    {
        $rows = iterator_to_array($this->readJsonl($inputDir, 'employees'));

        // manager_id is a NOT DEFERRABLE self-FK -- same two-pass approach.
        foreach ($rows as $row) {
            $this->insertRow($conn, 'employee', [
                'id' => $row['id'],
                'user_id' => $row['user_id'],
                'employee_number' => $row['employee_number'],
                'name' => FieldEncryptor::encrypt($row['name']),
                'job_title' => $row['job_title'],
                'department_id' => $row['department_id'],
                'job_family' => $row['job_family'],
                'location' => $row['location'],
                'classification' => $row['classification'],
                'manager_id' => null,
                'is_active' => $row['is_active'],
                'created_at' => $row['created_at'],
                'updated_at' => $row['updated_at'],
            ]);
        }
        foreach ($rows as $row) {
            if ($row['manager_id'] === null) {
                continue;
            }
            $this->updateRow($conn, 'employee', ['manager_id' => $row['manager_id']], ['id' => $row['id']]);
        }
    }

    /**
     * BscPerspective is a reference/lookup table that Symfony's own
     * migrations already seed with the system defaults (see
     * Version20260710082730) -- so unlike every other table here, a
     * name collision on a fresh database is EXPECTED, not a sign of a
     * non-empty target. Rows matching an existing name are skipped
     * (not re-inserted) and their Django id is remapped to the
     * already-seeded Symfony row's id, so KeyDeliverable.perspective_id
     * (imported later) points at the right place either way.
     *
     * @return array<string, string> Django perspective id => Symfony perspective id
     */
    private function importBscPerspectives(Connection $conn, string $inputDir): array
    {
        $remap = [];
        foreach ($this->readJsonl($inputDir, 'bsc_perspectives') as $row) {
            $existingId = $conn->fetchOne('SELECT id FROM bsc_perspective WHERE name = ?', [$row['name']]);
            if ($existingId !== false) {
                $remap[$row['id']] = $existingId;
                continue;
            }

            $this->insertRow($conn, 'bsc_perspective', [
                'id' => $row['id'],
                'name' => $row['name'],
                'sort_order' => $row['sort_order'],
                'weight_cap' => $row['weight_cap'],
                'max_kd_count' => $row['max_kd_count'],
                'weight_cap_mgr' => $row['weight_cap_mgr'],
                'max_kd_count_mgr' => $row['max_kd_count_mgr'],
            ]);
            $remap[$row['id']] = $row['id'];
        }

        return $remap;
    }

    /**
     * Same pre-seeded-reference-table situation as BscPerspective above
     * (see Version20260710075155) -- dedup by name, remap Django id to
     * the existing Symfony row's id.
     *
     * @return array<string, string> Django competency id => Symfony competency id
     */
    private function importCompetencies(Connection $conn, string $inputDir): array
    {
        $remap = [];
        foreach ($this->readJsonl($inputDir, 'competencies') as $row) {
            $existingId = $conn->fetchOne('SELECT id FROM competency WHERE name = ?', [$row['name']]);
            if ($existingId !== false) {
                $remap[$row['id']] = $existingId;
                continue;
            }

            $this->insertRow($conn, 'competency', [
                'id' => $row['id'],
                'name' => $row['name'],
                'applicable_to' => $row['applicable_to'],
                'is_core' => $row['is_core'],
                'sort_order' => $row['sort_order'],
                'is_active' => $row['is_active'],
            ]);
            $remap[$row['id']] = $row['id'];
        }

        return $remap;
    }

    /**
     * Only cycle_id IS NULL rows are "system defaults" and therefore
     * subject to the same pre-seeded collision as BscPerspective/
     * Competency above (Version20260710082730 seeds these too, keyed
     * by sort_order); cycle-specific rows (frozen per-cycle snapshots)
     * are never pre-seeded and always inserted fresh. Nothing else
     * references a ScoreDescriptor by FK, so no id remap is needed
     * here -- skipping a collision is enough.
     */
    private function importScoreDescriptors(Connection $conn, string $inputDir): void
    {
        foreach ($this->readJsonl($inputDir, 'score_descriptors') as $row) {
            if ($row['cycle_id'] === null) {
                $exists = $conn->fetchOne('SELECT 1 FROM score_descriptor WHERE cycle_id IS NULL AND sort_order = ?', [$row['sort_order']]);
                if ($exists !== false) {
                    continue;
                }
            }

            $this->insertRow($conn, 'score_descriptor', [
                'id' => $row['id'],
                'cycle_id' => $row['cycle_id'],
                'min_score' => $row['min_score'],
                'max_score' => $row['max_score'],
                'kd_label' => $row['kd_label'],
                'competency_label' => $row['competency_label'],
                'sort_order' => $row['sort_order'],
                'created_at' => $row['created_at'] ?? $row['updated_at'] ?? (new \DateTimeImmutable())->format('Y-m-d H:i:s'),
                'updated_at' => $row['updated_at'] ?? $row['created_at'] ?? (new \DateTimeImmutable())->format('Y-m-d H:i:s'),
            ]);
        }
    }

    private function importAppraisalCycles(Connection $conn, string $inputDir): void
    {
        foreach ($this->readJsonl($inputDir, 'appraisal_cycles') as $row) {
            $this->insertRow($conn, 'appraisal_cycle', [
                'id' => $row['id'],
                'period_name' => $row['period_name'],
                'start_date' => $row['start_date'],
                'end_date' => $row['end_date'],
                'status' => $row['status'],
                'self_rating_enabled' => $row['self_rating_enabled'],
                'created_by_id' => $row['created_by_id'],
                'config_snapshot' => json_encode($row['config_snapshot'], \JSON_THROW_ON_ERROR),
                'created_at' => $row['created_at'],
                'updated_at' => $row['updated_at'],
            ]);
        }
    }

    private function importAppraisals(Connection $conn, string $inputDir): void
    {
        foreach ($this->readJsonl($inputDir, 'appraisals') as $row) {
            $this->insertRow($conn, 'appraisal', [
                'id' => $row['id'],
                'cycle_id' => $row['cycle_id'],
                'employee_id' => $row['employee_id'],
                'form_type' => $row['form_type'],
                'status' => $row['status'],
                'status_changed_at' => $row['status_changed_at'],
                'kd_average_score' => $row['kd_average_score'],
                'bc_average_score' => $row['bc_average_score'],
                'total_score' => $row['total_score'],
                'kd_descriptor' => $row['kd_descriptor'],
                'bc_descriptor' => $row['bc_descriptor'],
                'performance_descriptor' => $row['performance_descriptor'],
                'previous_status' => $row['previous_status'],
                'version' => $row['version'],
                'escalated_executive_id' => $row['escalated_executive_id'],
                'escalation_reason' => FieldEncryptor::encrypt($row['escalation_reason']),
                'signing_round' => $row['signing_round'],
                'created_at' => $row['created_at'],
                'updated_at' => $row['updated_at'],
            ]);
        }
    }

    /**
     * @param array<string, string> $perspectiveIdRemap Django perspective id => Symfony perspective id
     */
    private function importKeyDeliverables(Connection $conn, string $inputDir, array $perspectiveIdRemap): void
    {
        foreach ($this->readJsonl($inputDir, 'key_deliverables') as $row) {
            $this->insertRow($conn, 'key_deliverable', [
                'id' => $row['id'],
                'appraisal_id' => $row['appraisal_id'],
                'perspective_id' => $perspectiveIdRemap[$row['perspective_id']] ?? $row['perspective_id'],
                'description' => $row['description'],
                'weight' => $row['weight'],
                'self_rating' => $row['self_rating'],
                'manager_rating' => $row['manager_rating'],
                'weighted_score' => $row['weighted_score'],
                'sort_order' => $row['sort_order'],
                'created_at' => $row['created_at'],
                'updated_at' => $row['updated_at'],
            ]);
        }
    }

    /**
     * @param array<string, string> $competencyIdRemap Django competency id => Symfony competency id
     */
    private function importCompetencyRatings(Connection $conn, string $inputDir, array $competencyIdRemap): void
    {
        foreach ($this->readJsonl($inputDir, 'competency_ratings') as $row) {
            $this->insertRow($conn, 'competency_rating', [
                'id' => $row['id'],
                'appraisal_id' => $row['appraisal_id'],
                'competency_id' => $competencyIdRemap[$row['competency_id']] ?? $row['competency_id'],
                'self_rating' => $row['self_rating'],
                'manager_rating' => $row['manager_rating'],
                'created_at' => $row['created_at'],
                'updated_at' => $row['updated_at'],
            ]);
        }
    }

    private function importComments(Connection $conn, string $inputDir): void
    {
        foreach ($this->readJsonl($inputDir, 'comments') as $row) {
            $this->insertRow($conn, 'appraisal_comment', [
                'id' => $row['id'],
                'appraisal_id' => $row['appraisal_id'],
                'author_id' => $row['author_id'],
                'author_role' => $row['author_role'],
                'content' => FieldEncryptor::encrypt($row['content']),
                'created_at' => $row['created_at'],
            ]);
        }
    }

    private function importSignatures(Connection $conn, string $inputDir): void
    {
        foreach ($this->readJsonl($inputDir, 'signatures') as $row) {
            $this->insertRow($conn, 'appraisal_signature', [
                'id' => $row['id'],
                'appraisal_id' => $row['appraisal_id'],
                'signer_id' => $row['signer_id'],
                'signer_role' => $row['signer_role'],
                'action' => $row['action'],
                'discussed' => $row['discussed'],
                'reason' => $row['reason'],
                'signed_at' => $row['signed_at'],
                'ip_address' => $row['ip_address'],
                'user_agent_hash' => $row['user_agent_hash'],
                'signing_round' => $row['signing_round'],
            ]);
        }
    }

    private function importGrowthPlans(Connection $conn, string $inputDir): void
    {
        foreach ($this->readJsonl($inputDir, 'growth_plans') as $row) {
            $this->insertRow($conn, 'growth_plan', [
                'id' => $row['id'],
                'appraisal_id' => $row['appraisal_id'],
                'overall_assessment' => FieldEncryptor::encrypt($row['overall_assessment']),
                'created_at' => $row['created_at'],
                'updated_at' => $row['updated_at'],
            ]);
        }
    }

    private function importStrengthWeaknesses(Connection $conn, string $inputDir): void
    {
        foreach ($this->readJsonl($inputDir, 'strength_weaknesses') as $row) {
            $this->insertRow($conn, 'growth_plan_strength_weakness', [
                'id' => $row['id'],
                'growth_plan_id' => $row['growth_plan_id'],
                'type' => $row['type'],
                'description' => FieldEncryptor::encrypt($row['description']),
                'sort_order' => $row['sort_order'],
            ]);
        }
    }

    private function importTrainingNeeds(Connection $conn, string $inputDir): void
    {
        foreach ($this->readJsonl($inputDir, 'training_needs') as $row) {
            $this->insertRow($conn, 'growth_plan_training_need', [
                'id' => $row['id'],
                'growth_plan_id' => $row['growth_plan_id'],
                'type' => $row['type'],
                'description' => FieldEncryptor::encrypt($row['description']),
                'course_title' => $row['course_title'],
                'institution' => $row['institution'],
                'priority' => $row['priority'],
                'sort_order' => $row['sort_order'],
            ]);
        }
    }

    private function importCareerPlans(Connection $conn, string $inputDir): void
    {
        foreach ($this->readJsonl($inputDir, 'career_plans') as $row) {
            $this->insertRow($conn, 'growth_plan_career_plan', [
                'id' => $row['id'],
                'growth_plan_id' => $row['growth_plan_id'],
                'aspired_role' => FieldEncryptor::encrypt($row['aspired_role']),
                'priority' => $row['priority'],
            ]);
        }
    }

    private function importDevelopmentNeeds(Connection $conn, string $inputDir): void
    {
        foreach ($this->readJsonl($inputDir, 'development_needs') as $row) {
            $this->insertRow($conn, 'growth_plan_development_need', [
                'id' => $row['id'],
                'growth_plan_id' => $row['growth_plan_id'],
                'description' => FieldEncryptor::encrypt($row['description']),
                'priority' => $row['priority'],
            ]);
        }
    }

    private function importNotifications(Connection $conn, string $inputDir): void
    {
        foreach ($this->readJsonl($inputDir, 'notifications') as $row) {
            $this->insertRow($conn, 'notification', [
                'id' => $row['id'],
                'recipient_id' => $row['recipient_id'],
                'appraisal_id' => $row['appraisal_id'],
                'event_type' => $row['event_type'],
                'title' => $row['title'],
                'message' => $row['message'],
                'is_read' => $row['is_read'],
                'related_object_type' => $row['related_object_type'],
                'related_object_id' => $row['related_object_id'],
                'metadata' => json_encode($row['metadata'], \JSON_THROW_ON_ERROR),
                'created_at' => $row['created_at'],
            ]);
        }
    }

    private function importAuditLogArchive(Connection $conn, string $inputDir): void
    {
        foreach ($this->readJsonl($inputDir, 'audit_log_archive') as $row) {
            $this->insertRow($conn, 'audit_log_django_archive', [
                'id' => $row['id'],
                'user_id' => $row['user_id'],
                'action' => $row['action'],
                'resource_type' => $row['resource_type'],
                'resource_id' => $row['resource_id'],
                'old_value_hash' => $row['old_value_hash'],
                'new_value_hash' => $row['new_value_hash'],
                'metadata' => json_encode($row['metadata'], \JSON_THROW_ON_ERROR),
                'ip_address' => $row['ip_address'],
                'timestamp' => $row['timestamp'],
                'previous_hash' => $row['previous_hash'],
                'entry_hmac' => $row['entry_hmac'],
            ]);
        }
    }
}
