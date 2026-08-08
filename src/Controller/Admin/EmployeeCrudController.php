<?php

declare(strict_types=1);

namespace App\Controller\Admin;

use App\Entity\Employee;
use App\Enum\EmployeeClassification;
use EasyCorp\Bundle\EasyAdminBundle\Config\Action;
use EasyCorp\Bundle\EasyAdminBundle\Config\Actions;
use EasyCorp\Bundle\EasyAdminBundle\Config\Crud;
use EasyCorp\Bundle\EasyAdminBundle\Config\Filters;
use EasyCorp\Bundle\EasyAdminBundle\Controller\AbstractCrudController;
use EasyCorp\Bundle\EasyAdminBundle\Field\AssociationField;
use EasyCorp\Bundle\EasyAdminBundle\Field\BooleanField;
use EasyCorp\Bundle\EasyAdminBundle\Field\ChoiceField;
use EasyCorp\Bundle\EasyAdminBundle\Field\DateTimeField;
use EasyCorp\Bundle\EasyAdminBundle\Field\IdField;
use EasyCorp\Bundle\EasyAdminBundle\Field\ImageField;
use EasyCorp\Bundle\EasyAdminBundle\Field\TextField;
use EasyCorp\Bundle\EasyAdminBundle\Filter\BooleanFilter;
use EasyCorp\Bundle\EasyAdminBundle\Filter\ChoiceFilter;
use EasyCorp\Bundle\EasyAdminBundle\Filter\EntityFilter;

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
 *
 * Index columns are deliberately trimmed to what an HR admin scans a
 * list for (photo, number, name, title, department, manager,
 * classification, active) — id/timestamps push to the detail page only
 * via onlyOnDetail(), and department/manager render as real names
 * (Department/Employee now implement __toString()) instead of the
 * "EntityName #<uuid>" EasyAdmin falls back to otherwise.
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
            ->setSearchFields(['employeeNumber', 'jobTitle'])
            // Having no photo and no manager (e.g. the Chief Executive,
            // or any employee HR hasn't uploaded a picture for yet) is
            // routine, not an error — an "Null" badge on every other row
            // reads as broken data. A blank cell communicates the same
            // thing without the alarm.
            ->hideNullValues();
    }

    public function configureActions(Actions $actions): Actions
    {
        return $actions->disable(Action::NEW, Action::DELETE);
    }

    public function configureFilters(Filters $filters): Filters
    {
        return $filters
            ->add(EntityFilter::new('department'))
            ->add(ChoiceFilter::new('classification')->setChoices([
                'Managerial' => EmployeeClassification::MANAGERIAL,
                'Non-managerial' => EmployeeClassification::NON_MANAGERIAL,
            ]))
            ->add(BooleanFilter::new('isActive'));
    }

    public function configureFields(string $pageName): iterable
    {
        return [
            // Pushed to the detail page only: a UUID prefix isn't useful
            // for scanning a list of employees, but still worth having
            // one click away.
            IdField::new('id')->onlyOnDetail(),
            // HR change request #2: employee profile picture. Now shown
            // on the index too (as a small circular thumbnail — see
            // admin-theme.css) so a row is recognisable at a glance,
            // same as the SPA's employee list/header.
            ImageField::new('photoFilename')
                ->setLabel('Photo')
                ->setUploadDir('public/uploads/employee-photos')
                ->setBasePath('uploads/employee-photos'),
            TextField::new('employeeNumber')->setLabel('Employee number'),
            // Not sortable: the column is encrypted at rest, so sorting
            // by it at the SQL level would order by ciphertext bytes.
            TextField::new('name')->setSortable(false),
            TextField::new('jobTitle')->setLabel('Job title'),
            AssociationField::new('department')->setFormTypeOption('choice_label', 'name'),
            // Now shown on the index too — "who does this person report
            // to" is exactly the kind of thing an HR admin scans a list
            // for, and it renders as a real name now (Employee::__toString()).
            AssociationField::new('manager')->setFormTypeOption('choice_label', 'name'),
            // HR change request #3 ("Matrix Structure / 2 Reporting
            // Lines"): an optional second appraiser. An appraisal isn't
            // finalized until both this employee's manager AND their
            // matrix appraiser (when set) have signed off — see
            // SignAppraisalService. Kept off the index: less commonly
            // needed at a glance than the primary manager.
            AssociationField::new('matrixAppraiser')->hideOnIndex()->setLabel('Matrix Appraiser')->setFormTypeOption('choice_label', 'name'),
            ChoiceField::new('classification')
                ->setChoices([
                    'Managerial' => EmployeeClassification::MANAGERIAL,
                    'Non-managerial' => EmployeeClassification::NON_MANAGERIAL,
                ])
                ->renderAsBadges([
                    EmployeeClassification::MANAGERIAL->value => 'primary',
                    EmployeeClassification::NON_MANAGERIAL->value => 'secondary',
                ]),
            TextField::new('jobFamily')->setLabel('Job family')->hideOnIndex(),
            TextField::new('location')->hideOnIndex(),
            BooleanField::new('isActive')->setLabel('Active'),
            // Read-only: reassigning which User account owns an Employee
            // record isn't a meaningful ops fix (unlike department/manager,
            // which genuinely can be wrong and need correcting).
            AssociationField::new('user')->hideOnIndex()->setFormTypeOption('choice_label', 'email')->setDisabled(),
            DateTimeField::new('createdAt')->onlyOnDetail(),
            DateTimeField::new('updatedAt')->onlyOnDetail(),
        ];
    }
}
