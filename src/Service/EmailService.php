<?php

declare(strict_types=1);

namespace App\Service;

use Psr\Log\LoggerInterface;
use Symfony\Bridge\Twig\Mime\TemplatedEmail;
use Symfony\Component\Mailer\MailerInterface;
use Symfony\Component\Mime\Address;

/**
 * Port of the branded HTML emails sent by Django's
 * apps.accounts.tasks.send_password_reset_email, the two
 * welcome_account.html dispatch sites in apps.accounts.views (admin-create
 * and resend-invitation), and apps.notifications.tasks.send_notification_email
 * (the 14-standard-event + 2-bulk-import-completion notification emails).
 * Bulk-import per-row welcome emails (BulkImportCreator) reuse
 * sendWelcomeAccount() too.
 *
 * Django dispatches all of these via retrying Celery tasks. Password-reset/
 * welcome-account/bulk-import-completion emails are sent synchronously
 * inline here and, to preserve the "delivery failure must never fail the
 * request that triggered it" guarantee Django gets from autoretry_for,
 * send() catches and logs rather than throwing. The notification-email
 * pipeline (SendNotificationEmailMessageHandler) is different: it already
 * runs asynchronously off the `notification_email` Messenger transport, so
 * sendOrThrow() deliberately lets the exception propagate — that's what
 * lets the transport's retry_strategy actually retry, mirroring Celery's
 * `self.retry(...)` on SMTP failure.
 */
final class EmailService
{
    public function __construct(
        private readonly MailerInterface $mailer,
        private readonly string $mailerFromAddress,
        private readonly LoggerInterface $logger,
    ) {
    }

    public function sendPasswordReset(string $toEmail, string $recipientName, string $resetUrl): void
    {
        $this->send(
            $toEmail,
            'Reset your MINCOM Appraisal password',
            'emails/password_reset.html.twig',
            [
                'recipient_name' => $recipientName,
                'user_email' => $toEmail,
                'reset_url' => $resetUrl,
            ],
        );
    }

    public function sendWelcomeAccount(string $toEmail, string $recipientName, string $tempPassword, string $loginUrl): void
    {
        $this->send(
            $toEmail,
            'Welcome to the MINCOM Appraisal Platform',
            'emails/welcome_account.html.twig',
            [
                'recipient_name' => $recipientName,
                'user_email' => $toEmail,
                'temp_password' => $tempPassword,
                'login_url' => $loginUrl,
            ],
        );
    }

    /**
     * Port of the branded email sent directly by
     * apps.appraisals.tasks.execute_appraisal_bulk_import (bypasses the
     * generic notification-email pipeline for job-specific counts/URL).
     */
    public function sendAppraisalBulkImportComplete(string $toEmail, string $recipientName, int $importedCount, int $failedCount, string $resultsUrl): void
    {
        $this->send(
            $toEmail,
            'Appraisal Bulk Import Complete',
            'emails/appraisal_bulk_import_complete.html.twig',
            [
                'recipient_name' => $recipientName,
                'imported_count' => $importedCount,
                'failed_count' => $failedCount,
                'results_url' => $resultsUrl,
            ],
        );
    }

    /**
     * Port of the branded email sent directly by
     * apps.accounts.tasks._notify_completion (same bypass rationale as
     * sendAppraisalBulkImportComplete()).
     */
    public function sendUserBulkImportCompleted(string $toEmail, string $recipientName, int $totalRows, int $createdCount, int $failedCount, string $statusLabel, string $resultsUrl): void
    {
        $this->send(
            $toEmail,
            'User Bulk Import Completed',
            'emails/user_bulk_import_completed.html.twig',
            [
                'recipient_name' => $recipientName,
                'total_rows' => $totalRows,
                'created_count' => $createdCount,
                'failed_count' => $failedCount,
                'status_label' => $statusLabel,
                'results_url' => $resultsUrl,
            ],
        );
    }

    /**
     * Used only by SendNotificationEmailMessageHandler — see class
     * docblock for why this variant must not swallow exceptions.
     *
     * @param array<string, mixed> $context
     */
    public function sendOrThrow(string $to, string $subject, string $template, array $context): void
    {
        $this->mailer->send($this->buildEmail($to, $subject, $template, $context));
    }

    /**
     * @param array<string, mixed> $context
     */
    private function send(string $to, string $subject, string $template, array $context): void
    {
        try {
            $this->mailer->send($this->buildEmail($to, $subject, $template, $context));
        } catch (\Throwable $exc) {
            $this->logger->error('Failed to send email [to={to}, subject={subject}]: {message}', [
                'to' => $to,
                'subject' => $subject,
                'message' => $exc->getMessage(),
            ]);
        }
    }

    /**
     * @param array<string, mixed> $context
     */
    private function buildEmail(string $to, string $subject, string $template, array $context): TemplatedEmail
    {
        return (new TemplatedEmail())
            ->from(new Address($this->mailerFromAddress, 'MINCOM Appraisal'))
            ->to($to)
            ->subject($subject)
            ->htmlTemplate($template)
            ->context($context);
    }
}
