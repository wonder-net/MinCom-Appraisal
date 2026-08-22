<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Sub-competencies become a real, ratable concept (previously
 * `competency.sub_competencies` was a descriptive-only JSON string
 * list — see that column's docblock in Version20260806120000). HR
 * manages a `sub_competency` list per core value (SubCompetencyCrudController);
 * each active sub-competency shares its parent's fixed 7.5-point
 * ceiling in equal parts (SubCompetencyWeightCalculator), frozen onto
 * `sub_competency_rating.max_score` at appraisal-creation time
 * (AppraisalInstanceBuilder) so the shares for one CompetencyRating
 * always sum to exactly 7.5, and a later edit to the sub-competency
 * list doesn't retroactively reweight an appraisal already in progress.
 *
 * A core competency with no sub-competencies configured keeps using
 * the pre-existing direct rating on CompetencyRating itself — nothing
 * about that legacy path changes, so already-active appraisals (which
 * predate any sub-competency existing) are unaffected by this
 * migration; no backfill is needed or attempted.
 */
final class Version20260822220000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Ratable sub-competencies: sub_competency + sub_competency_rating tables, drop the old descriptive-only competency.sub_competencies JSON column.';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('CREATE TABLE sub_competency (id CHAR(36) NOT NULL, name VARCHAR(200) NOT NULL, sort_order INT NOT NULL, is_active TINYINT NOT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, competency_id CHAR(36) NOT NULL, INDEX IDX_AC1EA7FDFB9F58C (competency_id), UNIQUE INDEX unique_competency_sub_competency_name (competency_id, name), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE sub_competency_rating (id CHAR(36) NOT NULL, max_score NUMERIC(4, 2) NOT NULL, self_rating NUMERIC(4, 2) DEFAULT NULL, manager_rating NUMERIC(4, 2) DEFAULT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, competency_rating_id CHAR(36) NOT NULL, sub_competency_id CHAR(36) NOT NULL, INDEX IDX_F86734B09A6BCFB7 (competency_rating_id), INDEX IDX_F86734B0C0143252 (sub_competency_id), UNIQUE INDEX unique_competency_rating_sub_competency (competency_rating_id, sub_competency_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('ALTER TABLE sub_competency ADD CONSTRAINT FK_AC1EA7FDFB9F58C FOREIGN KEY (competency_id) REFERENCES competency (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE sub_competency_rating ADD CONSTRAINT FK_F86734B09A6BCFB7 FOREIGN KEY (competency_rating_id) REFERENCES competency_rating (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE sub_competency_rating ADD CONSTRAINT FK_F86734B0C0143252 FOREIGN KEY (sub_competency_id) REFERENCES sub_competency (id)');
        $this->addSql('ALTER TABLE competency DROP COLUMN sub_competencies');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE sub_competency DROP FOREIGN KEY FK_AC1EA7FDFB9F58C');
        $this->addSql('ALTER TABLE sub_competency_rating DROP FOREIGN KEY FK_F86734B09A6BCFB7');
        $this->addSql('ALTER TABLE sub_competency_rating DROP FOREIGN KEY FK_F86734B0C0143252');
        $this->addSql('DROP TABLE sub_competency_rating');
        $this->addSql('DROP TABLE sub_competency');
        $this->addSql('ALTER TABLE competency ADD sub_competencies JSON DEFAULT NULL');
    }
}
