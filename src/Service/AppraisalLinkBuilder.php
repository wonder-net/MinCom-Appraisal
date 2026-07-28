<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\Appraisal;

/**
 * Port of apps.appraisals.tasks._appraisal_link.
 */
final class AppraisalLinkBuilder
{
    public function __construct(private readonly string $frontendUrl)
    {
    }

    public function build(Appraisal $appraisal): string
    {
        return rtrim($this->frontendUrl, '/').'/appraisals/'.$appraisal->getId();
    }
}
