/**
 * HelpIndexPage — Help Center landing page.
 *
 * Renders a role-filtered table of contents. Pages are grouped by section
 * (sourced from frontmatter `section`), preserving the within-section
 * `order` from the loader. Pages tagged `roles: [all]` always appear; the
 * remaining pages are filtered against the current user's roles.
 */

import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/useAuth";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { filterPagesByRoles, getAllPages } from "./loader";
import type { HelpPage } from "./types";

interface SectionGroup {
  sectionSlug: string;
  section: string;
  pages: HelpPage[];
}

/**
 * Group pages by section. The `index.md` page (sectionSlug === "") is
 * deliberately excluded — it is reserved for a future Help Center landing
 * surface and is not part of the TOC. Pages arrive pre-sorted by section
 * then by `order` from the loader, so insertion order is preserved.
 */
const groupPagesBySection = (pages: readonly HelpPage[]): SectionGroup[] => {
  const map = new Map<string, SectionGroup>();
  pages.forEach((page) => {
    if (page.sectionSlug === "") return;
    const existing = map.get(page.sectionSlug);
    if (existing) {
      existing.pages.push(page);
    } else {
      map.set(page.sectionSlug, {
        sectionSlug: page.sectionSlug,
        section: page.section,
        pages: [page],
      });
    }
  });
  return [...map.values()];
};

export function HelpIndexPage() {
  const { user } = useAuth();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: "Help" }]);
    return () => setBreadcrumbs([]);
  }, [setBreadcrumbs]);

  const sections = useMemo(() => {
    const visible = filterPagesByRoles(getAllPages(), user?.roles ?? []);
    return groupPagesBySection(visible);
  }, [user]);

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Help Center</h1>
        <p className="mt-2 text-sm text-gray-600">
          Step-by-step guides and reference material for using the MINCOM
          Performance Appraisal Platform.
        </p>
      </header>

      {sections.length === 0 ? (
        <p className="rounded-md border border-gray-200 bg-white p-6 text-sm text-gray-600">
          No help articles are available for your role yet.
        </p>
      ) : (
        <div className="space-y-8" role="list">
          {sections.map((group) => (
            <section
              key={group.sectionSlug}
              role="listitem"
              aria-labelledby={`help-section-${group.sectionSlug}`}
              className="rounded-md border border-gray-200 bg-white p-6"
            >
              <h2
                id={`help-section-${group.sectionSlug}`}
                className="text-lg font-semibold text-gray-900"
              >
                {group.section}
              </h2>
              <ul className="mt-4 space-y-2" role="list">
                {group.pages.map((page) => (
                  <li key={`${page.sectionSlug}/${page.slug}`}>
                    <Link
                      to={`/help/${page.sectionSlug}/${page.slug}`}
                      className="block rounded-md px-3 py-2 text-sm text-secondary hover:bg-gray-50 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
                    >
                      <span className="font-medium">{page.title}</span>
                      {page.summary && (
                        <span className="mt-0.5 block text-xs text-gray-500">
                          {page.summary}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
