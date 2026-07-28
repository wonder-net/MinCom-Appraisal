<?php

declare(strict_types=1);

namespace App\Controller\Admin;

use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Authentication\AuthenticationUtils;

/**
 * Login/logout for the /admin firewall (session-based, separate from the
 * API's JWT flow — see config/packages/security.yaml). Mirrors Django
 * admin's own separate login view.
 */
final class AdminLoginController extends AbstractController
{
    #[Route('/admin/login', name: 'admin_login')]
    public function login(AuthenticationUtils $authenticationUtils): Response
    {
        if ($this->getUser() !== null) {
            return $this->redirectToRoute('admin');
        }

        return $this->render('admin/login.html.twig', [
            'last_username' => $authenticationUtils->getLastUsername(),
            'error' => $authenticationUtils->getLastAuthenticationError(),
        ]);
    }

    #[Route('/admin/logout', name: 'admin_logout')]
    public function logout(): never
    {
        // Intercepted by the firewall's logout listener before this
        // ever runs (see security.yaml's `admin.logout`) — required only
        // so the `admin_logout` route exists for URL generation.
        throw new \LogicException('This method should never be reached.');
    }
}
