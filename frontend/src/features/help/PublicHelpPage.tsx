/**
 * PublicHelpPage — Renders a single Markdown manual page for unauthenticated
 * users. Hard-blocks any article not flagged `public: true` in frontmatter.
 *
 * Intentionally does NOT call:
 *   - `useAuth` (the route is open to anonymous users)
 *   - `useBreadcrumbs` (no breadcrumb chrome on the public layout)
 *   - `isPageVisibleToRoles` (role visibility is irrelevant — `public` flag
 *     is the sole gate)
 *
 * Cross-links inside the article are rewritten to `/help/public/...` via
 * the `pathPrefix` argument threaded through `buildMdComponents`.
 */

import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getPageBySlug } from "./loader";
import { buildMdComponents } from "./HelpPage";

/**
 * Inline not-found view for the public help namespace. Mirrors the structure
 * of `HelpNotFoundPage` but routes back to `/login` and does not consume the
 * authenticated breadcrumb context (which is unavailable here).
 */
function PublicNotFoundPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-md border border-gray-200 bg-white p-8 text-center">
        <h1 className="text-xl font-semibold text-gray-900">
          Help article not found
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          The page you were looking for does not exist or is not available
          without signing in.
        </p>
        <Link
          to="/login"
          className="mt-6 inline-flex items-center rounded-md bg-secondary px-4 py-2 text-sm font-medium text-white hover:bg-secondary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2"
        >
          Back to sign in
        </Link>
      </div>
    </div>
  );
}

export function PublicHelpPage() {
  const { section: sectionParam, slug: slugParam } = useParams<{
    section: string;
    slug: string;
  }>();

  const page = useMemo(() => {
    if (!sectionParam || !slugParam) return undefined;
    const found = getPageBySlug(sectionParam, slugParam);
    // Hard guard — only `public: true` pages are reachable here. Everything
    // else (including unknown slugs) renders the not-found state.
    if (!found || found.public !== true) return undefined;
    return found;
  }, [sectionParam, slugParam]);

  if (!page) return <PublicNotFoundPage />;

  return (
    <article className="mx-auto max-w-3xl">
      <header className="mb-6">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
          {page.section}
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-gray-900">
          {page.title}
        </h1>
        {page.summary && (
          <p className="mt-2 text-sm text-gray-600">{page.summary}</p>
        )}
      </header>

      <div className="rounded-md border border-gray-200 bg-white p-6">
        <ReactMarkdown
          components={buildMdComponents(page.sectionSlug, "/help/public")}
          remarkPlugins={[remarkGfm]}
        >
          {page.body}
        </ReactMarkdown>
      </div>
    </article>
  );
}
