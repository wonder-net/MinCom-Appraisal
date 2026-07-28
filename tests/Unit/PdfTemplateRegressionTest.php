<?php

declare(strict_types=1);

namespace App\Tests\Unit;

use PHPUnit\Framework\TestCase;

/**
 * Guards against two dompdf-specific bugs found during a visual diff
 * against the Django/WeasyPrint PDF output — both produce a PDF that
 * generates without error (so PdfExportReportsTest's `%PDF` header
 * checks don't catch them) but renders visually broken:
 *
 * 1. A universal `* { margin/padding/box-sizing }` reset that also
 *    matches `html`/`body` corrupts dompdf's @page margin box
 *    computation entirely — confirmed empirically down to two plain
 *    sibling <div>s with no other styling losing their left/top page
 *    margin. Scoping the reset to `body *` (excluding html/body) fixes
 *    it with identical visual output otherwise.
 * 2. dompdf's page_text() only substitutes its own page counters when
 *    the literal tokens "{PAGE_NUM}"/"{PAGE_COUNT}" appear in the text
 *    argument — PHP-interpolating $PAGE_NUM/$PAGE_COUNT instead bakes
 *    in whatever page the <script type="text/php"> tag itself
 *    happened to render on (typically the last), printing that same
 *    number on every page.
 */
final class PdfTemplateRegressionTest extends TestCase
{
    private const BASE_TEMPLATE = __DIR__.'/../../templates/pdf/base_pdf.html.twig';

    public function testResetSelectorIsScopedToBodyDescendantsNotHtmlOrBody(): void
    {
        $css = file_get_contents(self::BASE_TEMPLATE);

        self::assertStringNotContainsString(
            "\n    * {",
            $css,
            'A bare `* { ... }` reset breaks dompdf @page margins — scope it to `body *` instead.',
        );
        self::assertStringContainsString('body * {', $css);
    }

    public function testFooterPageNumberUsesLiteralTokensNotPhpInterpolation(): void
    {
        $template = file_get_contents(self::BASE_TEMPLATE);

        self::assertStringNotContainsString(
            '{$PAGE_NUM}',
            $template,
            'page_text() only substitutes literal "{PAGE_NUM}"/"{PAGE_COUNT}" tokens — PHP-interpolating the variables bakes in a single page number for every page.',
        );
        self::assertStringContainsString('{PAGE_NUM}', $template);
        self::assertStringContainsString('{PAGE_COUNT}', $template);
    }

    public function testPdfRendererEnablesPhpEvaluationForTheFooterScript(): void
    {
        $rendererSource = file_get_contents(__DIR__.'/../../src/Service/PdfRenderer.php');

        self::assertStringContainsString(
            'setIsPhpEnabled(true)',
            $rendererSource,
            'The footer <script type="text/php"> block in base_pdf.html.twig is a silent no-op without this.',
        );
    }
}
