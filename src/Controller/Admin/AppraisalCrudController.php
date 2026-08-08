<?php

declare(strict_types=1);

namespace App\Controller\Admin;

use App\Entity\Appraisal;
use App\Enum\AppraisalFormType;
use App\Enum\AppraisalStatus;
use EasyCorp\Bundle\EasyAdminBundle\Config\Action;
use EasyCorp\Bundle\EasyAdminBundle\Config\Actions;
use EasyCorp\Bundle\EasyAdminBundle\Config\Crud;
use EasyCorp\Bundle\EasyAdminBundle\Controller\AbstractCrudController;
use EasyCorp\Bundle\EasyAdminBundle\Field\AssociationField;
use EasyCorp\Bundle\EasyAdminBundle\Field\ChoiceField;
use EasyCorp\Bundle\EasyAdminBundle\Field\DateTimeField;
use EasyCorp\Bundle\EasyAdminBundle\Field\IdField;
use EasyCorp\Bundle\EasyAdminBundle\Field\IntegerField;
use EasyCorp\Bundle\EasyAdminBundle\Field\NumberField;
use EasyCorp\Bundle\EasyAdminBundle\Field\TextareaField;
use EasyCorp\Bundle\EasyAdminBundle\Field\TextField;

/**
 * The core workflow record. "New" is deliberately unavailable: cycle,
 * employee, and formType are constructor-required with no setters (a
 * real appraisal can't exist without them, and there's no legitimate
 * "start blank, fill in later" state), so a generic New form would only
 * ever be able to create with placeholder values nothing could correct.
 * Creation stays where it already correctly happens — cycle
 * activation / employee onboarding.
 *
 * Edit IS enabled, for every field that has a real setter — which
 * includes `status` and the score/descriptor fields the app's own
 * ScoreEngine and WorkflowGuardService normally compute/gate. That's a
 * deliberate, explicitly-requested "full CRUD" tradeoff: editing these
 * here bypasses the workflow state machine and can desync the stored
 * score from what the KD/competency ratings actually sum to. Treat this
 * as a break-glass ops tool for fixing a genuinely stuck record, not a
 * routine editing surface — the real transition/rating endpoints keep
 * the guarantees this panel doesn't.
 */
class AppraisalCrudController extends AbstractCrudController
{
    public static function getEntityFqcn(): string
    {
        return Appraisal::class;
    }

    public function configureCrud(Crud $crud): Crud
    {
        return $crud
            ->setEntityLabelInSingular('Appraisal')
            ->setEntityLabelInPlural('Appraisals')
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
            AssociationField::new('cycle')->setFormTypeOption('choice_label', 'periodName')->setDisabled(),
            AssociationField::new('employee')->setFormTypeOption('choice_label', 'name')->setDisabled(),
            ChoiceField::new('formType')->setLabel('Form type')->setChoices([
                'Form A' => AppraisalFormType::FORM_A,
                'Form B' => AppraisalFormType::FORM_B,
            ])->setDisabled(),
            ChoiceField::new('status')->setChoices([
                'Self-assessment' => AppraisalStatus::SELF_ASSESSMENT,
                'Manager review' => AppraisalStatus::MANAGER_REVIEW,
                'Discussion' => AppraisalStatus::DISCUSSION,
                'Growth planning' => AppraisalStatus::GROWTH_PLANNING,
                'Pending sign-off' => AppraisalStatus::PENDING_SIGNOFF,
                'Signed off' => AppraisalStatus::SIGNED_OFF,
                'Disputed' => AppraisalStatus::DISPUTED,
                'Finalised' => AppraisalStatus::FINALISED,
                'Excluded' => AppraisalStatus::EXCLUDED,
                'Incomplete' => AppraisalStatus::INCOMPLETE,
            ])->renderAsBadges([
                AppraisalStatus::SELF_ASSESSMENT->value => 'secondary',
                AppraisalStatus::MANAGER_REVIEW->value => 'info',
                AppraisalStatus::DISCUSSION->value => 'info',
                AppraisalStatus::GROWTH_PLANNING->value => 'info',
                AppraisalStatus::PENDING_SIGNOFF->value => 'warning',
                AppraisalStatus::SIGNED_OFF->value => 'success',
                AppraisalStatus::DISPUTED->value => 'danger',
                AppraisalStatus::FINALISED->value => 'primary',
                AppraisalStatus::EXCLUDED->value => 'dark',
                AppraisalStatus::INCOMPLETE->value => 'dark',
            ]),
            ChoiceField::new('previousStatus')->setChoices([
                'Self-assessment' => AppraisalStatus::SELF_ASSESSMENT,
                'Manager review' => AppraisalStatus::MANAGER_REVIEW,
                'Discussion' => AppraisalStatus::DISCUSSION,
                'Growth planning' => AppraisalStatus::GROWTH_PLANNING,
                'Pending sign-off' => AppraisalStatus::PENDING_SIGNOFF,
                'Signed off' => AppraisalStatus::SIGNED_OFF,
                'Disputed' => AppraisalStatus::DISPUTED,
                'Finalised' => AppraisalStatus::FINALISED,
                'Excluded' => AppraisalStatus::EXCLUDED,
                'Incomplete' => AppraisalStatus::INCOMPLETE,
            ])->hideOnIndex(),
            DateTimeField::new('statusChangedAt')->setLabel('Status changed at')->onlyOnDetail(),
            NumberField::new('kdAverageScore')->setLabel('KPI average')->setNumDecimals(2)->hideOnIndex(),
            NumberField::new('bcAverageScore')->setLabel('Core values total')->setNumDecimals(2)->hideOnIndex(),
            NumberField::new('totalScore')->setLabel('Total score')->setNumDecimals(2),
            TextField::new('kdDescriptor')->setLabel('KPI descriptor')->hideOnIndex(),
            TextField::new('bcDescriptor')->setLabel('Core values descriptor')->hideOnIndex(),
            TextField::new('performanceDescriptor')->setLabel('Performance descriptor')->hideOnIndex(),
            AssociationField::new('escalatedExecutive')->setLabel('Escalated executive')->setFormTypeOption('choice_label', 'email')->hideOnIndex(),
            TextareaField::new('escalationReason')->setLabel('Escalation reason')->hideOnIndex(),
            IntegerField::new('signingRound')->setLabel('Signing round')->hideOnIndex(),
            // Doctrine-managed optimistic lock (#[ORM\Version]) — no
            // setter exists, and shouldn't: hand-editing this would
            // fight Doctrine's own concurrency control.
            IntegerField::new('version')->onlyOnDetail(),
            DateTimeField::new('createdAt')->onlyOnDetail(),
            DateTimeField::new('updatedAt')->onlyOnDetail(),
        ];
    }
}
