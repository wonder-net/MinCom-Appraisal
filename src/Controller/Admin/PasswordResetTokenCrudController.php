<?php

declare(strict_types=1);

namespace App\Controller\Admin;

use App\Entity\PasswordResetToken;
use EasyCorp\Bundle\EasyAdminBundle\Config\Action;
use EasyCorp\Bundle\EasyAdminBundle\Config\Actions;
use EasyCorp\Bundle\EasyAdminBundle\Config\Crud;
use EasyCorp\Bundle\EasyAdminBundle\Controller\AbstractCrudController;
use EasyCorp\Bundle\EasyAdminBundle\Field\AssociationField;
use EasyCorp\Bundle\EasyAdminBundle\Field\DateTimeField;
use EasyCorp\Bundle\EasyAdminBundle\Field\IdField;
use EasyCorp\Bundle\EasyAdminBundle\Field\TextField;

/**
 * View + Delete only: only a SHA-256 hash is stored (see the entity's
 * own docblock) — no live-credential exposure — but no setters exist
 * except the markUsed() domain method. Deleting a row here is a
 * legitimate "invalidate this reset link" ops action.
 */
class PasswordResetTokenCrudController extends AbstractCrudController
{
    public static function getEntityFqcn(): string
    {
        return PasswordResetToken::class;
    }

    public function configureCrud(Crud $crud): Crud
    {
        return $crud
            ->setEntityLabelInSingular('Password Reset Token')
            ->setEntityLabelInPlural('Password Reset Tokens')
            ->setDefaultSort(['createdAt' => 'DESC']);
    }

    public function configureActions(Actions $actions): Actions
    {
        return $actions->disable(Action::NEW, Action::EDIT);
    }

    public function configureFields(string $pageName): iterable
    {
        return [
            IdField::new('id')->onlyOnDetail(),
            AssociationField::new('user')->setFormTypeOption('choice_label', 'email'),
            TextField::new('tokenHash')->setLabel('Token hash (SHA-256)')->onlyOnDetail(),
            DateTimeField::new('expiresAt')->setLabel('Expires at'),
            DateTimeField::new('usedAt')->setLabel('Used at')->hideOnIndex(),
            DateTimeField::new('createdAt'),
        ];
    }
}
