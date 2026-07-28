<?php

declare(strict_types=1);

namespace App\Controller\Admin;

use App\Entity\Department;
use EasyCorp\Bundle\EasyAdminBundle\Config\Action;
use EasyCorp\Bundle\EasyAdminBundle\Config\Actions;
use EasyCorp\Bundle\EasyAdminBundle\Config\Crud;
use EasyCorp\Bundle\EasyAdminBundle\Controller\AbstractCrudController;
use EasyCorp\Bundle\EasyAdminBundle\Field\AssociationField;
use EasyCorp\Bundle\EasyAdminBundle\Field\DateTimeField;
use EasyCorp\Bundle\EasyAdminBundle\Field\IdField;
use EasyCorp\Bundle\EasyAdminBundle\Field\TextField;

/**
 * Port of apps.employees.admin.DepartmentAdmin. Creation is deliberately
 * NOT supported here — departments are created via
 * DepartmentService::getOrCreateByName() (used by bulk import and
 * elsewhere); `name`/`code` have no setters (immutable after creation),
 * so they're shown read-only. `parent` (re-parenting the department
 * tree) is the one genuinely operational, fixable field.
 */
class DepartmentCrudController extends AbstractCrudController
{
    public static function getEntityFqcn(): string
    {
        return Department::class;
    }

    public function configureCrud(Crud $crud): Crud
    {
        return $crud
            ->setEntityLabelInSingular('Department')
            ->setEntityLabelInPlural('Departments')
            ->setDefaultSort(['name' => 'ASC'])
            ->setSearchFields(['name', 'code']);
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
            TextField::new('code')->setDisabled(),
            // choice_label: Department has no __toString(), which the
            // edit form's underlying EntityType needs otherwise.
            AssociationField::new('parent')->setFormTypeOption('choice_label', 'name'),
            DateTimeField::new('createdAt')->hideOnForm(),
            DateTimeField::new('updatedAt')->hideOnForm(),
        ];
    }
}
