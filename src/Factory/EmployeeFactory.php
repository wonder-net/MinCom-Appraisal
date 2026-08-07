<?php

declare(strict_types=1);

namespace App\Factory;

use App\Entity\Employee;
use App\Enum\EmployeeClassification;
use Zenstruck\Foundry\Persistence\PersistentObjectFactory;

/**
 * @extends PersistentObjectFactory<Employee>
 */
final class EmployeeFactory extends PersistentObjectFactory
{
    public static function class(): string
    {
        return Employee::class;
    }

    protected function defaults(): array|callable
    {
        return [
            'user' => UserFactory::new(),
            'employeeNumber' => 'EMP-'.self::faker()->unique()->numberBetween(10000, 99999),
            'name' => self::faker()->name(),
            'jobTitle' => self::faker()->jobTitle(),
            'department' => DepartmentFactory::new(),
            'classification' => EmployeeClassification::NON_MANAGERIAL,
        ];
    }

    public function managerial(): static
    {
        return $this->with(['classification' => EmployeeClassification::MANAGERIAL]);
    }

    public function withManager(Employee $manager): static
    {
        return $this->afterInstantiate(static function (Employee $employee) use ($manager): void {
            $employee->setManager($manager);
        });
    }

    public function withMatrixAppraiser(Employee $matrixAppraiser): static
    {
        return $this->afterInstantiate(static function (Employee $employee) use ($matrixAppraiser): void {
            $employee->setMatrixAppraiser($matrixAppraiser);
        });
    }

    public function inactive(): static
    {
        return $this->afterInstantiate(static function (Employee $employee): void {
            $employee->deactivate();
        });
    }
}
