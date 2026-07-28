<?php

declare(strict_types=1);

namespace App\Factory;

use App\Entity\Appraisal;
use App\Enum\AppraisalFormType;
use App\Enum\AppraisalStatus;
use Zenstruck\Foundry\Persistence\PersistentObjectFactory;

/**
 * @extends PersistentObjectFactory<Appraisal>
 */
final class AppraisalFactory extends PersistentObjectFactory
{
    public static function class(): string
    {
        return Appraisal::class;
    }

    protected function defaults(): array|callable
    {
        return [
            'cycle' => AppraisalCycleFactory::new()->active(),
            'employee' => EmployeeFactory::new(),
            'formType' => AppraisalFormType::FORM_B,
            'status' => AppraisalStatus::SELF_ASSESSMENT,
        ];
    }

    public function formA(): static
    {
        return $this->with(['formType' => AppraisalFormType::FORM_A]);
    }

    public function withStatus(AppraisalStatus $status): static
    {
        return $this->with(['status' => $status]);
    }
}
