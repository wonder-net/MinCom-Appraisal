<?php

declare(strict_types=1);

namespace App\Controller\Admin;

use App\Entity\User;
use EasyCorp\Bundle\EasyAdminBundle\Config\Action;
use EasyCorp\Bundle\EasyAdminBundle\Config\Actions;
use EasyCorp\Bundle\EasyAdminBundle\Config\Crud;
use EasyCorp\Bundle\EasyAdminBundle\Controller\AbstractCrudController;
use EasyCorp\Bundle\EasyAdminBundle\Field\AssociationField;
use EasyCorp\Bundle\EasyAdminBundle\Field\BooleanField;
use EasyCorp\Bundle\EasyAdminBundle\Field\DateTimeField;
use EasyCorp\Bundle\EasyAdminBundle\Field\EmailField;
use EasyCorp\Bundle\EasyAdminBundle\Field\IdField;
use EasyCorp\Bundle\EasyAdminBundle\Field\IntegerField;
use EasyCorp\Bundle\EasyAdminBundle\Field\TextField;

/**
 * Port of apps.accounts.admin.UserAdmin, scoped down for a first version:
 * creation and deletion are deliberately NOT supported here — use the
 * existing admin-create-user API/bulk-import instead, both of which
 * correctly hash passwords and validate role assignment (reimplementing
 * that safely inside a generic CRUD form is out of scope for this pass).
 *
 * Security-sensitive fields are handled differently from Django's admin:
 * - `password` is never shown or editable here at all (Django's admin
 *   shows a change-password link; this port has no equivalent view yet,
 *   so password resets go through the existing reset-token flow instead).
 * - `mfaSecret` is never shown or editable (Django masks it behind an
 *   AJAX show/hide control with its own audit logging — reproducing
 *   that safely is out of scope here, so the simpler and safer choice
 *   is to not surface the raw secret at all).
 *
 * Editable fields are the genuine "fix a stuck record" ops surface:
 * unlocking a brute-force-locked account, deactivating a user, toggling
 * MFA enrollment off (e.g. to let a user re-enroll after losing their
 * device), and role assignment.
 */
class UserCrudController extends AbstractCrudController
{
    public static function getEntityFqcn(): string
    {
        return User::class;
    }

    public function configureCrud(Crud $crud): Crud
    {
        return $crud
            ->setEntityLabelInSingular('User')
            ->setEntityLabelInPlural('Users')
            ->setDefaultSort(['email' => 'ASC'])
            // 'fullName' deliberately excluded: it's encrypted at rest
            // (AES-256-GCM), so a SQL LIKE search would silently never
            // match — matching Django's own documented limitation
            // (AdminUserListCreateView.get()'s docblock).
            ->setSearchFields(['email']);
    }

    public function configureActions(Actions $actions): Actions
    {
        return $actions->disable(Action::NEW, Action::DELETE);
    }

    public function configureFields(string $pageName): iterable
    {
        return [
            IdField::new('id')->hideOnForm(),
            EmailField::new('email'),
            // Not sortable: the column is encrypted at rest, so sorting
            // by it at the SQL level would order by ciphertext bytes.
            TextField::new('fullName')->setLabel('Full name')->setSortable(false),
            AssociationField::new('assignedRoles')->setLabel('Roles')->autocomplete(),
            BooleanField::new('isActive')->setLabel('Active'),
            BooleanField::new('isStaff')->setLabel('Staff')->hideOnIndex(),
            BooleanField::new('isMfaEnabled')->setLabel('MFA enabled'),
            IntegerField::new('failedLoginAttempts')->setLabel('Failed login attempts')->hideOnIndex(),
            DateTimeField::new('lockedUntil')->setLabel('Locked until')->hideOnIndex(),
            DateTimeField::new('nextAttemptAfter')->setLabel('Next attempt after')->hideOnIndex(),
            DateTimeField::new('lastPasswordChange')->setLabel('Last password change')->hideOnForm(),
            DateTimeField::new('lastLogin')->setLabel('Last login')->hideOnForm(),
            DateTimeField::new('createdAt')->hideOnForm(),
            DateTimeField::new('updatedAt')->hideOnForm(),
        ];
    }
}
