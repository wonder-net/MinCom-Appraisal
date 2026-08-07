/**
 * HelpToc — sidebar table of contents for the Help Center.
 *
 * Receives a pre-filtered list of help pages (role filtering done by the
 * parent `HelpLayout`). Groups pages by `sectionSlug`, preserving the
 * loader's insertion order — pages arrive sorted by `sectionSlug` then by
 * `order`, so we never re-sort here.
 *
 * Two render modes:
 *  - `query` empty → `@radix-ui/react-accordion` (controlled) with one item
 *    per section. The component holds the currently-open section in local
 *    state and re-syncs it via `useEffect` whenever `currentSection` changes,
 *    so cross-section navigation and deep-links both expand the right section.
 *    User-initiated open/close (via `onValueChange`) is preserved until the
 *    next navigation.
 *  - `query` non-empty → flat list of matching links (case-insensitive
 *    substring match across title, summary, and keywords).
 *
 * The active page link uses `aria-current="page"` and the wireframe's
 * `ACTIVE_CLASSES` styling pattern.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { HelpPage } from "./types";

const LINK_BASE =
  "flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors duration-150 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-1";
const ACTIVE_CLASSES =
  "bg-primary-light text-primary font-medium border-l-4 border-primary";
const INACTIVE_CLASSES = "text-[#6C757D] hover:bg-gray-100 hover:text-[#212529]";

interface SectionGroup {
  sectionSlug: string;
  section: string;
  pages: HelpPage[];
}

/**
 * Group pages by `sectionSlug`, preserving the loader's insertion order.
 * Pages with an empty `sectionSlug` (top-level files like `index.md`) are
 * skipped — they belong on the index page, not the TOC.
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

/** Case-insensitive substring match across title, summary, and keywords. */
const matchesQuery = (page: HelpPage, query: string): boolean => {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  if (page.title.toLowerCase().includes(q)) return true;
  if (page.summary.toLowerCase().includes(q)) return true;
  return page.keywords.some((kw) => kw.toLowerCase().includes(q));
};

export interface HelpTocProps {
  pages: HelpPage[];
  currentSection?: string;
  currentSlug?: string;
  /** Search query (applied as a substring filter when non-empty). */
  query?: string;
  /** Called after the user clicks a link — used to close the mobile drawer. */
  onNavigate?: () => void;
}

export function HelpToc({
  pages,
  currentSection,
  currentSlug,
  query = "",
  onNavigate,
}: HelpTocProps) {
  const sections = useMemo(() => groupPagesBySection(pages), [pages]);

  const trimmedQuery = query.trim();
  const isSearching = trimmedQuery !== "";

  const searchResults = useMemo(
    () =>
      isSearching
        ? pages.filter(
            (p) => p.sectionSlug !== "" && matchesQuery(p, trimmedQuery),
          )
        : [],
    [pages, trimmedQuery, isSearching],
  );

  const initialOpen = currentSection ?? sections[0]?.sectionSlug ?? "";
  // Controlled accordion: re-expand the active section on every navigation —
  // both cross-section (Reference → Appraisee Guide) and within-section
  // (Appraisee Guide page A → page B). Including `currentSlug` in the deps
  // means the effect re-runs on any page change, so a manually-collapsed
  // section snaps back open as soon as the user clicks another link inside
  // it. User-initiated `onValueChange` toggles are still preserved between
  // navigations.
  const [openSection, setOpenSection] = useState<string | undefined>(initialOpen);
  useEffect(() => {
    if (currentSection) setOpenSection(currentSection);
  }, [currentSection, currentSlug]);

  if (isSearching) {
    return (
      <nav
        aria-label="Help center search results"
        className="flex-1 overflow-y-auto px-3 pb-4 pt-2"
      >
        {searchResults.length === 0 ? (
          <p className="px-3 py-6 text-sm text-[#6C757D] text-center">
            No articles match &ldquo;{trimmedQuery}&rdquo;.
          </p>
        ) : (
          <ul aria-label="Search results" className="space-y-1" role="list">
            {searchResults.map((page) => {
              const isActive =
                page.sectionSlug === currentSection &&
                page.slug === currentSlug;
              return (
                <li key={`${page.sectionSlug}/${page.slug}`}>
                  <Link
                    to={`/help/${page.sectionSlug}/${page.slug}`}
                    aria-current={isActive ? "page" : undefined}
                    onClick={onNavigate}
                    className={`block rounded-md px-3 py-2 text-sm ${
                      isActive ? ACTIVE_CLASSES : INACTIVE_CLASSES
                    } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary`}
                  >
                    <span className="block font-medium text-[#212529]">
                      {page.title}
                    </span>
                    <span className="mt-0.5 block text-xs text-[#6C757D]">
                      {page.section}
                    </span>
                    {page.summary && (
                      <span className="mt-0.5 block text-xs text-[#6C757D]">
                        {page.summary}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </nav>
    );
  }

  return (
    <nav
      aria-label="Help center contents"
      className="flex-1 overflow-y-auto px-3 pb-4"
    >
      {sections.length === 0 ? (
        <p className="px-3 py-6 text-sm text-[#6C757D] text-center">
          No help articles are available for your role.
        </p>
      ) : (
        <Accordion
          type="single"
          collapsible
          value={openSection ?? ""}
          onValueChange={(v) => setOpenSection(v || undefined)}
          className="space-y-1"
        >
          {sections.map((group) => (
            <AccordionItem
              key={group.sectionSlug}
              value={group.sectionSlug}
              className="border-none"
            >
              <AccordionTrigger
                className="rounded-md px-3 py-2 text-sm font-medium text-[#212529] hover:bg-gray-100 hover:no-underline focus-visible:ring-2 focus-visible:ring-secondary [&[data-state=open]]:text-primary"
                aria-label={`${group.section} — expand section`}
              >
                {group.section}
              </AccordionTrigger>
              <AccordionContent className="pb-1 pt-0">
                <ul className="space-y-0.5 ml-1" role="list">
                  {group.pages.map((page) => {
                    const isActive =
                      page.sectionSlug === currentSection &&
                      page.slug === currentSlug;
                    return (
                      <li key={page.slug}>
                        <Link
                          to={`/help/${page.sectionSlug}/${page.slug}`}
                          aria-current={isActive ? "page" : undefined}
                          onClick={onNavigate}
                          className={`${LINK_BASE} ${
                            isActive ? ACTIVE_CLASSES : INACTIVE_CLASSES
                          }`}
                        >
                          {page.title}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </nav>
  );
}
