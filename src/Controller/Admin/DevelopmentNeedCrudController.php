<?php

declare(strict_types=1);

namespace App\Controller\Admin;

use App\Entity\DevelopmentNeed;
use App\Enum\GrowthPlanPriority;
use EasyCorp\Bundle\EasyAdminBundle\Config\Action;
use EasyCorp\Bundle\EasyAdminBundle\Config\Actions;
use EasyCorp\Bundle\EasyAdminBundle\Config\Crud;
use EasyCorp\Bundle\EasyAdminBundle\Controller\AbstractCrudController;
use EasyCorp\Bundle\EasyAdminBundle\Field\AssociationField;
use EasyCorp\Bundle\EasyAdminBundle\Field\ChoiceField;
use EasyCorp\Bundle\EasyAdminBundle\Field\IdField;
use EasyCorp\Bundle\EasyAdminBundle\Field\TextField;

/**
 * View + Delete only: fully immutable (no setters at all).
 */
class DevelopmentNeedCrudController extends AbstractCrudController
{
    public static function getEntityFqcn(): string
    {
        return DevelopmentNeed::class;
    }

    public function configureCrud(Crud $crud): Crud
    {
        return $crud
            ->setEntityLabelInSingular('Development Need')
            ->setEntityLabelInPlural('Development Needs');
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
            TextField::new('description')->setSortable(false),
            ChoiceField::new('priority')->setChoices([
                '1st' => GrowthPlanPriority::FIRST,
                '2nd' => GrowthPlanPriority::SECOND,
                '3rd' => GrowthPlanPriority::THIRD,
            ]),
        ];
    }
}
