<?php

declare(strict_types=1);

namespace App\Controller\Admin;

use App\Entity\StrengthWeakness;
use App\Enum\StrengthWeaknessType;
use EasyCorp\Bundle\EasyAdminBundle\Config\Action;
use EasyCorp\Bundle\EasyAdminBundle\Config\Actions;
use EasyCorp\Bundle\EasyAdminBundle\Config\Crud;
use EasyCorp\Bundle\EasyAdminBundle\Controller\AbstractCrudController;
use EasyCorp\Bundle\EasyAdminBundle\Field\AssociationField;
use EasyCorp\Bundle\EasyAdminBundle\Field\ChoiceField;
use EasyCorp\Bundle\EasyAdminBundle\Field\IdField;
use EasyCorp\Bundle\EasyAdminBundle\Field\IntegerField;
use EasyCorp\Bundle\EasyAdminBundle\Field\TextField;

/**
 * View + Delete only: fully immutable (no setters at all).
 */
class StrengthWeaknessCrudController extends AbstractCrudController
{
    public static function getEntityFqcn(): string
    {
        return StrengthWeakness::class;
    }

    public function configureCrud(Crud $crud): Crud
    {
        return $crud
            ->setEntityLabelInSingular('Strength / Weakness')
            ->setEntityLabelInPlural('Strengths / Weaknesses')
            ->setDefaultSort(['sortOrder' => 'ASC']);
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
            ChoiceField::new('type')->setChoices([
                'Strength' => StrengthWeaknessType::STRENGTH,
                'Weakness' => StrengthWeaknessType::WEAKNESS,
            ])->renderAsBadges([
                StrengthWeaknessType::STRENGTH->value => 'success',
                StrengthWeaknessType::WEAKNESS->value => 'warning',
            ]),
            TextField::new('description')->setSortable(false),
            IntegerField::new('sortOrder')->setLabel('Sort order')->hideOnIndex(),
        ];
    }
}
