<?php

declare(strict_types=1);

namespace App\Controller\Admin;

use App\Entity\AppraisalCycle;
use App\Entity\User;
use App\Enum\AppraisalCycleStatus;
use EasyCorp\Bundle\EasyAdminBundle\Config\Crud;
use EasyCorp\Bundle\EasyAdminBundle\Controller\AbstractCrudController;
use EasyCorp\Bundle\EasyAdminBundle\Field\ArrayField;
use EasyCorp\Bundle\EasyAdminBundle\Field\AssociationField;
use EasyCorp\Bundle\EasyAdminBundle\Field\BooleanField;
use EasyCorp\Bundle\EasyAdminBundle\Field\ChoiceField;
use EasyCorp\Bundle\EasyAdminBundle\Field\DateField;
use EasyCorp\Bundle\EasyAdminBundle\Field\DateTimeField;
use EasyCorp\Bundle\EasyAdminBundle\Field\IdField;
use EasyCorp\Bundle\EasyAdminBundle\Field\TextField;

/**
 * Unlike most of the other controllers added in this pass, AppraisalCycle
 * genuinely supports full CRUD: every constructor-required property
 * (periodName, startDate, endDate, selfRatingEnabled) has a real setter,
 * so an edited/admin-created cycle is never stuck with a placeholder
 * value the form can't correct. Only `createdBy` has no setter — fixed
 * to whichever admin creates the row via createEntity() below, which is
 * the correct semantic anyway (matches how the real API sets it).
 *
 * `configSnapshot` is deliberately NOT hand-editable: it's meant to be
 * an immutable audit freeze written once by ConfigSnapshotBuilder at
 * activation (POST .../activate/), not typed by hand — shown read-only
 * so an admin can still see what was frozen without being able to
 * quietly rewrite appraisal history.
 */
class AppraisalCycleCrudController extends AbstractCrudController
{
    public static function getEntityFqcn(): string
    {
        return AppraisalCycle::class;
    }

    public function createEntity(string $entityFqcn): AppraisalCycle
    {
        /** @var User $admin */
        $admin = $this->getUser();
        $today = new \DateTimeImmutable('today');

        return new AppraisalCycle('', $today, $today, $admin);
    }

    public function configureCrud(Crud $crud): Crud
    {
        return $crud
            ->setEntityLabelInSingular('Appraisal Cycle')
            ->setEntityLabelInPlural('Appraisal Cycles')
            ->setDefaultSort(['startDate' => 'DESC'])
            ->setSearchFields(['periodName']);
    }

    public function configureFields(string $pageName): iterable
    {
        return [
            IdField::new('id')->onlyOnDetail(),
            TextField::new('periodName')->setLabel('Period name'),
            DateField::new('startDate')->setLabel('Start date'),
            DateField::new('endDate')->setLabel('End date'),
            ChoiceField::new('status')->setChoices([
                'Draft' => AppraisalCycleStatus::DRAFT,
                'Active' => AppraisalCycleStatus::ACTIVE,
                'Closed' => AppraisalCycleStatus::CLOSED,
                'Archived' => AppraisalCycleStatus::ARCHIVED,
            ])->renderAsBadges([
                AppraisalCycleStatus::DRAFT->value => 'secondary',
                AppraisalCycleStatus::ACTIVE->value => 'success',
                AppraisalCycleStatus::CLOSED->value => 'warning',
                AppraisalCycleStatus::ARCHIVED->value => 'dark',
            ]),
            BooleanField::new('selfRatingEnabled')->setLabel('Self-rating enabled'),
            // Read-only: correct default (whoever created the row via
            // this panel), and there's no setter to let the form
            // override it anyway.
            AssociationField::new('createdBy')->setLabel('Created by')->setFormTypeOption('choice_label', 'email')->setDisabled(),
            ArrayField::new('configSnapshot')->setLabel('Config snapshot (frozen at activation)')->onlyOnDetail(),
            DateTimeField::new('createdAt')->onlyOnDetail(),
            DateTimeField::new('updatedAt')->onlyOnDetail(),
        ];
    }
}
