<?php

declare(strict_types=1);

namespace App\Exception;

/**
 * Port of apps.appraisals.workflow.OptimisticLockError. The requesting
 * client's `version` didn't match the appraisal's current version —
 * indicates a concurrent modification. The controller maps this to 409.
 */
final class OptimisticLockException extends \RuntimeException
{
    public function __construct(string $message = 'Version conflict. The appraisal has been modified by another user.')
    {
        parent::__construct($message);
    }
}
