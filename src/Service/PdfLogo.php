<?php

declare(strict_types=1);

namespace App\Service;

/**
 * Port of apps.reports.views._get_logo_base64: the MINCOM logo embedded
 * as a base64 data URI for reliable rendering inside the PDF engine
 * (avoids filesystem/URL resolution issues dompdf would otherwise hit).
 * Cached in memory for the lifetime of the request/worker, matching
 * Django's @lru_cache(maxsize=1).
 */
final class PdfLogo
{
    private ?string $cached = null;

    public function __construct(private readonly string $pdfLogoPath)
    {
    }

    public function base64DataUri(): string
    {
        if ($this->cached !== null) {
            return $this->cached;
        }

        if (!is_file($this->pdfLogoPath)) {
            return $this->cached = '';
        }

        $contents = file_get_contents($this->pdfLogoPath);

        return $this->cached = 'data:image/png;base64,'.base64_encode($contents);
    }
}
