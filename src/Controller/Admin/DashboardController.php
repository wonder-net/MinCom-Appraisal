<?php

namespace App\Controller\Admin;

use EasyCorp\Bundle\EasyAdminBundle\Attribute\AdminDashboard;
use EasyCorp\Bundle\EasyAdminBundle\Config\Assets;
use EasyCorp\Bundle\EasyAdminBundle\Config\Dashboard;
use EasyCorp\Bundle\EasyAdminBundle\Config\MenuItem;
use EasyCorp\Bundle\EasyAdminBundle\Controller\AbstractDashboardController;
use Symfony\Component\HttpFoundation\Response;

/**
 * Ops/support admin panel — the Symfony-side equivalent of Django's
 * django-admin registrations (each app's admin.py). Gated behind the
 * `admin` firewall + HR_ADMIN/SYSTEM_ADMIN access_control rule in
 * security.yaml, entirely separate from the JWT-authenticated API.
 */
#[AdminDashboard(routePath: '/admin', routeName: 'admin')]
class DashboardController extends AbstractDashboardController
{
    public function index(): Response
    {
        return $this->redirectToRoute('admin_employee_index');
    }

    public function configureDashboard(): Dashboard
    {
        return Dashboard::new()
            // Raw HTML: rendered via `|raw` in EasyAdmin's own layout
            // template, same pattern the framework's own docs use for a
            // wordmark-style title. Mirrors the admin login page's
            // navy/light-blue treatment (templates/admin/login.html.twig)
            // rather than pulling in a logo <img> — avoids re-hitting the
            // off-root `/MinCom-Appraisal/` base-path issue that's bitten
            // hardcoded asset paths elsewhere in this app.
            ->setTitle('<strong style="letter-spacing:.5px;">MINCOM</strong> <span style="opacity:.65;font-weight:400;">Appraisal Admin</span>');
    }

    public function configureAssets(): Assets
    {
        return Assets::new()->addCssFile('css/admin-theme.css');
    }

    public function configureMenuItems(): iterable
    {
        yield MenuItem::linkToDashboard('Dashboard', 'fa fa-home');

        yield MenuItem::section('People');
        yield MenuItem::linkTo(EmployeeCrudController::class, 'Employees', 'fa fa-id-card');
        yield MenuItem::linkTo(DepartmentCrudController::class, 'Departments', 'fa fa-building');
        yield MenuItem::linkTo(UserCrudController::class, 'Users', 'fa fa-user');
        yield MenuItem::linkTo(RoleCrudController::class, 'Roles', 'fa fa-user-shield');

        yield MenuItem::section('Appraisal configuration');
        yield MenuItem::linkTo(AppraisalCycleCrudController::class, 'Appraisal Cycles', 'fa fa-calendar-days');
        yield MenuItem::linkTo(CompetencyCrudController::class, 'Competencies', 'fa fa-list-check');
        yield MenuItem::linkTo(BscPerspectiveCrudController::class, 'BSC Perspectives', 'fa fa-chart-pie');
        yield MenuItem::linkTo(ScoreDescriptorCrudController::class, 'Score Descriptors', 'fa fa-ranking-star');
        yield MenuItem::linkTo(CalibrationSessionCrudController::class, 'Calibration Sessions', 'fa fa-scale-balanced');

        yield MenuItem::section('Appraisals');
        yield MenuItem::linkTo(AppraisalCrudController::class, 'Appraisals', 'fa fa-file-lines');
        yield MenuItem::linkTo(KeyDeliverableCrudController::class, 'Key Deliverables', 'fa fa-bullseye');
        yield MenuItem::linkTo(CompetencyRatingCrudController::class, 'Competency Ratings', 'fa fa-star-half-stroke');
        yield MenuItem::linkTo(SignatureCrudController::class, 'Signatures', 'fa fa-signature');
        yield MenuItem::linkTo(CommentCrudController::class, 'Comments', 'fa fa-comments');

        yield MenuItem::section('Growth & Development');
        yield MenuItem::linkTo(GrowthPlanCrudController::class, 'Growth Plans', 'fa fa-seedling');
        yield MenuItem::linkTo(CareerPlanCrudController::class, 'Career Plans', 'fa fa-road');
        yield MenuItem::linkTo(DevelopmentNeedCrudController::class, 'Development Needs', 'fa fa-arrow-trend-up');
        yield MenuItem::linkTo(TrainingNeedCrudController::class, 'Training Needs', 'fa fa-chalkboard-user');
        yield MenuItem::linkTo(StrengthWeaknessCrudController::class, 'Strengths / Weaknesses', 'fa fa-scale-unbalanced');

        yield MenuItem::section('Bulk Imports');
        yield MenuItem::linkTo(UserBulkImportJobCrudController::class, 'User Import Jobs', 'fa fa-file-import');
        yield MenuItem::linkTo(AppraisalBulkImportJobCrudController::class, 'Appraisal Import Jobs', 'fa fa-file-import');
        yield MenuItem::linkTo(BulkImportJobCrudController::class, 'Bulk Import Jobs (legacy)', 'fa fa-file-import');

        yield MenuItem::section('Security & Sessions');
        yield MenuItem::linkTo(RefreshTokenCrudController::class, 'Refresh Tokens', 'fa fa-key');
        yield MenuItem::linkTo(RecoveryCodeCrudController::class, 'Recovery Codes', 'fa fa-life-ring');
        yield MenuItem::linkTo(PasswordResetTokenCrudController::class, 'Password Reset Tokens', 'fa fa-unlock-keyhole');
        yield MenuItem::linkTo(AuditLogCrudController::class, 'Audit Log', 'fa fa-clipboard-list');

        yield MenuItem::section('Activity');
        yield MenuItem::linkTo(NotificationCrudController::class, 'Notifications', 'fa fa-bell');
    }
}
