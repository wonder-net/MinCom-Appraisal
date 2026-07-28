<?php

declare(strict_types=1);

namespace App\Controller\Admin;

use App\Entity\Notification;
use EasyCorp\Bundle\EasyAdminBundle\Config\Action;
use EasyCorp\Bundle\EasyAdminBundle\Config\Actions;
use EasyCorp\Bundle\EasyAdminBundle\Config\Crud;
use EasyCorp\Bundle\EasyAdminBundle\Controller\AbstractCrudController;
use EasyCorp\Bundle\EasyAdminBundle\Field\AssociationField;
use EasyCorp\Bundle\EasyAdminBundle\Field\BooleanField;
use EasyCorp\Bundle\EasyAdminBundle\Field\DateTimeField;
use EasyCorp\Bundle\EasyAdminBundle\Field\IdField;
use EasyCorp\Bundle\EasyAdminBundle\Field\TextareaField;
use EasyCorp\Bundle\EasyAdminBundle\Field\TextField;

/**
 * Port of apps.notifications.admin.NotificationAdmin. Read-only:
 * Notification rows are entirely system-generated (workflow transitions,
 * escalation, the overdue-reminder job) and the entity exposes no
 * general setter for `isRead` — only a one-way `markRead()` — matching
 * Django's admin, which also has no editable fields for this model.
 */
class NotificationCrudController extends AbstractCrudController
{
    public static function getEntityFqcn(): string
    {
        return Notification::class;
    }

    public function configureCrud(Crud $crud): Crud
    {
        return $crud
            ->setEntityLabelInSingular('Notification')
            ->setEntityLabelInPlural('Notifications')
            ->setDefaultSort(['createdAt' => 'DESC'])
            ->setSearchFields(['title', 'message', 'eventType']);
    }

    public function configureActions(Actions $actions): Actions
    {
        return $actions->disable(Action::NEW, Action::EDIT, Action::DELETE);
    }

    public function configureFields(string $pageName): iterable
    {
        return [
            IdField::new('id')->hideOnForm(),
            AssociationField::new('recipient'),
            TextField::new('eventType')->setLabel('Event type'),
            TextField::new('title'),
            TextareaField::new('message')->hideOnIndex(),
            BooleanField::new('isRead')->setLabel('Read'),
            AssociationField::new('appraisal')->hideOnIndex(),
            DateTimeField::new('createdAt')->setLabel('Created'),
        ];
    }
}
