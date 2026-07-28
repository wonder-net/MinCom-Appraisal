<?php

declare(strict_types=1);

namespace App\Controller\Admin;

use App\Entity\BscPerspective;
use EasyCorp\Bundle\EasyAdminBundle\Config\Action;
use EasyCorp\Bundle\EasyAdminBundle\Config\Actions;
use EasyCorp\Bundle\EasyAdminBundle\Config\Crud;
use EasyCorp\Bundle\EasyAdminBundle\Controller\AbstractCrudController;
use EasyCorp\Bundle\EasyAdminBundle\Field\IdField;
use EasyCorp\Bundle\EasyAdminBundle\Field\IntegerField;
use EasyCorp\Bundle\EasyAdminBundle\Field\TextField;

/**
 * Port of apps.appraisals.admin.BSCPerspectiveAdmin. Creation is
 * deliberately NOT supported here — perspectives are fixed reference
 * data seeded by migrations; `name` has no setter (immutable after
 * creation, see the entity's docblock) so it's shown read-only. The
 * weight-cap/max-KD-count fields are genuinely operational (they tune
 * scoring rules) so they're fully editable.
 */
class BscPerspectiveCrudController extends AbstractCrudController
{
    public static function getEntityFqcn(): string
    {
        return BscPerspective::class;
    }

    public function configureCrud(Crud $crud): Crud
    {
        return $crud
            ->setEntityLabelInSingular('BSC Perspective')
            ->setEntityLabelInPlural('BSC Perspectives')
            ->setDefaultSort(['sortOrder' => 'ASC']);
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
            IntegerField::new('sortOrder')->setLabel('Sort order'),
            TextField::new('weightCap')->setLabel('Weight cap (employee)')->hideOnIndex(),
            IntegerField::new('maxKdCount')->setLabel('Max KD count (employee)')->hideOnIndex(),
            TextField::new('weightCapMgr')->setLabel('Weight cap (manager)')->hideOnIndex(),
            IntegerField::new('maxKdCountMgr')->setLabel('Max KD count (manager)')->hideOnIndex(),
        ];
    }
}
