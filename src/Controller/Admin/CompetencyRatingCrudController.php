<?php

declare(strict_types=1);

namespace App\Controller\Admin;

use App\Entity\CompetencyRating;
use EasyCorp\Bundle\EasyAdminBundle\Config\Action;
use EasyCorp\Bundle\EasyAdminBundle\Config\Actions;
use EasyCorp\Bundle\EasyAdminBundle\Config\Crud;
use EasyCorp\Bundle\EasyAdminBundle\Controller\AbstractCrudController;
use EasyCorp\Bundle\EasyAdminBundle\Field\AssociationField;
use EasyCorp\Bundle\EasyAdminBundle\Field\DateTimeField;
use EasyCorp\Bundle\EasyAdminBundle\Field\IdField;
use EasyCorp\Bundle\EasyAdminBundle\Field\NumberField;

/**
 * "New" unavailable: `appraisal` and `competency` are both
 * constructor-required with no setters (and paired under a per-appraisal
 * uniqueness rule the real rating endpoint enforces, not this form).
 * Edit covers selfRating/managerRating — same ScoreEngine-desync caveat
 * as KeyDeliverableCrudController.
 */
class CompetencyRatingCrudController extends AbstractCrudController
{
    public static function getEntityFqcn(): string
    {
        return CompetencyRating::class;
    }

    public function configureCrud(Crud $crud): Crud
    {
        return $crud
            ->setEntityLabelInSingular('Competency Rating')
            ->setEntityLabelInPlural('Competency Ratings')
            ->setDefaultSort(['createdAt' => 'DESC']);
    }

    public function configureActions(Actions $actions): Actions
    {
        return $actions->disable(Action::NEW);
    }

    public function configureFields(string $pageName): iterable
    {
        return [
            IdField::new('id')->onlyOnDetail(),
            AssociationField::new('appraisal')->setDisabled(),
            AssociationField::new('competency')->setDisabled(),
            NumberField::new('selfRating')->setLabel('Self rating')->setNumDecimals(2),
            NumberField::new('managerRating')->setLabel('Manager rating')->setNumDecimals(2),
            DateTimeField::new('createdAt')->onlyOnDetail(),
            DateTimeField::new('updatedAt')->onlyOnDetail(),
        ];
    }
}
