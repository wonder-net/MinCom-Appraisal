<?php

declare(strict_types=1);

namespace App\Controller\Admin;

use App\Entity\BulkImportJob;
use App\Entity\User;
use App\Enum\BulkImportJobStatus;
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
 * The legacy synchronous (<=500 row) bulk-import path. Genuinely
 * supports full CRUD: `createdBy` is the only constructor-required
 * field without a setter, and defaulting it to whichever admin creates
 * the row (via createEntity() below) is the correct semantic anyway —
 * every other field has a real setter.
 */
class BulkImportJobCrudController extends AbstractCrudController
{
    public static function getEntityFqcn(): string
    {
        return BulkImportJob::class;
    }

    public function createEntity(string $entityFqcn): BulkImportJob
    {
        /** @var User $admin */
        $admin = $this->getUser();

        return new BulkImportJob($admin);
    }

    public function configureCrud(Crud $crud): Crud
    {
        return $crud
            ->setEntityLabelInSingular('Bulk Import Job')
            ->setEntityLabelInPlural('Bulk Import Jobs (legacy)')
            ->setDefaultSort(['createdAt' => 'DESC']);
    }

    public function configureFields(string $pageName): iterable
    {
        return [
            IdField::new('id')->onlyOnDetail(),
            AssociationField::new('createdBy')->setLabel('Created by')->setFormTypeOption('choice_label', 'email')->setDisabled(),
            ChoiceField::new('status')->setChoices([
                'Pending' => BulkImportJobStatus::PENDING,
                'Processing' => BulkImportJobStatus::PROCESSING,
                'Completed' => BulkImportJobStatus::COMPLETED,
                'Failed' => BulkImportJobStatus::FAILED,
            ])->renderAsBadges([
                BulkImportJobStatus::PENDING->value => 'secondary',
                BulkImportJobStatus::PROCESSING->value => 'info',
                BulkImportJobStatus::COMPLETED->value => 'success',
                BulkImportJobStatus::FAILED->value => 'danger',
            ]),
            TextField::new('filePath')->setLabel('File path')->hideOnIndex(),
            IntegerField::new('totalRows')->setLabel('Total rows'),
            IntegerField::new('createdCount')->setLabel('Created count'),
            IntegerField::new('failedCount')->setLabel('Failed count'),
            ArrayField::new('failedRows')->setLabel('Failed rows')->onlyOnDetail(),
            DateTimeField::new('createdAt')->onlyOnDetail(),
            DateTimeField::new('completedAt')->setLabel('Completed at')->hideOnIndex(),
        ];
    }
}
