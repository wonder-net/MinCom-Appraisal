<?php

declare(strict_types=1);

namespace App\Controller\Admin;

use App\Entity\SubCompetency;
use App\Repository\CompetencyRepository;
use App\Repository\SubCompetencyRepository;
use EasyCorp\Bundle\EasyAdminBundle\Config\Action;
use EasyCorp\Bundle\EasyAdminBundle\Config\Actions;
use EasyCorp\Bundle\EasyAdminBundle\Config\Crud;
use EasyCorp\Bundle\EasyAdminBundle\Controller\AbstractCrudController;
use EasyCorp\Bundle\EasyAdminBundle\Field\AssociationField;
use EasyCorp\Bundle\EasyAdminBundle\Field\BooleanField;
use EasyCorp\Bundle\EasyAdminBundle\Field\DateTimeField;
use EasyCorp\Bundle\EasyAdminBundle\Field\IdField;
use EasyCorp\Bundle\EasyAdminBundle\Field\IntegerField;
use EasyCorp\Bundle\EasyAdminBundle\Field\TextField;

/**
 * HR-managed list of ratable sub-items under each Mincom Core Value
 * (see SubCompetency's docblock) — genuinely full CRUD here, unlike
 * CompetencyCrudController: there's no complex cross-field validation
 * like Competency's name+category uniqueness check, just a name unique
 * within its parent (enforced at the DB level, see the entity's
 * UniqueConstraint), so plain EasyAdmin setters are enough (same
 * tradeoff AppraisalCycleCrudController documents for itself).
 *
 * Delete is deliberately disabled, though — mirrors Competency's own
 * soft-delete-only philosophy (deactivate via `isActive`, never hard
 * delete): a sub-competency already rated on live appraisals cascades
 * away its SubCompetencyRating rows on hard delete, silently breaking
 * the "shares sum to 7.5" invariant for whichever appraisals were
 * mid-cycle. Deactivating instead just stops NEW appraisals (future
 * cycle activations) from seeding a rating row for it.
 */
class SubCompetencyCrudController extends AbstractCrudController
{
    public function __construct(
        private readonly CompetencyRepository $competencies,
        private readonly SubCompetencyRepository $subCompetencies,
    ) {
    }

    public static function getEntityFqcn(): string
    {
        return SubCompetency::class;
    }

    public function createEntity(string $entityFqcn): SubCompetency
    {
        $competencies = $this->competencies->findAllOrderedBySortOrder(includeInactive: false);
        $defaultCompetency = $competencies[0] ?? throw new \RuntimeException('Cannot create a sub-competency: no competencies exist yet.');

        return new SubCompetency($defaultCompetency, '', $this->subCompetencies->findMaxSortOrder($defaultCompetency) + 1);
    }

    public function configureCrud(Crud $crud): Crud
    {
        return $crud
            ->setEntityLabelInSingular('Sub-competency')
            ->setEntityLabelInPlural('Sub-competencies')
            ->setDefaultSort(['sortOrder' => 'ASC'])
            ->setSearchFields(['name']);
    }

    public function configureActions(Actions $actions): Actions
    {
        return $actions->disable(Action::DELETE);
    }

    public function configureFields(string $pageName): iterable
    {
        return [
            IdField::new('id')->onlyOnDetail(),
            AssociationField::new('competency')->setLabel('Core value')->setFormTypeOption('choice_label', 'name'),
            TextField::new('name'),
            IntegerField::new('sortOrder')->setLabel('Sort order'),
            BooleanField::new('isActive')->setLabel('Active'),
            DateTimeField::new('createdAt')->onlyOnDetail(),
            DateTimeField::new('updatedAt')->onlyOnDetail(),
        ];
    }
}
