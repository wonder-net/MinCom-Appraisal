<?php

declare(strict_types=1);

namespace App\Controller\Admin;

use App\Entity\AppraisalBulkImportJob;
use App\Enum\AppraisalBulkImportJobStatus;
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
use EasyCorp\Bundle\EasyAdminBundle\Field\TextField;

/**
 * "New" unavailable: `cycle` and `targetStatus` are constructor-set with
 * no setters, so a placeholder picked at creation could never be
 * corrected. Edit covers status/filePath/counts/failedFiles/previewData
 * /completedAt — all genuinely settable.
 */
class AppraisalBulkImportJobCrudController extends AbstractCrudController
{
    public static function getEntityFqcn(): string
    {
        return AppraisalBulkImportJob::class;
    }

    public function configureCrud(Crud $crud): Crud
    {
        return $crud
            ->setEntityLabelInSingular('Appraisal Bulk Import Job')
            ->setEntityLabelInPlural('Appraisal Bulk Import Jobs')
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
            AssociationField::new('cycle')->setFormTypeOption('choice_label', 'periodName')->setDisabled(),
            TextField::new('targetStatus')->setLabel('Target status')->setDisabled(),
            ChoiceField::new('status')->setChoices([
                'Pending' => AppraisalBulkImportJobStatus::PENDING,
                'Processing' => AppraisalBulkImportJobStatus::PROCESSING,
                'Completed' => AppraisalBulkImportJobStatus::COMPLETED,
                'Failed' => AppraisalBulkImportJobStatus::FAILED,
            ])->renderAsBadges([
                AppraisalBulkImportJobStatus::PENDING->value => 'secondary',
                AppraisalBulkImportJobStatus::PROCESSING->value => 'info',
                AppraisalBulkImportJobStatus::COMPLETED->value => 'success',
                AppraisalBulkImportJobStatus::FAILED->value => 'danger',
            ]),
            TextField::new('filePath')->setLabel('File path')->hideOnIndex(),
            IntegerField::new('totalFiles')->setLabel('Total files'),
            IntegerField::new('importedCount')->setLabel('Imported count'),
            IntegerField::new('failedCount')->setLabel('Failed count'),
            ArrayField::new('failedFiles')->setLabel('Failed files')->onlyOnDetail(),
            ArrayField::new('previewData')->setLabel('Preview data')->onlyOnDetail(),
            DateTimeField::new('createdAt')->onlyOnDetail(),
            DateTimeField::new('completedAt')->setLabel('Completed at')->hideOnIndex(),
        ];
    }
}
