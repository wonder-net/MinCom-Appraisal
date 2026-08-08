<?php

declare(strict_types=1);

namespace App\Controller\Admin;

use App\Entity\RefreshToken;
use EasyCorp\Bundle\EasyAdminBundle\Config\Crud;
use EasyCorp\Bundle\EasyAdminBundle\Controller\AbstractCrudController;
use EasyCorp\Bundle\EasyAdminBundle\Field\DateTimeField;
use EasyCorp\Bundle\EasyAdminBundle\Field\IdField;
use EasyCorp\Bundle\EasyAdminBundle\Field\TextField;

/**
 * !! SECURITY-SENSITIVE !! `refreshToken` is a live bearer credential
 * stored in PLAINTEXT (Gesdinet's design, not this app's) — the refresh
 * endpoint authenticates by looking the string up in this table, not by
 * verifying a signature. Anyone who can read a row here can impersonate
 * that session; anyone who can write one can literally type a chosen
 * string into the `refreshToken` field and use it to mint a valid
 * access token for `username`, no password required.
 *
 * Full CRUD is enabled anyway — genuinely no technical blocker (no-arg
 * constructor, real setters throughout) and explicitly requested
 * ("full CRUD, no exceptions") after this exact risk was disclosed. But
 * unlike everything else in this pass, restricting this one is a pure
 * policy call, not a feasibility one — flagged prominently here (and to
 * whoever's reading this later) in case that trade lands differently
 * once it's not hypothetical. `admin` firewall access already implies
 * HR_ADMIN/SYSTEM_ADMIN trust, same as every other screen in this panel.
 *
 * A legitimate, lower-risk use of this screen: deleting a row to force
 * that session to re-authenticate (revoke access without touching the
 * user's password) — no need to ever touch `refreshToken` itself for
 * that.
 */
class RefreshTokenCrudController extends AbstractCrudController
{
    public static function getEntityFqcn(): string
    {
        return RefreshToken::class;
    }

    public function configureCrud(Crud $crud): Crud
    {
        return $crud
            ->setEntityLabelInSingular('Refresh Token')
            ->setEntityLabelInPlural('Refresh Tokens (sessions)')
            ->setDefaultSort(['valid' => 'DESC'])
            ->setSearchFields(['username']);
    }

    public function configureFields(string $pageName): iterable
    {
        return [
            IdField::new('id')->onlyOnDetail(),
            TextField::new('username'),
            // Editable, not just visible: excluding it from New/Edit
            // would leave it null on create (the column is NOT NULL —
            // save would just fail) and pretend Edit is "safer" while
            // actually just being broken. See the class docblock.
            TextField::new('refreshToken')->setLabel('Refresh token'),
            DateTimeField::new('valid')->setLabel('Valid until'),
            DateTimeField::new('sessionStart')->setLabel('Session start')->hideOnForm(),
        ];
    }
}
