<?php

declare(strict_types=1);

namespace App\Controller\Admin;

use App\Entity\UserBulkImportJob;
use App\Enum\UserBulkImportJobStatus;
use EasyCorp\Bundle\EasyAdminBundle\Config\Action;
use EasyCorp\Bundle\EasyAdminBundle\Config\Actions;
use EasyCorp\Bundle\EasyAdminBundle\Config\Crud;
use EasyCorp\Bundle\EasyAdminBundle\Controller\AbstractCrudController;
use EasyCorp\Bundle\EasyAdminBundle\Field\ArrayField;
use EasyCorp\Bundle\EasyAdminBundle\Field\AssociationField;
use EasyCorp\Bundle\EasyAdminBundle\Field\ChoiceField;
use EasyCorp\Bundle\EasyAdminBundle\Field\DateTimeField;
use EasyCorp\Bundle\EasyAdminBundle\Field\IdField;
use EasyCorp\Bundle\EasyAdminBundle\Field\IntegerField;
use EasyCorp\Bundle\EasyAdminBundle\Field\TextareaField;
use EasyCorp\Bundle\EasyAdminBundle\Field\TextField;

/**
 * "New" unavailable: `originalFilename` is constructor-set with no
 * setter. Edit covers status/storedFilePath/counts/errorMessage/preview
 * data/timestamps — all genuinely settable.
 *
 * `validationPreview`/`failedRows` carry decrypted employee PII (names,
 * emails, employee numbers — see the entity's own docblock); visible
 * here at the same access tier as Employee names elsewhere in this
 * panel, not a new exposure.
 */
class UserBulkImportJobCrudController extends AbstractCrudController
{
    public static function getEntityFqcn(): string
    {
        return UserBulkImportJob::class;
    }

    public function configureCrud(Crud $crud): Crud
    {
        return $crud
            ->setEntityLabelInSingular('User Bulk Import Job')
            ->setEntityLabelInPlural('User Bulk Import Jobs')
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
            AssociationField::new('createdBy')->setLabel('Created by')->setFormTypeOption('choice_label', 'email')->setDisabled(),
            TextField::new('originalFilename')->setLabel('Original filename')->setDisabled(),
            TextField::new('storedFilePath')->setLabel('Stored file path')->hideOnIndex(),
            ChoiceField::new('status')->setChoices([
                'Pending validation' => UserBulkImportJobStatus::PENDING_VALIDATION,
                'Validated' => UserBulkImportJobStatus::VALIDATED,
                'Validation failed' => UserBulkImportJobStatus::VALIDATION_FAILED,
                'Committing' => UserBulkImportJobStatus::COMMITTING,
                'Succeeded' => UserBulkImportJobStatus::SUCCEEDED,
                'Partial success' => UserBulkImportJobStatus::PARTIAL_SUCCESS,
                'Failed' => UserBulkImportJobStatus::FAILED,
            ])->renderAsBadges([
                UserBulkImportJobStatus::PENDING_VALIDATION->value => 'secondary',
                UserBulkImportJobStatus::VALIDATED->value => 'info',
                UserBulkImportJobStatus::VALIDATION_FAILED->value => 'danger',
                UserBulkImportJobStatus::COMMITTING->value => 'info',
                UserBulkImportJobStatus::SUCCEEDED->value => 'success',
                UserBulkImportJobStatus::PARTIAL_SUCCESS->value => 'warning',
                UserBulkImportJobStatus::FAILED->value => 'danger',
            ]),
            IntegerField::new('totalRows')->setLabel('Total rows'),
            IntegerField::new('processedRows')->setLabel('Processed rows')->hideOnIndex(),
            IntegerField::new('createdCount')->setLabel('Created count'),
            IntegerField::new('failedCount')->setLabel('Failed count'),
            TextareaField::new('errorMessage')->setLabel('Error message')->hideOnIndex(),
            ArrayField::new('validationPreview')->setLabel('Validation preview')->onlyOnDetail(),
            ArrayField::new('failedRows')->setLabel('Failed rows')->onlyOnDetail(),
            DateTimeField::new('createdAt')->onlyOnDetail(),
            DateTimeField::new('updatedAt')->onlyOnDetail(),
            DateTimeField::new('validationCompletedAt')->setLabel('Validation completed at')->onlyOnDetail(),
            DateTimeField::new('commitStartedAt')->setLabel('Commit started at')->onlyOnDetail(),
            DateTimeField::new('commitCompletedAt')->setLabel('Commit completed at')->onlyOnDetail(),
        ];
    }
}
