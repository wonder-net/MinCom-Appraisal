<?php

declare(strict_types=1);

namespace App\Controller\Admin;

use App\Entity\AuditLog;
use EasyCorp\Bundle\EasyAdminBundle\Config\Action;
use EasyCorp\Bundle\EasyAdminBundle\Config\Actions;
use EasyCorp\Bundle\EasyAdminBundle\Config\Crud;
use EasyCorp\Bundle\EasyAdminBundle\Controller\AbstractCrudController;
use EasyCorp\Bundle\EasyAdminBundle\Field\ArrayField;
use EasyCorp\Bundle\EasyAdminBundle\Field\DateTimeField;
use EasyCorp\Bundle\EasyAdminBundle\Field\IdField;
use EasyCorp\Bundle\EasyAdminBundle\Field\TextField;

/**
 * View-only — the one entity in this pass where that's not a design
 * choice but a hard technical wall. AuditLog enforces append-only THREE
 * separate ways (see the entity's own docblock): no setters, a
 * `#[ORM\PreUpdate]`/`#[ORM\PreRemove]` pair that unconditionally
 * `throw`s, and a DB-level trigger as a backstop. Enabling Edit or
 * Delete here wouldn't just be risky, it would be broken — clicking
 * either throws a LogicException, every time, no matter who's asking.
 * The tamper-evident hash chain is the entire point of this table.
 */
class AuditLogCrudController extends AbstractCrudController
{
    public static function getEntityFqcn(): string
    {
        return AuditLog::class;
    }

    public function configureCrud(Crud $crud): Crud
    {
        return $crud
            ->setEntityLabelInSingular('Audit Log Entry')
            ->setEntityLabelInPlural('Audit Log')
            ->setDefaultSort(['timestamp' => 'DESC'])
            ->setSearchFields(['action', 'resourceType']);
    }

    public function configureActions(Actions $actions): Actions
    {
        return $actions->disable(Action::NEW, Action::EDIT, Action::DELETE);
    }

    public function configureFields(string $pageName): iterable
    {
        return [
            IdField::new('id')->onlyOnDetail(),
            TextField::new('action'),
            TextField::new('resourceType')->setLabel('Resource type'),
            TextField::new('resourceId')->setLabel('Resource ID')->onlyOnDetail(),
            TextField::new('userId')->setLabel('User ID')->hideOnIndex(),
            TextField::new('ipAddress')->setLabel('IP address')->hideOnIndex(),
            DateTimeField::new('timestamp'),
            ArrayField::new('metadata')->onlyOnDetail(),
            TextField::new('oldValueHash')->setLabel('Old value hash')->onlyOnDetail(),
            TextField::new('newValueHash')->setLabel('New value hash')->onlyOnDetail(),
            TextField::new('previousHash')->setLabel('Previous hash (chain)')->onlyOnDetail(),
            TextField::new('entryHmac')->setLabel('Entry HMAC')->onlyOnDetail(),
        ];
    }
}
