<?php

declare(strict_types=1);

namespace App\Controller\Admin;

use App\Entity\Comment;
use App\Enum\AppraisalPartyRole;
use EasyCorp\Bundle\EasyAdminBundle\Config\Action;
use EasyCorp\Bundle\EasyAdminBundle\Config\Actions;
use EasyCorp\Bundle\EasyAdminBundle\Config\Crud;
use EasyCorp\Bundle\EasyAdminBundle\Controller\AbstractCrudController;
use EasyCorp\Bundle\EasyAdminBundle\Field\AssociationField;
use EasyCorp\Bundle\EasyAdminBundle\Field\ChoiceField;
use EasyCorp\Bundle\EasyAdminBundle\Field\DateTimeField;
use EasyCorp\Bundle\EasyAdminBundle\Field\IdField;
use EasyCorp\Bundle\EasyAdminBundle\Field\TextField;

/**
 * View + Delete only: append-only by design (no updatedAt column even —
 * see the entity's own docblock, "comments are never edited once
 * created") and has no setters at all. Deleting a genuinely bad comment
 * is still meaningful; editing one would misrepresent the discussion
 * record.
 */
class CommentCrudController extends AbstractCrudController
{
    public static function getEntityFqcn(): string
    {
        return Comment::class;
    }

    public function configureCrud(Crud $crud): Crud
    {
        return $crud
            ->setEntityLabelInSingular('Comment')
            ->setEntityLabelInPlural('Comments')
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
            AssociationField::new('appraisal'),
            AssociationField::new('author')->setFormTypeOption('choice_label', 'email'),
            ChoiceField::new('authorRole')->setLabel('Author role')->setChoices([
                'Appraiser' => AppraisalPartyRole::APPRAISER,
                'Appraisee' => AppraisalPartyRole::APPRAISEE,
            ]),
            TextField::new('content')->setSortable(false),
            DateTimeField::new('createdAt'),
        ];
    }
}
