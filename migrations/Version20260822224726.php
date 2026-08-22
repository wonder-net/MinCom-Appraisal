<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Appraisees can now add their own sub-competencies under a core value
 * on their own appraisal (SubCompetencyRatingCreateController) — a
 * per-appraisal-only addition, never written back to HR's master
 * SubCompetency list. `sub_competency_id` becomes nullable to represent
 * such a row (see SubCompetencyRating's docblock); `name`/`sort_order`
 * move onto SubCompetencyRating itself (a denormalized copy for a
 * master-list-backed row, frozen at creation same as `max_score`; set
 * directly for a custom row, which has no master row to read them from).
 *
 * Table is empty in every environment this migration will ever run
 * against pre-launch, so the new NOT NULL columns need no default/backfill.
 */
final class Version20260822224726 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'sub_competency_rating: nullable sub_competency_id + own name/sort_order columns, for appraisee-added per-appraisal sub-competencies.';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE sub_competency_rating ADD name VARCHAR(200) NOT NULL, ADD sort_order INT NOT NULL, CHANGE sub_competency_id sub_competency_id CHAR(36) DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE sub_competency_rating DROP name, DROP sort_order, CHANGE sub_competency_id sub_competency_id CHAR(36) NOT NULL');
    }
}
