/**
 * HelpPage — Renders a single Markdown manual page.
 *
 * - Reads `:section` and `:slug` from the URL.
 * - Falls back to `HelpNotFoundPage` if no page matches.
 * - Disables raw HTML rendering (no `rehype-raw`) — guards against XSS.
 * - Rewrites `../screenshots/...` and `../../screenshots/...` relative
 *   image paths to `/help-screenshots/...` so they resolve from the
 *   public dir at runtime.
 * - Rewrites relative `*.md` links to internal SPA routes (drops the
 *   `.md` suffix, strips `NN-` numeric directory prefixes left over from
 *   the docs/ source layout, and routes through react-router `<Link>`).
 * - Sets breadcrumbs: Help / {section} / {page title}.
 */

import { useEffect, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAuth } from "@/auth/useAuth";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { getPageBySlug, isPageVisibleToRoles } from "./loader";
import { HelpNotFoundPage } from "./HelpNotFoundPage";

/** Rewrite a relative `../screenshots/<rest>` path to `/help-screenshots/<rest>`. */
const rewriteScreenshotSrc = (src: string | undefined): string | undefined => {
  if (!src) return src;
  // Match any number of leading `../` followed by `screenshots/`
  const match = src.match(/^(?:\.\.\/)+screenshots\/(.+)$/);
  if (match) return `/help-screenshots/${match[1]}`;
  return src;
};

/**
 * Resolve a relative markdown link href to an absolute SPA path.
 *
 * Returns `null` for hrefs that should stay as plain anchors:
 *   - Absolute URLs (`http://`, `https://`, `mailto:`, `tel:`)
 *   - In-page anchors (`#foo`)
 *   - Hrefs we can't parse
 *
 * Otherwise returns an absolute path under `pathPrefix` with the `.md`
 * extension stripped and any leading `NN-` directory prefix removed.
 *
 * `pathPrefix` defaults to `"/help"` for the authenticated route. The
 * unauthenticated public route passes `"/help/public"` so cross-links
 * inside a public article stay within the public namespace.
 */
export const resolveHelpHref = (
  href: string | undefined,
  currentSection: string,
  pathPrefix = "/help",
): string | null => {
  if (!href) return null;
  if (/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(href)) return null;
  const prefixSegments = pathPrefix.split("/").filter(Boolean);
  if (prefixSegments.length === 0) return null;
  try {
    // Build the resolution base from the same prefix so relative `..`
    // segments produce paths that compare cleanly against `prefixSegments`.
    const base = `https://placeholder/${prefixSegments.join("/")}/${currentSection}/x`;
    const resolved = new URL(href, base);
    if (resolved.origin !== "https://placeholder") return null;
    const segments = resolved.pathname
      .split("/")
      .filter(Boolean)
      .map((seg) => seg.replace(/^\d+-/, ""))
      .map((seg, i, all) =>
        i === all.length - 1 ? seg.replace(/\.md$/, "") : seg,
      );
    // Defense-in-depth: only allow links that resolve under the configured
    // prefix. A markdown link like `[x](/admin/users)` would otherwise route
    // via <Link> to a privileged path. Help content is build-bundled today
    // so this is precautionary.
    if (segments.length < prefixSegments.length) return null;
    for (let i = 0; i < prefixSegments.length; i++) {
      if (segments[i] !== prefixSegments[i]) return null;
    }
    const tail = segments.slice(prefixSegments.length);
    return "/" + [...prefixSegments, ...tail].join("/");
  } catch {
    return null;
  }
};

/** Custom <img> component used by react-markdown — applies path rewrite. */
const MdImage: Components["img"] = ({ src, alt, ...rest }) => {
  const resolved = rewriteScreenshotSrc(typeof src === "string" ? src : undefined);
  return (
    <img
      {...rest}
      src={resolved}
      alt={alt ?? ""}
      loading="lazy"
      className="my-4 max-w-full rounded-md border border-gray-200"
    />
  );
};

const ANCHOR_CLASSES =
  "text-secondary underline hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary";

/** Build the markdown component map bound to the current page's section. */
export const buildMdComponents = (
  currentSection: string,
  pathPrefix = "/help",
): Components => ({
  img: MdImage,
  h1: ({ children, ...rest }) => (
    <h2 {...rest} className="mt-6 text-xl font-semibold text-gray-900">
      {children}
    </h2>
  ),
  h2: ({ children, ...rest }) => (
    <h3 {...rest} className="mt-6 text-lg font-semibold text-gray-900">
      {children}
    </h3>
  ),
  h3: ({ children, ...rest }) => (
    <h4 {...rest} className="mt-4 text-base font-semibold text-gray-900">
      {children}
    </h4>
  ),
  p: ({ children, ...rest }) => (
    <p {...rest} className="my-3 text-sm leading-relaxed text-gray-700">
      {children}
    </p>
  ),
  ul: ({ children, ...rest }) => (
    <ul {...rest} className="my-3 list-disc pl-6 text-sm text-gray-700">
      {children}
    </ul>
  ),
  ol: ({ children, ...rest }) => (
    <ol {...rest} className="my-3 list-decimal pl-6 text-sm text-gray-700">
      {children}
    </ol>
  ),
  li: ({ children, ...rest }) => (
    <li {...rest} className="my-1 leading-relaxed">
      {children}
    </li>
  ),
  blockquote: ({ children, ...rest }) => (
    <blockquote
      {...rest}
      className="my-3 border-l-4 border-secondary bg-gray-50 px-4 py-2 text-sm text-gray-700"
    >
      {children}
    </blockquote>
  ),
  code: ({ children, ...rest }) => (
    <code {...rest} className="rounded bg-gray-100 px-1 py-0.5 font-mono text-xs text-gray-800">
      {children}
    </code>
  ),
  pre: ({ children, ...rest }) => (
    <pre {...rest} className="my-3 overflow-x-auto rounded-md bg-gray-900 p-3 text-xs text-white">
      {children}
    </pre>
  ),
  table: ({ children, ...rest }) => (
    <div className="my-4 overflow-x-auto rounded-md border border-gray-200">
      <table
        {...rest}
        className="min-w-full divide-y divide-gray-200 text-sm [&>tbody>tr>td:first-child]:font-medium [&>tbody>tr>td:first-child]:text-gray-900 [&>tbody>tr:nth-child(even)]:bg-gray-50/60"
      >
        {children}
      </table>
    </div>
  ),
  th: ({ children, ...rest }) => (
    <th
      {...rest}
      className="bg-gray-100 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-700"
    >
      {children}
    </th>
  ),
  td: ({ children, ...rest }) => (
    <td {...rest} className="px-4 py-2.5 align-top text-gray-700">
      {children}
    </td>
  ),
  a: ({ children, href, ...rest }) => {
    const internal = resolveHelpHref(href, currentSection, pathPrefix);
    if (internal !== null) {
      return (
        <Link {...rest} to={internal} className={ANCHOR_CLASSES}>
          {children}
        </Link>
      );
    }
    const isExternal = /^https?:/i.test(href ?? "");
    return (
      <a
        {...rest}
        href={href}
        className={ANCHOR_CLASSES}
        {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {children}
      </a>
    );
  },
});

export function HelpPage() {
  const { section: sectionParam, slug: slugParam } = useParams<{
    section: string;
    slug: string;
  }>();
  const { user } = useAuth();

  const page = useMemo(() => {
    if (!sectionParam || !slugParam) return undefined;
    const found = getPageBySlug(sectionParam, slugParam);
    if (!found) return undefined;
    // Direct-URL access still respects role visibility — fail closed.
    if (!isPageVisibleToRoles(found, user?.roles ?? [])) return undefined;
    return found;
  }, [sectionParam, slugParam, user]);

  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    if (page) {
      setBreadcrumbs([
        { label: "Help", href: "/help" },
        { label: page.section },
        { label: page.title },
      ]);
    } else {
      setBreadcrumbs([]);
    }
    return () => setBreadcrumbs([]);
  }, [page, setBreadcrumbs]);

  if (!page) return <HelpNotFoundPage />;

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
          components={buildMdComponents(page.sectionSlug)}
          remarkPlugins={[remarkGfm]}
        >
          {page.body}
        </ReactMarkdown>
      </div>
    </article>
  );
}
