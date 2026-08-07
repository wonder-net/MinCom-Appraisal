<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Calibration (product roadmap item, not one of the 11 original HR
 * change requests — see CalibrationSession's docblock). One row per
 * (cycle, department); absence of a row is equivalent to PENDING.
 */
final class Version20260807213000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Calibration: calibration_session table (one row per cycle+department).';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('CREATE TABLE calibration_session (id CHAR(36) NOT NULL, status VARCHAR(20) NOT NULL, completed_at DATETIME DEFAULT NULL, notes LONGTEXT DEFAULT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, cycle_id CHAR(36) NOT NULL, department_id CHAR(36) NOT NULL, completed_by_id CHAR(36) DEFAULT NULL, INDEX IDX_53E66B315EC1162 (cycle_id), INDEX IDX_53E66B31AE80F5DF (department_id), INDEX IDX_53E66B3185ECDE76 (completed_by_id), UNIQUE INDEX unique_calibration_session_per_cycle_department (cycle_id, department_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('ALTER TABLE calibration_session ADD CONSTRAINT FK_53E66B315EC1162 FOREIGN KEY (cycle_id) REFERENCES appraisal_cycle (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE calibration_session ADD CONSTRAINT FK_53E66B31AE80F5DF FOREIGN KEY (department_id) REFERENCES department (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE calibration_session ADD CONSTRAINT FK_53E66B3185ECDE76 FOREIGN KEY (completed_by_id) REFERENCES user (id)');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE calibration_session DROP FOREIGN KEY FK_53E66B315EC1162');
        $this->addSql('ALTER TABLE calibration_session DROP FOREIGN KEY FK_53E66B31AE80F5DF');
        $this->addSql('ALTER TABLE calibration_session DROP FOREIGN KEY FK_53E66B3185ECDE76');
        $this->addSql('DROP TABLE calibration_session');
    }
}
