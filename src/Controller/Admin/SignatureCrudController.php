<?php

declare(strict_types=1);

namespace App\Controller\Admin;

use App\Entity\Signature;
use App\Enum\AppraisalPartyRole;
use App\Enum\SignatureAction;
use EasyCorp\Bundle\EasyAdminBundle\Config\Action;
use EasyCorp\Bundle\EasyAdminBundle\Config\Actions;
use EasyCorp\Bundle\EasyAdminBundle\Config\Crud;
use EasyCorp\Bundle\EasyAdminBundle\Controller\AbstractCrudController;
use EasyCorp\Bundle\EasyAdminBundle\Field\AssociationField;
use EasyCorp\Bundle\EasyAdminBundle\Field\BooleanField;
use EasyCorp\Bundle\EasyAdminBundle\Field\ChoiceField;
use EasyCorp\Bundle\EasyAdminBundle\Field\DateTimeField;
use EasyCorp\Bundle\EasyAdminBundle\Field\IdField;
use EasyCorp\Bundle\EasyAdminBundle\Field\IntegerField;
use EasyCorp\Bundle\EasyAdminBundle\Field\TextareaField;
use EasyCorp\Bundle\EasyAdminBundle\Field\TextField;

/**
 * A legally/audit-significant record — who signed what, when, from
 * where. Only `discussed`/`reason` have setters; everything else
 * (appraisal, signer, role, action, signedAt, ipAddress, userAgentHash,
 * signingRound) is the actual evidentiary content of the signature and
 * stays visible-but-disabled rather than hidden or (worse) silently
 * forgeable through a generic form.
 */
class SignatureCrudController extends AbstractCrudController
{
    public static function getEntityFqcn(): string
    {
        return Signature::class;
    }

    public function configureCrud(Crud $crud): Crud
    {
        return $crud
            ->setEntityLabelInSingular('Signature')
            ->setEntityLabelInPlural('Signatures')
            ->setDefaultSort(['signedAt' => 'DESC']);
    }

    public function configureActions(Actions $actions): Actions
    {
        return $actions->disable(Action::NEW);
    }

    public function configureFields(string $pageName): iterable
    {
        return [
            IdField::new('id')->onlyOnDetail(),
            AssociationField::new('appraisal')->setDisabled(),
            AssociationField::new('signer')->setFormTypeOption('choice_label', 'email')->setDisabled(),
            ChoiceField::new('signerRole')->setLabel('Signer role')->setChoices([
                'Appraiser' => AppraisalPartyRole::APPRAISER,
                'Appraisee' => AppraisalPartyRole::APPRAISEE,
            ])->setDisabled(),
            ChoiceField::new('action')->setChoices([
                'Accept' => SignatureAction::ACCEPT,
                'Reject' => SignatureAction::REJECT,
                'Comments attached' => SignatureAction::COMMENTS_ATTACHED,
            ])->renderAsBadges([
                SignatureAction::ACCEPT->value => 'success',
                SignatureAction::REJECT->value => 'danger',
                SignatureAction::COMMENTS_ATTACHED->value => 'info',
            ])->setDisabled(),
            BooleanField::new('discussed'),
            TextareaField::new('reason')->hideOnIndex(),
            DateTimeField::new('signedAt')->setLabel('Signed at')->setDisabled(),
            TextField::new('ipAddress')->setLabel('IP address')->hideOnIndex()->setDisabled(),
            TextField::new('userAgentHash')->setLabel('User agent hash')->onlyOnDetail()->setDisabled(),
            IntegerField::new('signingRound')->setLabel('Signing round')->hideOnIndex()->setDisabled(),
        ];
    }
}
