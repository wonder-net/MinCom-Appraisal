<?php

declare(strict_types=1);

namespace App\Controller\Admin;

use App\Entity\GrowthPlan;
use App\Enum\PotentialRating;
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
 * One-to-one with Appraisal (constructor-required, no setter — "New" is
 * unavailable for the same reason as AppraisalCrudController: a blank
 * form has no legitimate Appraisal to attach to, and nothing could
 * correct a placeholder afterwards). Edit covers every field that
 * genuinely has a setter (overallAssessment, promotionRecommendation,
 * potentialRating) — all encrypted free text or a plain enum, none of
 * them workflow-gated the way Appraisal's own score fields are.
 */
class GrowthPlanCrudController extends AbstractCrudController
{
    public static function getEntityFqcn(): string
    {
        return GrowthPlan::class;
    }

    public function configureCrud(Crud $crud): Crud
    {
        return $crud
            ->setEntityLabelInSingular('Growth Plan')
            ->setEntityLabelInPlural('Growth Plans')
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
            TextareaField::new('overallAssessment')->setLabel('Overall assessment')->hideOnIndex(),
            TextareaField::new('promotionRecommendation')->setLabel('Promotion recommendation')->hideOnIndex(),
            ChoiceField::new('potentialRating')->setLabel('Potential (9-box)')->setChoices([
                'Low' => PotentialRating::LOW,
                'Medium' => PotentialRating::MEDIUM,
                'High' => PotentialRating::HIGH,
            ])->renderAsBadges([
                PotentialRating::LOW->value => 'secondary',
                PotentialRating::MEDIUM->value => 'info',
                PotentialRating::HIGH->value => 'success',
            ]),
            DateTimeField::new('createdAt')->onlyOnDetail(),
            DateTimeField::new('updatedAt')->onlyOnDetail(),
        ];
    }
}
