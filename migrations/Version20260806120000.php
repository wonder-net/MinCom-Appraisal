<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * HR change-request batch (see /Users/wonder/.claude/plans/harmonic-mapping-sifakis.md):
 *
 *  - employee.matrix_appraiser_id: second reporting line / matrix appraiser
 *    (change #3). Self-referential FK mirroring manager_id's existing shape
 *    (nullable, ON DELETE SET NULL).
 *  - employee.photo_filename: employee profile picture (change #2), managed
 *    via EmployeeCrudController's EasyAdmin ImageField.
 *  - competency.sub_competencies: descriptive sub-competencies shown under
 *    each Mincom Core Value on the appraisal report (change #8.2) —
 *    informational only, not separately rated.
 *  - growth_plan.promotion_recommendation: promotion recommendation shown
 *    before the Signatures section on the appraisal report (change #11).
 *  - score_descriptor: the 5 system-default (cycle_id IS NULL) bands are
 *    updated to the new 0-100 point scale / labels (change #9) — see
 *    ScoreEngine's rescaled 70+30=100 total score formula (change #8).
 *    Cycle-specific frozen rows from already-activated cycles are
 *    deliberately left untouched, matching ConfigSnapshotBuilder's existing
 *    frozen-snapshot intent.
 */
final class Version20260806120000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'HR change requests: matrix appraiser + employee photo + competency sub-items + promotion recommendation + rescaled score-descriptor bands.';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE employee ADD matrix_appraiser_id CHAR(36) DEFAULT NULL, ADD photo_filename VARCHAR(255) DEFAULT NULL');
        $this->addSql('CREATE INDEX IDX_5D9F75A1E138998B ON employee (matrix_appraiser_id)');
        $this->addSql('ALTER TABLE employee ADD CONSTRAINT FK_5D9F75A1F1D74413 FOREIGN KEY (matrix_appraiser_id) REFERENCES employee (id) ON DELETE SET NULL');

        $this->addSql('ALTER TABLE competency ADD sub_competencies JSON DEFAULT NULL');

        $this->addSql('ALTER TABLE growth_plan ADD promotion_recommendation LONGTEXT DEFAULT NULL');

        // Rescaled BSC rating-scale bands: total score is now kdAvg*14 +
        // sum(core value ratings), a 0-100 scale (see ScoreEngine), so the
        // per-band bounds and labels change from the old ~0-5 scale to
        // HR's requested percentage bands. kd_label/competency_label are
        // set to the same text per band since both are now resolved via
        // percent-of-max normalisation against this one unified scale.
        $bands = [
            [1, '0.00', '49.99', 'Under Performer'],
            [2, '50.00', '59.99', 'Average Performer'],
            [3, '60.00', '69.99', 'Moderate Performer'],
            [4, '70.00', '79.99', 'Good Performer'],
            [5, '80.00', '100.00', 'Outstanding Performer'],
        ];
        foreach ($bands as [$sortOrder, $minScore, $maxScore, $label]) {
            $this->addSql(
                'UPDATE score_descriptor SET min_score = ?, max_score = ?, kd_label = ?, competency_label = ? WHERE cycle_id IS NULL AND sort_order = ?',
                [$minScore, $maxScore, $label, $label, $sortOrder],
            );
        }
    }

    public function down(Schema $schema): void
    {
        $oldBands = [
            [1, '0.00', '1.99', 'Below Standard', 'Unacceptable'],
            [2, '2.00', '2.99', 'Generally Performing', 'Not Satisfactory'],
            [3, '3.00', '3.99', 'Fully Competent', 'Satisfactory'],
            [4, '4.00', '4.99', 'Exceeds Expectations', 'Very Good'],
            [5, '5.00', '5.00', 'Outstanding', 'Outstanding'],
        ];
        foreach ($oldBands as [$sortOrder, $minScore, $maxScore, $kdLabel, $competencyLabel]) {
            $this->addSql(
                'UPDATE score_descriptor SET min_score = ?, max_score = ?, kd_label = ?, competency_label = ? WHERE cycle_id IS NULL AND sort_order = ?',
                [$minScore, $maxScore, $kdLabel, $competencyLabel, $sortOrder],
            );
        }

        $this->addSql('ALTER TABLE growth_plan DROP COLUMN promotion_recommendation');

        $this->addSql('ALTER TABLE competency DROP COLUMN sub_competencies');

        $this->addSql('ALTER TABLE employee DROP FOREIGN KEY FK_5D9F75A1F1D74413');
        $this->addSql('DROP INDEX IDX_5D9F75A1E138998B ON employee');
        $this->addSql('ALTER TABLE employee DROP COLUMN matrix_appraiser_id, DROP COLUMN photo_filename');
    }
}
