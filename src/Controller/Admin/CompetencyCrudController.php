<?php

declare(strict_types=1);

namespace App\Controller\Admin;

use App\Entity\Competency;
use App\Enum\CompetencyApplicableTo;
use EasyCorp\Bundle\EasyAdminBundle\Config\Action;
use EasyCorp\Bundle\EasyAdminBundle\Config\Actions;
use EasyCorp\Bundle\EasyAdminBundle\Config\Crud;
use EasyCorp\Bundle\EasyAdminBundle\Controller\AbstractCrudController;
use EasyCorp\Bundle\EasyAdminBundle\Field\BooleanField;
use EasyCorp\Bundle\EasyAdminBundle\Field\ChoiceField;
use EasyCorp\Bundle\EasyAdminBundle\Field\IdField;
use EasyCorp\Bundle\EasyAdminBundle\Field\IntegerField;
use EasyCorp\Bundle\EasyAdminBundle\Field\TextField;

/**
 * Port of apps.competencies.admin.CompetencyAdmin. Creation is
 * deliberately NOT supported here — competencies are created through
 * the existing validated `/api/v1/admin/competencies/` endpoint (see
 * AdminCompetencyCreateController); this panel is for inspecting and
 * fixing operational fields (sort order, active/core flags) on existing
 * rows. `name` has no setter on the entity (immutable after creation,
 * see Competency's docblock), so it's shown read-only.
 */
class CompetencyCrudController extends AbstractCrudController
{
    public static function getEntityFqcn(): string
    {
        return Competency::class;
    }

    public function configureCrud(Crud $crud): Crud
    {
        return $crud
            ->setEntityLabelInSingular('Competency')
            ->setEntityLabelInPlural('Competencies')
            ->setDefaultSort(['sortOrder' => 'ASC']);
    }

    public function configureActions(Actions $actions): Actions
    {
        return $actions->disable(Action::NEW, Action::DELETE);
    }

    public function configureFields(string $pageName): iterable
    {
        return [
            IdField::new('id')->hideOnForm(),
            TextField::new('name')->setDisabled(),
            ChoiceField::new('applicableTo')->setChoices([
                'All' => CompetencyApplicableTo::ALL,
                'Managerial' => CompetencyApplicableTo::MANAGERIAL,
                'Non-managerial' => CompetencyApplicableTo::NON_MANAGERIAL,
            ]),
            BooleanField::new('isCore')->setLabel('Core'),
            BooleanField::new('isActive')->setLabel('Active'),
            IntegerField::new('sortOrder')->setLabel('Sort order'),
        ];
    }
}
