<?php

declare(strict_types=1);

namespace App\Service;

use Dompdf\Dompdf;
use Dompdf\Options;
use Twig\Environment;

/**
 * Port of apps.reports.views._render_pdf, replacing WeasyPrint with
 * dompdf/dompdf (pure PHP, no system binary — see the reports app port
 * plan's rationale for this choice over KnpSnappyBundle/wkhtmltopdf).
 * Renders a Twig template to HTML, then to PDF bytes, A4 portrait.
 *
 * setIsPhpEnabled(true): dompdf has no support for the CSS Paged Media
 * `@bottom-center`/`@bottom-right` margin boxes WeasyPrint uses for the
 * running footer (page number, system name) — they're silently ignored,
 * not an error, so the footer would otherwise just never render (found
 * during a visual diff against the Django/WeasyPrint output — see
 * templates/pdf/base_pdf.html.twig). The footer is instead drawn via
 * dompdf's own `<script type="text/php">` + Canvas::page_text()
 * mechanism, its documented way of doing repeating per-page content.
 * This is safe here specifically because the evaluated script is a
 * fixed, hardcoded string baked into our own template files — never
 * derived from request/database data (Twig already auto-escapes any
 * variable output elsewhere in these templates) — so nothing renders
 * this HTML from an untrusted source.
 */
final class PdfRenderer
{
    public function __construct(private readonly Environment $twig)
    {
    }

    /**
     * @param array<string, mixed> $context
     */
    public function render(string $template, array $context): string
    {
        $html = $this->twig->render($template, $context);

        $options = new Options();
        $options->setIsRemoteEnabled(false);
        $options->setIsHtml5ParserEnabled(true);
        $options->setIsPhpEnabled(true);

        $dompdf = new Dompdf($options);
        $dompdf->setPaper('A4', 'portrait');
        $dompdf->loadHtml($html);
        $dompdf->render();

        return $dompdf->output();
    }
}
