<?php

declare(strict_types=1);

namespace App\Controller\Admin;

use App\Entity\ScoreDescriptor;
use EasyCorp\Bundle\EasyAdminBundle\Config\Action;
use EasyCorp\Bundle\EasyAdminBundle\Config\Actions;
use EasyCorp\Bundle\EasyAdminBundle\Config\Crud;
use EasyCorp\Bundle\EasyAdminBundle\Controller\AbstractCrudController;
use EasyCorp\Bundle\EasyAdminBundle\Field\AssociationField;
use EasyCorp\Bundle\EasyAdminBundle\Field\DateTimeField;
use EasyCorp\Bundle\EasyAdminBundle\Field\IdField;
use EasyCorp\Bundle\EasyAdminBundle\Field\IntegerField;
use EasyCorp\Bundle\EasyAdminBundle\Field\NumberField;
use EasyCorp\Bundle\EasyAdminBundle\Field\TextField;

/**
 * View + Delete only: no setters at all (a null `cycle` means "system
 * default" — these rows are meant to be seeded once and frozen into
 * each cycle's config snapshot on activation, not hand-edited
 * afterwards; see the entity's own docblock).
 */
class ScoreDescriptorCrudController extends AbstractCrudController
{
    public static function getEntityFqcn(): string
    {
        return ScoreDescriptor::class;
    }

    public function configureCrud(Crud $crud): Crud
    {
        return $crud
            ->setEntityLabelInSingular('Score Descriptor')
            ->setEntityLabelInPlural('Score Descriptors')
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
            AssociationField::new('cycle')->setFormTypeOption('choice_label', 'periodName'),
            NumberField::new('minScore')->setLabel('Min score')->setNumDecimals(2),
            NumberField::new('maxScore')->setLabel('Max score')->setNumDecimals(2),
            TextField::new('kdLabel')->setLabel('KPI label'),
            TextField::new('competencyLabel')->setLabel('Competency label'),
            IntegerField::new('sortOrder')->setLabel('Sort order'),
            DateTimeField::new('createdAt')->onlyOnDetail(),
            DateTimeField::new('updatedAt')->onlyOnDetail(),
        ];
    }
}
