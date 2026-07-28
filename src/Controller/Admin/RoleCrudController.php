<?php

declare(strict_types=1);

namespace App\Controller\Admin;

use App\Entity\Role;
use App\Enum\RoleName;
use EasyCorp\Bundle\EasyAdminBundle\Config\Action;
use EasyCorp\Bundle\EasyAdminBundle\Config\Actions;
use EasyCorp\Bundle\EasyAdminBundle\Config\Crud;
use EasyCorp\Bundle\EasyAdminBundle\Controller\AbstractCrudController;
use EasyCorp\Bundle\EasyAdminBundle\Field\ChoiceField;
use EasyCorp\Bundle\EasyAdminBundle\Field\IdField;

/**
 * Port of apps.accounts.admin.RoleAdmin. Read-only: the 6 RoleName enum
 * cases are fixed reference data seeded by migrations, and Role has no
 * setters at all (name is immutable after construction — see the
 * entity's docblock) — there is nothing here for an admin to safely
 * create or edit. Role assignment happens on the User entity instead.
 */
class RoleCrudController extends AbstractCrudController
{
    public static function getEntityFqcn(): string
    {
        return Role::class;
    }

    public function configureCrud(Crud $crud): Crud
    {
        return $crud
            ->setEntityLabelInSingular('Role')
            ->setEntityLabelInPlural('Roles')
            ->setDefaultSort(['name' => 'ASC']);
    }

    public function configureActions(Actions $actions): Actions
    {
        return $actions->disable(Action::NEW, Action::EDIT, Action::DELETE);
    }

    public function configureFields(string $pageName): iterable
    {
        return [
            IdField::new('id')->hideOnForm(),
            // ChoiceField (not TextField): RoleName is a backed enum with
            // no __toString(), and TextField's template embeds the raw
            // field value in an HTML `title` attribute, which fails to
            // cast a bare enum instance to string. ChoiceField's template
            // only ever renders field.formattedValue, sidestepping that
            // entirely — formatValue() (not setChoices(), whose mapping
            // isn't used for plain, non-badge display) supplies the label.
            ChoiceField::new('name')
                ->setChoices(array_combine(
                    array_map(static fn (RoleName $r): string => $r->label(), RoleName::cases()),
                    RoleName::cases(),
                ))
                ->formatValue(static fn (mixed $value): string => $value instanceof RoleName ? $value->label() : (string) $value),
        ];
    }
}
