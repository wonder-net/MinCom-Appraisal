<?php

declare(strict_types=1);

namespace App\Controller\Admin;

use App\Entity\TrainingNeed;
use App\Enum\TrainingNeedPriority;
use App\Enum\TrainingNeedType;
use EasyCorp\Bundle\EasyAdminBundle\Config\Action;
use EasyCorp\Bundle\EasyAdminBundle\Config\Actions;
use EasyCorp\Bundle\EasyAdminBundle\Config\Crud;
use EasyCorp\Bundle\EasyAdminBundle\Controller\AbstractCrudController;
use EasyCorp\Bundle\EasyAdminBundle\Field\AssociationField;
use EasyCorp\Bundle\EasyAdminBundle\Field\ChoiceField;
use EasyCorp\Bundle\EasyAdminBundle\Field\IdField;
use EasyCorp\Bundle\EasyAdminBundle\Field\IntegerField;
use EasyCorp\Bundle\EasyAdminBundle\Field\TextareaField;
use EasyCorp\Bundle\EasyAdminBundle\Field\TextField;

/**
 * Narrowest editable surface of the group: only courseTitle/institution
 * have setters. growthPlan/type/description/priority/sortOrder are all
 * constructor-only (no "New" for the same reason as its siblings), and
 * stay visible-but-disabled on Edit rather than hidden — full visibility
 * without pretending they're changeable.
 */
class TrainingNeedCrudController extends AbstractCrudController
{
    public static function getEntityFqcn(): string
    {
        return TrainingNeed::class;
    }

    public function configureCrud(Crud $crud): Crud
    {
        return $crud
            ->setEntityLabelInSingular('Training Need')
            ->setEntityLabelInPlural('Training Needs')
            ->setDefaultSort(['sortOrder' => 'ASC']);
    }

    public function configureActions(Actions $actions): Actions
    {
        return $actions->disable(Action::NEW);
    }

    public function configureFields(string $pageName): iterable
    {
        return [
            IdField::new('id')->onlyOnDetail(),
            AssociationField::new('growthPlan')->setLabel('Growth plan')->setDisabled(),
            ChoiceField::new('type')->setChoices([
                'On the job' => TrainingNeedType::ON_THE_JOB,
                'Recommended course' => TrainingNeedType::RECOMMENDED_COURSE,
            ])->setDisabled(),
            TextareaField::new('description')->hideOnIndex()->setDisabled(),
            TextField::new('courseTitle')->setLabel('Course title')->hideOnIndex(),
            TextField::new('institution')->hideOnIndex(),
            ChoiceField::new('priority')->setChoices([
                '1st' => TrainingNeedPriority::FIRST,
                '2nd' => TrainingNeedPriority::SECOND,
                '3rd' => TrainingNeedPriority::THIRD,
                '4th' => TrainingNeedPriority::FOURTH,
            ])->setDisabled(),
            IntegerField::new('sortOrder')->setLabel('Sort order')->hideOnIndex()->setDisabled(),
        ];
    }
}
