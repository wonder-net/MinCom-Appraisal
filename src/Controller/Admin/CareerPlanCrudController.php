<?php

declare(strict_types=1);

namespace App\Controller\Admin;

use App\Entity\CareerPlan;
use EasyCorp\Bundle\EasyAdminBundle\Config\Action;
use EasyCorp\Bundle\EasyAdminBundle\Config\Actions;
use EasyCorp\Bundle\EasyAdminBundle\Config\Crud;
use EasyCorp\Bundle\EasyAdminBundle\Controller\AbstractCrudController;
use EasyCorp\Bundle\EasyAdminBundle\Field\AssociationField;
use EasyCorp\Bundle\EasyAdminBundle\Field\IdField;
use EasyCorp\Bundle\EasyAdminBundle\Field\TextField;

/**
 * View + Delete only: every field is constructor-only (no setters at
 * all), so neither New nor Edit could do anything but crash or silently
 * no-op. Deleting a bad row is still a genuinely useful ops action;
 * pretending the rest is editable would not be.
 */
class CareerPlanCrudController extends AbstractCrudController
{
    public static function getEntityFqcn(): string
    {
        return CareerPlan::class;
    }

    public function configureCrud(Crud $crud): Crud
    {
        return $crud
            ->setEntityLabelInSingular('Career Plan')
            ->setEntityLabelInPlural('Career Plans');
    }

    public function configureActions(Actions $actions): Actions
    {
        return $actions->disable(Action::NEW, Action::EDIT);
    }

    public function configureFields(string $pageName): iterable
    {
        return [
            IdField::new('id')->onlyOnDetail(),
            AssociationField::new('growthPlan')->setLabel('Growth plan'),
            TextField::new('aspiredRole')->setLabel('Aspired role')->setSortable(false),
            TextField::new('priority'),
        ];
    }
}
