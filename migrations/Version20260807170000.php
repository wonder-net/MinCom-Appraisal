<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * 9-box talent grid (product roadmap item — not one of the 11 original
 * HR change requests). Adds growth_plan.potential_rating, the grid's
 * "potential" axis, set by the manager alongside the rest of their
 * growth-planning input. The other axis (performance) needed no new
 * column at all — NineBoxReportBuilder derives it directly from the
 * appraisal's existing total_score.
 */
final class Version20260807170000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '9-box talent grid: growth_plan.potential_rating.';
    }

    public function up(Schema $schema): void
    {
        $this->addSql("ALTER TABLE growth_plan ADD potential_rating VARCHAR(20) DEFAULT NULL");
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE growth_plan DROP COLUMN potential_rating');
    }
}
