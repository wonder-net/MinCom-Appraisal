<?php

declare(strict_types=1);

namespace App\Controller\Admin;

use App\Entity\Employee;
use App\Enum\EmployeeClassification;
use EasyCorp\Bundle\EasyAdminBundle\Config\Action;
use EasyCorp\Bundle\EasyAdminBundle\Config\Actions;
use EasyCorp\Bundle\EasyAdminBundle\Config\Crud;
use EasyCorp\Bundle\EasyAdminBundle\Controller\AbstractCrudController;
use EasyCorp\Bundle\EasyAdminBundle\Field\AssociationField;
use EasyCorp\Bundle\EasyAdminBundle\Field\BooleanField;
use EasyCorp\Bundle\EasyAdminBundle\Field\ChoiceField;
use EasyCorp\Bundle\EasyAdminBundle\Field\DateTimeField;
use EasyCorp\Bundle\EasyAdminBundle\Field\IdField;
use EasyCorp\Bundle\EasyAdminBundle\Field\ImageField;
use EasyCorp\Bundle\EasyAdminBundle\Field\TextField;

/**
 * Port of apps.employees.admin.EmployeeAdmin. Creation is deliberately
 * NOT supported here — employees are created via bulk import or the
 * admin-create-user flow, both of which correctly create the paired
 * User account too (an Employee can't exist without one, per the
 * entity's constructor); reimplementing that pairing safely inside a
 * generic CRUD form is out of scope for this pass.
 *
 * Unlike Django's default manager (which hides inactive employees),
 * EasyAdmin's default query here is unfiltered, so inactive employees
 * are visible too — matching Django admin's actual behaviour
 * (EmployeeAdmin.get_queryset() explicitly uses `Employee.all_objects`
 * to show everyone). No override needed: this port's
 * EmployeeRepository only applies its `isActive` filter in specific
 * named finder methods, never as a blanket default.
 */
class EmployeeCrudController extends AbstractCrudController
{
    public static function getEntityFqcn(): string
    {
        return Employee::class;
    }

    public function configureCrud(Crud $crud): Crud
    {
        return $crud
            ->setEntityLabelInSingular('Employee')
            ->setEntityLabelInPlural('Employees')
            ->setDefaultSort(['employeeNumber' => 'ASC'])
            // 'name' deliberately excluded: it's encrypted at rest
            // (AES-256-GCM), so a SQL LIKE search would silently never
            // match — matching Django's own documented limitation
            // (AdminUserListCreateView.get()'s docblock: "Employee.name
            // and User.full_name... cannot be filtered at the SQL level").
            ->setSearchFields(['employeeNumber', 'jobTitle']);
    }

    public function configureActions(Actions $actions): Actions
    {
        return $actions->disable(Action::NEW, Action::DELETE);
    }

    public function configureFields(string $pageName): iterable
    {
        return [
            IdField::new('id')->hideOnForm(),
            TextField::new('employeeNumber')->setLabel('Employee number'),
            // Not sortable: the column is encrypted at rest, so sorting
            // by it at the SQL level would order by ciphertext bytes.
            TextField::new('name')->setSortable(false),
            TextField::new('jobTitle')->setLabel('Job title'),
            // choice_label is required for the edit form's <select>:
            // neither Department nor Employee implements __toString(),
            // which Symfony's underlying EntityType needs for a plain
            // property-path-free label.
            AssociationField::new('department')->setFormTypeOption('choice_label', 'name'),
            AssociationField::new('manager')->hideOnIndex()->setFormTypeOption('choice_label', 'name'),
            // HR change request #3 ("Matrix Structure / 2 Reporting
            // Lines"): an optional second appraiser. An appraisal isn't
            // finalized until both this employee's manager AND their
            // matrix appraiser (when set) have signed off — see
            // SignAppraisalService.
            AssociationField::new('matrixAppraiser')->hideOnIndex()->setLabel('Matrix Appraiser')->setFormTypeOption('choice_label', 'name'),
            // HR change request #2: employee profile picture.
            ImageField::new('photoFilename')
                ->setLabel('Profile Picture')
                ->setUploadDir('public/uploads/employee-photos')
                ->setBasePath('uploads/employee-photos')
                ->hideOnIndex(),
            ChoiceField::new('classification')->setChoices([
                'Managerial' => EmployeeClassification::MANAGERIAL,
                'Non-managerial' => EmployeeClassification::NON_MANAGERIAL,
            ]),
            TextField::new('jobFamily')->setLabel('Job family')->hideOnIndex(),
            TextField::new('location')->hideOnIndex(),
            BooleanField::new('isActive')->setLabel('Active'),
            // Read-only: reassigning which User account owns an Employee
            // record isn't a meaningful ops fix (unlike department/manager,
            // which genuinely can be wrong and need correcting).
            AssociationField::new('user')->hideOnIndex()->setFormTypeOption('choice_label', 'email')->setDisabled(),
            DateTimeField::new('createdAt')->hideOnForm(),
            DateTimeField::new('updatedAt')->hideOnForm(),
        ];
    }
}
