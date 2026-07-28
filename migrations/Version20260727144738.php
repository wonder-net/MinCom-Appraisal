<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;
use Symfony\Component\Uid\Uuid;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20260727144738 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Initial MySQL schema (squashed from the 16 PostgreSQL-only migrations for the Postgres->MySQL engine migration). UUIDs are stored as CHAR(36) via App\Doctrine\Type\UuidStringType rather than Symfony\'s default BINARY(16), which breaks Doctrine ORM\'s generic entity-parameter binding under MySQL. Adds hand-written MySQL equivalents of things the diff cannot express: a generated-column unique index emulating score_descriptor\'s partial unique index on sort_order WHERE cycle_id IS NULL, two SIGNAL-based triggers emulating the PL/pgSQL append-only trigger on audit_log, and the canonical competency/BSC-perspective/score-descriptor reference-data seed (data, not schema, so not captured by doctrine:migrations:diff).';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql('CREATE TABLE appraisal (id CHAR(36) NOT NULL, form_type VARCHAR(10) NOT NULL, status VARCHAR(20) NOT NULL, status_changed_at DATETIME DEFAULT NULL, kd_average_score NUMERIC(5, 2) DEFAULT NULL, bc_average_score NUMERIC(5, 2) DEFAULT NULL, total_score NUMERIC(5, 2) DEFAULT NULL, kd_descriptor VARCHAR(100) DEFAULT NULL, bc_descriptor VARCHAR(100) DEFAULT NULL, performance_descriptor VARCHAR(100) DEFAULT NULL, previous_status VARCHAR(20) DEFAULT NULL, version INT DEFAULT 1 NOT NULL, escalation_reason LONGTEXT DEFAULT NULL, signing_round INT NOT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, cycle_id CHAR(36) NOT NULL, employee_id CHAR(36) NOT NULL, escalated_executive_id CHAR(36) DEFAULT NULL, INDEX IDX_27EA2BD05EC1162 (cycle_id), INDEX IDX_27EA2BD08C03F15C (employee_id), INDEX IDX_27EA2BD0964382FF (escalated_executive_id), UNIQUE INDEX unique_appraisal_per_cycle_employee (cycle_id, employee_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE appraisal_bulk_import_job (id CHAR(36) NOT NULL, status VARCHAR(20) NOT NULL, target_status VARCHAR(30) NOT NULL, file_path VARCHAR(500) NOT NULL, total_files INT NOT NULL, imported_count INT NOT NULL, failed_count INT NOT NULL, failed_files JSON NOT NULL, preview_data JSON NOT NULL, created_at DATETIME NOT NULL, completed_at DATETIME DEFAULT NULL, created_by_id CHAR(36) NOT NULL, cycle_id CHAR(36) DEFAULT NULL, INDEX IDX_558D2D13B03A8386 (created_by_id), INDEX IDX_558D2D135EC1162 (cycle_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE appraisal_comment (id CHAR(36) NOT NULL, author_role VARCHAR(10) NOT NULL, content LONGTEXT NOT NULL, created_at DATETIME NOT NULL, appraisal_id CHAR(36) NOT NULL, author_id CHAR(36) NOT NULL, INDEX IDX_EFA5639BDD670628 (appraisal_id), INDEX IDX_EFA5639BF675F31B (author_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE appraisal_cycle (id CHAR(36) NOT NULL, period_name VARCHAR(200) NOT NULL, start_date DATE NOT NULL, end_date DATE NOT NULL, status VARCHAR(20) NOT NULL, self_rating_enabled TINYINT NOT NULL, config_snapshot JSON NOT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, created_by_id CHAR(36) NOT NULL, INDEX IDX_1A51CE0CB03A8386 (created_by_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE appraisal_signature (id CHAR(36) NOT NULL, signer_role VARCHAR(10) NOT NULL, action VARCHAR(20) NOT NULL, discussed TINYINT NOT NULL, reason LONGTEXT DEFAULT NULL, signed_at DATETIME NOT NULL, ip_address VARCHAR(45) NOT NULL, user_agent_hash VARCHAR(64) NOT NULL, signing_round INT NOT NULL, appraisal_id CHAR(36) NOT NULL, signer_id CHAR(36) NOT NULL, INDEX IDX_A4AB0DD0DD670628 (appraisal_id), INDEX IDX_A4AB0DD09588C067 (signer_id), UNIQUE INDEX unique_signature_per_appraisal_signer_per_round (appraisal_id, signer_id, signing_round), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE audit_log (id CHAR(36) NOT NULL, user_id CHAR(36) DEFAULT NULL, action VARCHAR(100) NOT NULL, resource_type VARCHAR(100) NOT NULL, resource_id CHAR(36) NOT NULL, old_value_hash VARCHAR(64) NOT NULL, new_value_hash VARCHAR(64) NOT NULL, metadata JSON NOT NULL, ip_address VARCHAR(45) DEFAULT NULL, timestamp DATETIME NOT NULL, previous_hash VARCHAR(64) NOT NULL, entry_hmac VARCHAR(64) NOT NULL, INDEX idx_audit_log_user_id (user_id), INDEX idx_audit_log_action (action), INDEX idx_audit_log_resource_type (resource_type), INDEX idx_audit_log_resource_id (resource_id), INDEX idx_audit_log_timestamp (timestamp), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE bsc_perspective (id CHAR(36) NOT NULL, name VARCHAR(100) NOT NULL, sort_order INT NOT NULL, weight_cap NUMERIC(5, 4) DEFAULT NULL, max_kd_count INT DEFAULT NULL, weight_cap_mgr NUMERIC(5, 4) DEFAULT NULL, max_kd_count_mgr INT DEFAULT NULL, UNIQUE INDEX UNIQ_EEF03D9D5E237E06 (name), UNIQUE INDEX UNIQ_EEF03D9D45AFA4EA (sort_order), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE bulk_import_job (id CHAR(36) NOT NULL, status VARCHAR(20) NOT NULL, file_path VARCHAR(500) NOT NULL, total_rows INT NOT NULL, created_count INT NOT NULL, failed_count INT NOT NULL, failed_rows JSON NOT NULL, created_at DATETIME NOT NULL, completed_at DATETIME DEFAULT NULL, created_by_id CHAR(36) NOT NULL, INDEX IDX_F95780F2B03A8386 (created_by_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE competency (id CHAR(36) NOT NULL, name VARCHAR(200) NOT NULL, applicable_to VARCHAR(20) NOT NULL, is_core TINYINT NOT NULL, sort_order INT NOT NULL, is_active TINYINT NOT NULL, UNIQUE INDEX UNIQ_80D534305E237E06 (name), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE competency_rating (id CHAR(36) NOT NULL, self_rating NUMERIC(3, 2) DEFAULT NULL, manager_rating NUMERIC(3, 2) DEFAULT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, appraisal_id CHAR(36) NOT NULL, competency_id CHAR(36) NOT NULL, INDEX IDX_BA7E675ADD670628 (appraisal_id), INDEX IDX_BA7E675AFB9F58C (competency_id), UNIQUE INDEX unique_appraisal_competency (appraisal_id, competency_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE department (id CHAR(36) NOT NULL, name VARCHAR(255) NOT NULL, code VARCHAR(50) NOT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, parent_id CHAR(36) DEFAULT NULL, UNIQUE INDEX UNIQ_CD1DE18A77153098 (code), INDEX IDX_CD1DE18A727ACA70 (parent_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE employee (id CHAR(36) NOT NULL, employee_number VARCHAR(50) NOT NULL, name LONGTEXT NOT NULL, job_title VARCHAR(255) NOT NULL, job_family VARCHAR(255) NOT NULL, location VARCHAR(255) NOT NULL, classification VARCHAR(20) NOT NULL, is_active TINYINT NOT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, user_id CHAR(36) NOT NULL, department_id CHAR(36) NOT NULL, manager_id CHAR(36) DEFAULT NULL, UNIQUE INDEX UNIQ_5D9F75A1BFA1DBC1 (employee_number), UNIQUE INDEX UNIQ_5D9F75A1A76ED395 (user_id), INDEX IDX_5D9F75A1AE80F5DF (department_id), INDEX IDX_5D9F75A1783E3463 (manager_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE growth_plan (id CHAR(36) NOT NULL, overall_assessment LONGTEXT DEFAULT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, appraisal_id CHAR(36) NOT NULL, UNIQUE INDEX unique_growth_plan_per_appraisal (appraisal_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE growth_plan_career_plan (id CHAR(36) NOT NULL, aspired_role LONGTEXT NOT NULL, priority VARCHAR(10) NOT NULL, growth_plan_id CHAR(36) NOT NULL, INDEX IDX_31A26F258E361B39 (growth_plan_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE growth_plan_development_need (id CHAR(36) NOT NULL, description LONGTEXT NOT NULL, priority VARCHAR(10) NOT NULL, growth_plan_id CHAR(36) NOT NULL, INDEX IDX_F365C3D68E361B39 (growth_plan_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE growth_plan_strength_weakness (id CHAR(36) NOT NULL, type VARCHAR(10) NOT NULL, description LONGTEXT NOT NULL, sort_order INT NOT NULL, growth_plan_id CHAR(36) NOT NULL, INDEX IDX_8C4D940C8E361B39 (growth_plan_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE growth_plan_training_need (id CHAR(36) NOT NULL, type VARCHAR(20) NOT NULL, description LONGTEXT NOT NULL, course_title VARCHAR(255) DEFAULT NULL, institution VARCHAR(255) DEFAULT NULL, priority VARCHAR(10) NOT NULL, sort_order INT NOT NULL, growth_plan_id CHAR(36) NOT NULL, INDEX IDX_B85C7A9E8E361B39 (growth_plan_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE key_deliverable (id CHAR(36) NOT NULL, description LONGTEXT NOT NULL, weight NUMERIC(5, 4) NOT NULL, self_rating NUMERIC(3, 2) DEFAULT NULL, manager_rating NUMERIC(3, 2) DEFAULT NULL, weighted_score NUMERIC(5, 4) DEFAULT NULL, sort_order INT NOT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, appraisal_id CHAR(36) NOT NULL, perspective_id CHAR(36) NOT NULL, INDEX IDX_FA13A702DD670628 (appraisal_id), INDEX IDX_FA13A702EDD6CAAB (perspective_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE notification (id CHAR(36) NOT NULL, event_type VARCHAR(100) NOT NULL, title VARCHAR(255) NOT NULL, message LONGTEXT NOT NULL, is_read TINYINT NOT NULL, related_object_type VARCHAR(50) NOT NULL, related_object_id CHAR(36) DEFAULT NULL, metadata JSON NOT NULL, created_at DATETIME NOT NULL, recipient_id CHAR(36) NOT NULL, appraisal_id CHAR(36) DEFAULT NULL, INDEX IDX_BF5476CAE92F8F78 (recipient_id), INDEX IDX_BF5476CADD670628 (appraisal_id), INDEX idx_notif_recipient_created (recipient_id, created_at), INDEX idx_notif_recipient_unread (recipient_id, is_read), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE password_reset_token (id CHAR(36) NOT NULL, token_hash VARCHAR(64) NOT NULL, created_at DATETIME NOT NULL, expires_at DATETIME NOT NULL, used_at DATETIME DEFAULT NULL, user_id CHAR(36) NOT NULL, UNIQUE INDEX UNIQ_6B7BA4B6B3BC57DA (token_hash), INDEX IDX_6B7BA4B6A76ED395 (user_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE recovery_code (id CHAR(36) NOT NULL, code_hash VARCHAR(128) NOT NULL, is_used TINYINT NOT NULL, used_at DATETIME DEFAULT NULL, created_at DATETIME NOT NULL, user_id CHAR(36) NOT NULL, INDEX IDX_2C8D0584A76ED395 (user_id), INDEX idx_recovery_user_unused (user_id, is_used), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE refresh_tokens (id INT AUTO_INCREMENT NOT NULL, refresh_token VARCHAR(128) NOT NULL, username VARCHAR(255) NOT NULL, valid DATETIME NOT NULL, session_start DATETIME NOT NULL, UNIQUE INDEX UNIQ_9BACE7E1C74F2195 (refresh_token), INDEX idx_refresh_tokens_username (username), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE role (id CHAR(36) NOT NULL, name VARCHAR(20) NOT NULL, UNIQUE INDEX UNIQ_57698A6A5E237E06 (name), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE score_descriptor (id CHAR(36) NOT NULL, min_score NUMERIC(5, 2) NOT NULL, max_score NUMERIC(5, 2) NOT NULL, kd_label VARCHAR(100) NOT NULL, competency_label VARCHAR(100) NOT NULL, sort_order INT NOT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, cycle_id CHAR(36) DEFAULT NULL, INDEX IDX_F218BDBA5EC1162 (cycle_id), UNIQUE INDEX unique_cycle_sort_order (cycle_id, sort_order), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE user (id CHAR(36) NOT NULL, email VARCHAR(255) NOT NULL, password VARCHAR(255) NOT NULL, is_active TINYINT NOT NULL, is_staff TINYINT NOT NULL, is_superuser TINYINT NOT NULL, is_mfa_enabled TINYINT NOT NULL, mfa_secret LONGTEXT DEFAULT NULL, failed_login_attempts INT NOT NULL, locked_until DATETIME DEFAULT NULL, next_attempt_after DATETIME DEFAULT NULL, full_name LONGTEXT DEFAULT NULL, last_password_change DATETIME DEFAULT NULL, last_login DATETIME DEFAULT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, UNIQUE INDEX UNIQ_8D93D649E7927C74 (email), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE user_role (user_id CHAR(36) NOT NULL, role_id CHAR(36) NOT NULL, INDEX IDX_2DE8C6A3A76ED395 (user_id), INDEX IDX_2DE8C6A3D60322AC (role_id), PRIMARY KEY (user_id, role_id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE user_bulk_import_job (id CHAR(36) NOT NULL, original_filename VARCHAR(255) NOT NULL, stored_file_path VARCHAR(500) NOT NULL, status VARCHAR(30) NOT NULL, total_rows INT NOT NULL, processed_rows INT NOT NULL, created_count INT NOT NULL, failed_count INT NOT NULL, validation_preview LONGTEXT DEFAULT NULL, failed_rows LONGTEXT DEFAULT NULL, error_message LONGTEXT NOT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, validation_completed_at DATETIME DEFAULT NULL, commit_started_at DATETIME DEFAULT NULL, commit_completed_at DATETIME DEFAULT NULL, created_by_id CHAR(36) NOT NULL, INDEX IDX_EB8BEC7DB03A8386 (created_by_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE messenger_messages (id BIGINT AUTO_INCREMENT NOT NULL, body LONGTEXT NOT NULL, headers LONGTEXT NOT NULL, queue_name VARCHAR(190) NOT NULL, created_at DATETIME NOT NULL, available_at DATETIME NOT NULL, delivered_at DATETIME DEFAULT NULL, INDEX IDX_75EA56E0FB7336F0E3BD61CE16BA31DBBF396750 (queue_name, available_at, delivered_at, id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('ALTER TABLE appraisal ADD CONSTRAINT FK_27EA2BD05EC1162 FOREIGN KEY (cycle_id) REFERENCES appraisal_cycle (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE appraisal ADD CONSTRAINT FK_27EA2BD08C03F15C FOREIGN KEY (employee_id) REFERENCES employee (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE appraisal ADD CONSTRAINT FK_27EA2BD0964382FF FOREIGN KEY (escalated_executive_id) REFERENCES user (id)');
        $this->addSql('ALTER TABLE appraisal_bulk_import_job ADD CONSTRAINT FK_558D2D13B03A8386 FOREIGN KEY (created_by_id) REFERENCES user (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE appraisal_bulk_import_job ADD CONSTRAINT FK_558D2D135EC1162 FOREIGN KEY (cycle_id) REFERENCES appraisal_cycle (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE appraisal_comment ADD CONSTRAINT FK_EFA5639BDD670628 FOREIGN KEY (appraisal_id) REFERENCES appraisal (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE appraisal_comment ADD CONSTRAINT FK_EFA5639BF675F31B FOREIGN KEY (author_id) REFERENCES user (id)');
        $this->addSql('ALTER TABLE appraisal_cycle ADD CONSTRAINT FK_1A51CE0CB03A8386 FOREIGN KEY (created_by_id) REFERENCES user (id)');
        $this->addSql('ALTER TABLE appraisal_signature ADD CONSTRAINT FK_A4AB0DD0DD670628 FOREIGN KEY (appraisal_id) REFERENCES appraisal (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE appraisal_signature ADD CONSTRAINT FK_A4AB0DD09588C067 FOREIGN KEY (signer_id) REFERENCES user (id)');
        $this->addSql('ALTER TABLE bulk_import_job ADD CONSTRAINT FK_F95780F2B03A8386 FOREIGN KEY (created_by_id) REFERENCES user (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE competency_rating ADD CONSTRAINT FK_BA7E675ADD670628 FOREIGN KEY (appraisal_id) REFERENCES appraisal (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE competency_rating ADD CONSTRAINT FK_BA7E675AFB9F58C FOREIGN KEY (competency_id) REFERENCES competency (id)');
        $this->addSql('ALTER TABLE department ADD CONSTRAINT FK_CD1DE18A727ACA70 FOREIGN KEY (parent_id) REFERENCES department (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE employee ADD CONSTRAINT FK_5D9F75A1A76ED395 FOREIGN KEY (user_id) REFERENCES user (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE employee ADD CONSTRAINT FK_5D9F75A1AE80F5DF FOREIGN KEY (department_id) REFERENCES department (id)');
        $this->addSql('ALTER TABLE employee ADD CONSTRAINT FK_5D9F75A1783E3463 FOREIGN KEY (manager_id) REFERENCES employee (id) ON DELETE SET NULL');
        $this->addSql('ALTER TABLE growth_plan ADD CONSTRAINT FK_7F46147ADD670628 FOREIGN KEY (appraisal_id) REFERENCES appraisal (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE growth_plan_career_plan ADD CONSTRAINT FK_31A26F258E361B39 FOREIGN KEY (growth_plan_id) REFERENCES growth_plan (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE growth_plan_development_need ADD CONSTRAINT FK_F365C3D68E361B39 FOREIGN KEY (growth_plan_id) REFERENCES growth_plan (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE growth_plan_strength_weakness ADD CONSTRAINT FK_8C4D940C8E361B39 FOREIGN KEY (growth_plan_id) REFERENCES growth_plan (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE growth_plan_training_need ADD CONSTRAINT FK_B85C7A9E8E361B39 FOREIGN KEY (growth_plan_id) REFERENCES growth_plan (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE key_deliverable ADD CONSTRAINT FK_FA13A702DD670628 FOREIGN KEY (appraisal_id) REFERENCES appraisal (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE key_deliverable ADD CONSTRAINT FK_FA13A702EDD6CAAB FOREIGN KEY (perspective_id) REFERENCES bsc_perspective (id)');
        $this->addSql('ALTER TABLE notification ADD CONSTRAINT FK_BF5476CAE92F8F78 FOREIGN KEY (recipient_id) REFERENCES user (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE notification ADD CONSTRAINT FK_BF5476CADD670628 FOREIGN KEY (appraisal_id) REFERENCES appraisal (id) ON DELETE SET NULL');
        $this->addSql('ALTER TABLE password_reset_token ADD CONSTRAINT FK_6B7BA4B6A76ED395 FOREIGN KEY (user_id) REFERENCES user (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE recovery_code ADD CONSTRAINT FK_2C8D0584A76ED395 FOREIGN KEY (user_id) REFERENCES user (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE score_descriptor ADD CONSTRAINT FK_F218BDBA5EC1162 FOREIGN KEY (cycle_id) REFERENCES appraisal_cycle (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE user_role ADD CONSTRAINT FK_2DE8C6A3A76ED395 FOREIGN KEY (user_id) REFERENCES user (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE user_role ADD CONSTRAINT FK_2DE8C6A3D60322AC FOREIGN KEY (role_id) REFERENCES role (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE user_bulk_import_job ADD CONSTRAINT FK_EB8BEC7DB03A8386 FOREIGN KEY (created_by_id) REFERENCES user (id) ON DELETE CASCADE');

        // ---------------------------------------------------------------
        // Hand-written additions — not expressible via Doctrine attributes,
        // so `doctrine:migrations:diff` cannot generate these on its own.
        // ---------------------------------------------------------------

        // Emulates Postgres's partial unique index
        // (CREATE UNIQUE INDEX unique_default_sort_order ON score_descriptor
        // (sort_order) WHERE cycle_id IS NULL — see ScoreDescriptor.php's
        // docblock). MySQL has no partial/filtered index support at all, so
        // a generated column that is non-null only for the rows the partial
        // index would have covered stands in for it: MySQL unique indexes
        // permit multiple NULLs, so rows with cycle_id NOT NULL (which
        // generate a NULL here) never collide, while cycle_id-IS-NULL rows
        // are compared on their real sort_order value.
        $this->addSql('ALTER TABLE score_descriptor ADD sort_order_when_default INT GENERATED ALWAYS AS (CASE WHEN cycle_id IS NULL THEN sort_order ELSE NULL END) VIRTUAL');
        $this->addSql('CREATE UNIQUE INDEX unique_default_sort_order ON score_descriptor (sort_order_when_default)');

        // Emulates the PL/pgSQL prevent_audit_modification() trigger
        // (BEFORE UPDATE OR DELETE, RAISE EXCEPTION) that made audit_log
        // append-only at the database level. MySQL has no PL/pgSQL and no
        // combined "BEFORE UPDATE OR DELETE" trigger syntax, so this needs
        // two separate triggers, each raising via SIGNAL SQLSTATE. This is
        // defense-in-depth only — AuditLog.php already enforces the same
        // guarantee in PHP (no entity setters, plus PreUpdate/PreRemove
        // lifecycle callbacks that throw unconditionally).
        $this->addSql(<<<'SQL'
            CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log
            FOR EACH ROW BEGIN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AuditLog records cannot be modified or deleted';
            END
            SQL);
        $this->addSql(<<<'SQL'
            CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log
            FOR EACH ROW BEGIN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AuditLog records cannot be modified or deleted';
            END
            SQL);

        // Reference-data seed, carried over from the deleted Postgres
        // migrations (Version20260710075155 / Version20260710082730) —
        // doctrine:migrations:diff only captures schema (DDL), not the
        // INSERT statements those migrations also contained, so this
        // needs to be re-added by hand rather than something the diff
        // could regenerate.
        $now = (new \DateTimeImmutable())->format('Y-m-d H:i:s');

        $canonicalCompetencies = [
            ['Teamwork', 1],
            ['Integrity', 2],
            ['Professionalism', 3],
            ['Service Excellence', 4],
        ];
        foreach ($canonicalCompetencies as [$name, $sortOrder]) {
            $this->addSql(
                'INSERT INTO competency (id, name, applicable_to, is_core, sort_order, is_active) VALUES (?, ?, ?, ?, ?, ?)',
                [Uuid::v7()->toRfc4122(), $name, 'ALL', true, $sortOrder, true],
            );
        }

        $perspectives = [
            ['Financial', 1, '0.3000', 4, null, 6],
            ['Customer', 2, '0.3000', 4, null, 6],
            ['Internal Business Processes', 3, '0.2000', 4, null, 6],
            ['Learning and Growth', 4, '0.2000', 4, null, 6],
        ];
        foreach ($perspectives as [$name, $sortOrder, $weightCap, $maxKdCount, $weightCapMgr, $maxKdCountMgr]) {
            $this->addSql(
                'INSERT INTO bsc_perspective (id, name, sort_order, weight_cap, max_kd_count, weight_cap_mgr, max_kd_count_mgr) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [Uuid::v7()->toRfc4122(), $name, $sortOrder, $weightCap, $maxKdCount, $weightCapMgr, $maxKdCountMgr],
            );
        }

        $descriptors = [
            [1, '0.00', '1.99', 'Below Standard', 'Unacceptable'],
            [2, '2.00', '2.99', 'Generally Performing', 'Not Satisfactory'],
            [3, '3.00', '3.99', 'Fully Competent', 'Satisfactory'],
            [4, '4.00', '4.99', 'Exceeds Expectations', 'Very Good'],
            [5, '5.00', '5.00', 'Outstanding', 'Outstanding'],
        ];
        foreach ($descriptors as [$sortOrder, $minScore, $maxScore, $kdLabel, $competencyLabel]) {
            $this->addSql(
                'INSERT INTO score_descriptor (id, cycle_id, min_score, max_score, kd_label, competency_label, sort_order, created_at, updated_at) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?)',
                [Uuid::v7()->toRfc4122(), $minScore, $maxScore, $kdLabel, $competencyLabel, $sortOrder, $now, $now],
            );
        }
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs

        // Reverse the hand-written additions first (see up()) — not
        // strictly required since DROP TABLE below cascades to drop each
        // table's own triggers/indexes anyway, but explicit for clarity.
        $this->addSql('DROP TRIGGER audit_log_no_update');
        $this->addSql('DROP TRIGGER audit_log_no_delete');
        $this->addSql('DROP INDEX unique_default_sort_order ON score_descriptor');
        $this->addSql('ALTER TABLE score_descriptor DROP COLUMN sort_order_when_default');

        $this->addSql('ALTER TABLE appraisal DROP FOREIGN KEY FK_27EA2BD05EC1162');
        $this->addSql('ALTER TABLE appraisal DROP FOREIGN KEY FK_27EA2BD08C03F15C');
        $this->addSql('ALTER TABLE appraisal DROP FOREIGN KEY FK_27EA2BD0964382FF');
        $this->addSql('ALTER TABLE appraisal_bulk_import_job DROP FOREIGN KEY FK_558D2D13B03A8386');
        $this->addSql('ALTER TABLE appraisal_bulk_import_job DROP FOREIGN KEY FK_558D2D135EC1162');
        $this->addSql('ALTER TABLE appraisal_comment DROP FOREIGN KEY FK_EFA5639BDD670628');
        $this->addSql('ALTER TABLE appraisal_comment DROP FOREIGN KEY FK_EFA5639BF675F31B');
        $this->addSql('ALTER TABLE appraisal_cycle DROP FOREIGN KEY FK_1A51CE0CB03A8386');
        $this->addSql('ALTER TABLE appraisal_signature DROP FOREIGN KEY FK_A4AB0DD0DD670628');
        $this->addSql('ALTER TABLE appraisal_signature DROP FOREIGN KEY FK_A4AB0DD09588C067');
        $this->addSql('ALTER TABLE bulk_import_job DROP FOREIGN KEY FK_F95780F2B03A8386');
        $this->addSql('ALTER TABLE competency_rating DROP FOREIGN KEY FK_BA7E675ADD670628');
        $this->addSql('ALTER TABLE competency_rating DROP FOREIGN KEY FK_BA7E675AFB9F58C');
        $this->addSql('ALTER TABLE department DROP FOREIGN KEY FK_CD1DE18A727ACA70');
        $this->addSql('ALTER TABLE employee DROP FOREIGN KEY FK_5D9F75A1A76ED395');
        $this->addSql('ALTER TABLE employee DROP FOREIGN KEY FK_5D9F75A1AE80F5DF');
        $this->addSql('ALTER TABLE employee DROP FOREIGN KEY FK_5D9F75A1783E3463');
        $this->addSql('ALTER TABLE growth_plan DROP FOREIGN KEY FK_7F46147ADD670628');
        $this->addSql('ALTER TABLE growth_plan_career_plan DROP FOREIGN KEY FK_31A26F258E361B39');
        $this->addSql('ALTER TABLE growth_plan_development_need DROP FOREIGN KEY FK_F365C3D68E361B39');
        $this->addSql('ALTER TABLE growth_plan_strength_weakness DROP FOREIGN KEY FK_8C4D940C8E361B39');
        $this->addSql('ALTER TABLE growth_plan_training_need DROP FOREIGN KEY FK_B85C7A9E8E361B39');
        $this->addSql('ALTER TABLE key_deliverable DROP FOREIGN KEY FK_FA13A702DD670628');
        $this->addSql('ALTER TABLE key_deliverable DROP FOREIGN KEY FK_FA13A702EDD6CAAB');
        $this->addSql('ALTER TABLE notification DROP FOREIGN KEY FK_BF5476CAE92F8F78');
        $this->addSql('ALTER TABLE notification DROP FOREIGN KEY FK_BF5476CADD670628');
        $this->addSql('ALTER TABLE password_reset_token DROP FOREIGN KEY FK_6B7BA4B6A76ED395');
        $this->addSql('ALTER TABLE recovery_code DROP FOREIGN KEY FK_2C8D0584A76ED395');
        $this->addSql('ALTER TABLE score_descriptor DROP FOREIGN KEY FK_F218BDBA5EC1162');
        $this->addSql('ALTER TABLE user_role DROP FOREIGN KEY FK_2DE8C6A3A76ED395');
        $this->addSql('ALTER TABLE user_role DROP FOREIGN KEY FK_2DE8C6A3D60322AC');
        $this->addSql('ALTER TABLE user_bulk_import_job DROP FOREIGN KEY FK_EB8BEC7DB03A8386');
        $this->addSql('DROP TABLE appraisal');
        $this->addSql('DROP TABLE appraisal_bulk_import_job');
        $this->addSql('DROP TABLE appraisal_comment');
        $this->addSql('DROP TABLE appraisal_cycle');
        $this->addSql('DROP TABLE appraisal_signature');
        $this->addSql('DROP TABLE audit_log');
        $this->addSql('DROP TABLE bsc_perspective');
        $this->addSql('DROP TABLE bulk_import_job');
        $this->addSql('DROP TABLE competency');
        $this->addSql('DROP TABLE competency_rating');
        $this->addSql('DROP TABLE department');
        $this->addSql('DROP TABLE employee');
        $this->addSql('DROP TABLE growth_plan');
        $this->addSql('DROP TABLE growth_plan_career_plan');
        $this->addSql('DROP TABLE growth_plan_development_need');
        $this->addSql('DROP TABLE growth_plan_strength_weakness');
        $this->addSql('DROP TABLE growth_plan_training_need');
        $this->addSql('DROP TABLE key_deliverable');
        $this->addSql('DROP TABLE notification');
        $this->addSql('DROP TABLE password_reset_token');
        $this->addSql('DROP TABLE recovery_code');
        $this->addSql('DROP TABLE refresh_tokens');
        $this->addSql('DROP TABLE role');
        $this->addSql('DROP TABLE score_descriptor');
        $this->addSql('DROP TABLE user');
        $this->addSql('DROP TABLE user_role');
        $this->addSql('DROP TABLE user_bulk_import_job');
        $this->addSql('DROP TABLE messenger_messages');
    }
}
