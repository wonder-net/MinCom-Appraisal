<?php

declare(strict_types=1);

namespace App\Controller\Admin;

use App\Entity\CalibrationSession;
use App\Enum\CalibrationSessionStatus;
use EasyCorp\Bundle\EasyAdminBundle\Config\Action;
use EasyCorp\Bundle\EasyAdminBundle\Config\Actions;
use EasyCorp\Bundle\EasyAdminBundle\Config\Crud;
use EasyCorp\Bundle\EasyAdminBundle\Controller\AbstractCrudController;
use EasyCorp\Bundle\EasyAdminBundle\Field\AssociationField;
use EasyCorp\Bundle\EasyAdminBundle\Field\ChoiceField;
use EasyCorp\Bundle\EasyAdminBundle\Field\DateTimeField;
use EasyCorp\Bundle\EasyAdminBundle\Field\IdField;
use EasyCorp\Bundle\EasyAdminBundle\Field\TextareaField;

/**
 * View + Delete only: no setters at all — status only ever changes via
 * markComplete()/reopen() (see the entity), which enforce "COMPLETE
 * always has a completedBy" together. A generic setStatus() field would
 * let that invariant be violated, which is exactly the calibration
 * gate's whole purpose (WorkflowGuardService blocks SIGNED_OFF ->
 * FINALISED until this is COMPLETE) — so it stays out of this form
 * entirely rather than being added just to make Edit "work".
 */
class CalibrationSessionCrudController extends AbstractCrudController
{
    public static function getEntityFqcn(): string
    {
        return CalibrationSession::class;
    }

    public function configureCrud(Crud $crud): Crud
    {
        return $crud
            ->setEntityLabelInSingular('Calibration Session')
            ->setEntityLabelInPlural('Calibration Sessions')
            ->setDefaultSort(['createdAt' => 'DESC']);
    }

    public function configureActions(Actions $actions): Actions
    {
        return $actions->disable(Action::NEW, Action::EDIT);
    }

    public function configureFields(string $pageName): iterable
    {
        return [
            IdField::new('id')->onlyOnDetail(),
            AssociationField::new('cycle')->setFormTypeOption('choice_label', 'periodName'),
            AssociationField::new('department'),
            ChoiceField::new('status')->setChoices([
                'Pending' => CalibrationSessionStatus::PENDING,
                'Complete' => CalibrationSessionStatus::COMPLETE,
            ])->renderAsBadges([
                CalibrationSessionStatus::PENDING->value => 'warning',
                CalibrationSessionStatus::COMPLETE->value => 'success',
            ]),
            AssociationField::new('completedBy')->setLabel('Completed by')->setFormTypeOption('choice_label', 'email'),
            DateTimeField::new('completedAt')->setLabel('Completed at'),
            TextareaField::new('notes')->hideOnIndex(),
            DateTimeField::new('createdAt')->onlyOnDetail(),
            DateTimeField::new('updatedAt')->onlyOnDetail(),
        ];
    }
}
