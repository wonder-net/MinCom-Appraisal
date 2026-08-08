<?php

declare(strict_types=1);

namespace App\Controller\Admin;

use App\Entity\RecoveryCode;
use EasyCorp\Bundle\EasyAdminBundle\Config\Action;
use EasyCorp\Bundle\EasyAdminBundle\Config\Actions;
use EasyCorp\Bundle\EasyAdminBundle\Config\Crud;
use EasyCorp\Bundle\EasyAdminBundle\Controller\AbstractCrudController;
use EasyCorp\Bundle\EasyAdminBundle\Field\AssociationField;
use EasyCorp\Bundle\EasyAdminBundle\Field\BooleanField;
use EasyCorp\Bundle\EasyAdminBundle\Field\DateTimeField;
use EasyCorp\Bundle\EasyAdminBundle\Field\IdField;
use EasyCorp\Bundle\EasyAdminBundle\Field\TextField;

/**
 * View + Delete only: unlike RefreshToken, only a bcrypt hash is stored
 * (see the entity's own docblock) — no live-credential exposure either
 * way — but there's still no setter for anything except the markUsed()
 * domain method, so a generic Edit form has nothing legitimate to write.
 * Deleting a row here is a genuinely useful "revoke this recovery code"
 * ops action.
 */
class RecoveryCodeCrudController extends AbstractCrudController
{
    public static function getEntityFqcn(): string
    {
        return RecoveryCode::class;
    }

    public function configureCrud(Crud $crud): Crud
    {
        return $crud
            ->setEntityLabelInSingular('Recovery Code')
            ->setEntityLabelInPlural('Recovery Codes')
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
            TextField::new('codeHash')->setLabel('Code hash (bcrypt)')->onlyOnDetail(),
            BooleanField::new('isUsed')->setLabel('Used'),
            DateTimeField::new('usedAt')->setLabel('Used at')->hideOnIndex(),
            DateTimeField::new('createdAt'),
        ];
    }
}
