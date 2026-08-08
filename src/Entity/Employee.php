<?php

declare(strict_types=1);

namespace App\Entity;

use App\Enum\EmployeeClassification;
use App\Repository\EmployeeRepository;
use App\Service\EmployeeNumberNormalizer;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.employees.models.Employee.
 *
 * `name` is encrypted at rest (AES-256-GCM, transparent via
 * App\Doctrine\Type\EncryptedStringType), matching Django's
 * EncryptedCharField. Note: AppraisalRepository::managerEffectivenessRowsByCycle()
 * and the EasyAdmin EmployeeCrudController both had to stop doing
 * SQL-level ORDER BY/search on this column as a result — see their own
 * docblocks.
 *
 * Soft delete: deactivate() mirrors Employee.delete() in Django — never
 * hard-remove a row, just deactivate it. EmployeeRepository's default
 * finder methods filter isActive=true, mirroring Django's
 * ActiveEmployeeManager; an explicit "including inactive" method is the
 * escape hatch, mirroring Employee.all_objects.
 */
#[ORM\Entity(repositoryClass: EmployeeRepository::class)]
#[ORM\Table(name: 'employee')]
class Employee
{
    #[ORM\Id]
    #[ORM\Column(type: 'uuid', unique: true)]
    private Uuid $id;

    #[ORM\OneToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(nullable: false, unique: true, onDelete: 'CASCADE')]
    private User $user;

    #[ORM\Column(type: 'string', length: 50, unique: true)]
    private string $employeeNumber;

    #[ORM\Column(type: 'encrypted_string')]
    private string $name;

    #[ORM\Column(type: 'string', length: 255)]
    private string $jobTitle;

    #[ORM\ManyToOne(targetEntity: Department::class)]
    #[ORM\JoinColumn(nullable: false)]
    private Department $department;

    #[ORM\Column(type: 'string', length: 255)]
    private string $jobFamily = '';

    #[ORM\Column(type: 'string', length: 255)]
    private string $location = '';

    #[ORM\Column(type: 'string', length: 20, enumType: EmployeeClassification::class)]
    private EmployeeClassification $classification;

    #[ORM\ManyToOne(targetEntity: self::class)]
    #[ORM\JoinColumn(name: 'manager_id', nullable: true, onDelete: 'SET NULL')]
    private ?self $manager = null;

    /**
     * Second reporting line (HR change request #3, "Matrix Structure /
     * 2 Reporting Lines"). Optional — most employees only have a
     * `manager`. When set, an appraisal isn't finalized until BOTH the
     * manager and the matrix appraiser have accepted it (see
     * SignAppraisalService::countRequiredAppraisers()).
     */
    #[ORM\ManyToOne(targetEntity: self::class)]
    #[ORM\JoinColumn(name: 'matrix_appraiser_id', nullable: true, onDelete: 'SET NULL')]
    private ?self $matrixAppraiser = null;

    /**
     * Stored filename of the employee's profile picture (HR change
     * request #2), relative to the upload directory configured on
     * EmployeeCrudController's ImageField. Null when no photo has been
     * uploaded.
     */
    #[ORM\Column(type: 'string', length: 255, nullable: true)]
    private ?string $photoFilename = null;

    #[ORM\Column(type: 'boolean')]
    private bool $isActive = true;

    #[ORM\Column(type: 'datetime_immutable')]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column(type: 'datetime_immutable')]
    private \DateTimeImmutable $updatedAt;

    public function __construct(
        User $user,
        string $employeeNumber,
        string $name,
        string $jobTitle,
        Department $department,
        EmployeeClassification $classification,
    ) {
        $this->id = Uuid::v7();
        $this->user = $user;
        $this->employeeNumber = EmployeeNumberNormalizer::normalize($employeeNumber);
        $this->name = $name;
        $this->jobTitle = $jobTitle;
        $this->department = $department;
        $this->classification = $classification;
        $this->createdAt = new \DateTimeImmutable();
        $this->updatedAt = new \DateTimeImmutable();
    }

    #[ORM\PreUpdate]
    public function touch(): void
    {
        $this->updatedAt = new \DateTimeImmutable();
    }

    public function getId(): Uuid
    {
        return $this->id;
    }

    public function getUser(): User
    {
        return $this->user;
    }

    public function getEmployeeNumber(): string
    {
        return $this->employeeNumber;
    }

    public function setEmployeeNumber(string $employeeNumber): void
    {
        $this->employeeNumber = EmployeeNumberNormalizer::normalize($employeeNumber);
    }

    public function getName(): string
    {
        return $this->name;
    }

    public function setName(string $name): void
    {
        $this->name = $name;
    }

    public function getJobTitle(): string
    {
        return $this->jobTitle;
    }

    public function setJobTitle(string $jobTitle): void
    {
        $this->jobTitle = $jobTitle;
    }

    public function getDepartment(): Department
    {
        return $this->department;
    }

    public function setDepartment(Department $department): void
    {
        $this->department = $department;
    }

    public function getJobFamily(): string
    {
        return $this->jobFamily;
    }

    public function setJobFamily(string $jobFamily): void
    {
        $this->jobFamily = $jobFamily;
    }

    public function getLocation(): string
    {
        return $this->location;
    }

    public function setLocation(string $location): void
    {
        $this->location = $location;
    }

    public function getClassification(): EmployeeClassification
    {
        return $this->classification;
    }

    public function setClassification(EmployeeClassification $classification): void
    {
        $this->classification = $classification;
    }

    public function getManager(): ?self
    {
        return $this->manager;
    }

    public function setManager(?self $manager): void
    {
        $this->manager = $manager;
    }

    public function getMatrixAppraiser(): ?self
    {
        return $this->matrixAppraiser;
    }

    public function setMatrixAppraiser(?self $matrixAppraiser): void
    {
        $this->matrixAppraiser = $matrixAppraiser;
    }

    public function getPhotoFilename(): ?string
    {
        return $this->photoFilename;
    }

    public function setPhotoFilename(?string $photoFilename): void
    {
        $this->photoFilename = $photoFilename;
    }

    public function isActive(): bool
    {
        return $this->isActive;
    }

    public function setIsActive(bool $isActive): void
    {
        $this->isActive = $isActive;
        $this->touch();
    }

    /**
     * Soft delete: mirrors Employee.delete() in Django.
     */
    public function deactivate(): void
    {
        $this->setIsActive(false);
    }

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function getUpdatedAt(): \DateTimeImmutable
    {
        return $this->updatedAt;
    }

    /**
     * Lets EasyAdmin's AssociationField (manager, matrixAppraiser) render
     * a readable label instead of falling back to "Employee #<uuid>".
     * Safe to include the encrypted `name` field here: by the time this
     * runs, Doctrine has already transparently decrypted it for the
     * in-memory entity, same as any other getter.
     */
    public function __toString(): string
    {
        return sprintf('%s (%s)', $this->name, $this->employeeNumber);
    }
}
