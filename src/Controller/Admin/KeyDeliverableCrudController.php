<?php

declare(strict_types=1);

namespace App\Controller\Admin;

use App\Entity\KeyDeliverable;
use EasyCorp\Bundle\EasyAdminBundle\Config\Action;
use EasyCorp\Bundle\EasyAdminBundle\Config\Actions;
use EasyCorp\Bundle\EasyAdminBundle\Config\Crud;
use EasyCorp\Bundle\EasyAdminBundle\Controller\AbstractCrudController;
use EasyCorp\Bundle\EasyAdminBundle\Field\AssociationField;
use EasyCorp\Bundle\EasyAdminBundle\Field\DateTimeField;
use EasyCorp\Bundle\EasyAdminBundle\Field\IdField;
use EasyCorp\Bundle\EasyAdminBundle\Field\IntegerField;
use EasyCorp\Bundle\EasyAdminBundle\Field\NumberField;
use EasyCorp\Bundle\EasyAdminBundle\Field\TextareaField;

/**
 * "New" unavailable: `appraisal` is constructor-required with no
 * setter, so a blank form has nothing real to attach to. Edit covers
 * everything else, including selfRating/managerRating/weightedScore —
 * these are normally computed by ScoreEngine off the parent Appraisal's
 * ratings, so hand-editing here (explicitly requested full-CRUD
 * tradeoff) can desync a KD's stored score from what the app would
 * actually compute; the real rating endpoints recompute correctly, this
 * doesn't.
 */
class KeyDeliverableCrudController extends AbstractCrudController
{
    public static function getEntityFqcn(): string
    {
        return KeyDeliverable::class;
    }

    public function configureCrud(Crud $crud): Crud
    {
        return $crud
            ->setEntityLabelInSingular('Key Deliverable')
            ->setEntityLabelInPlural('Key Deliverables')
            ->setDefaultSort(['sortOrder' => 'ASC']);
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
            AssociationField::new('perspective')->setLabel('BSC perspective'),
            TextareaField::new('description')->hideOnIndex(),
            NumberField::new('weight')->setNumDecimals(4),
            NumberField::new('selfRating')->setLabel('Self rating')->setNumDecimals(2)->hideOnIndex(),
            NumberField::new('managerRating')->setLabel('Manager rating')->setNumDecimals(2),
            NumberField::new('weightedScore')->setLabel('Weighted score')->setNumDecimals(4)->hideOnIndex(),
            IntegerField::new('sortOrder')->setLabel('Sort order')->hideOnIndex(),
            DateTimeField::new('createdAt')->onlyOnDetail(),
            DateTimeField::new('updatedAt')->onlyOnDetail(),
        ];
    }
}
