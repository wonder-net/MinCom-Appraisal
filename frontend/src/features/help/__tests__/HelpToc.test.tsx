/**
 * Unit tests for HelpToc — verifies that the section containing the
 * `currentSlug` is expanded by default, that other sections are collapsed,
 * and that pre-filtered pages produce the expected link set (e.g. an
 * EMPLOYEE-filtered list does not include any HR-Admin-only page).
 */

import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HelpToc } from "../HelpToc";
import {
  filterPagesByRoles,
  getAllPages,
} from "../loader";
import type { HelpPage } from "../types";

const renderToc = (props: {
  pages: HelpPage[];
  currentSection?: string;
  currentSlug?: string;
  query?: string;
}) =>
  render(
    <MemoryRouter>
      <HelpToc {...props} />
    </MemoryRouter>,
  );

/** Minimal in-test fixture — keeps the accordion render light so the test
 * stays well under vitest's 5 s budget. Uses a few pages spread across
 * three distinct sections. */
const FIXTURE_PAGES: HelpPage[] = [
  {
    slug: "welcome",
    section: "Getting Started",
    sectionSlug: "getting-started",
    title: "Welcome",
    order: 1,
    roles: ["all"],
    keywords: ["intro", "welcome"],
    summary: "Intro to the platform.",
    body: "",
  },
  {
    slug: "completing-self-assessment",
    section: "Appraisee Guide",
    sectionSlug: "employee-guide",
    title: "Completing your self-assessment",
    order: 1,
    roles: ["employee"],
    keywords: ["self assessment"],
    summary: "How to complete your self-assessment.",
    body: "",
  },
  {
    slug: "viewing-history",
    section: "Appraisee Guide",
    sectionSlug: "employee-guide",
    title: "Viewing your appraisal history",
    order: 2,
    roles: ["employee"],
    keywords: ["history"],
    summary: "View past appraisals.",
    body: "",
  },
  {
    slug: "scoring-bands",
    section: "Reference",
    sectionSlug: "reference",
    title: "Scoring bands",
    order: 1,
    roles: ["all"],
    keywords: ["scoring", "bands"],
    summary: "Scoring band reference.",
    body: "",
  },
];

describe("HelpToc", () => {
  it("expands the section containing the current slug; others collapsed", () => {
    const { container } = renderToc({
      pages: FIXTURE_PAGES,
      currentSection: "employee-guide",
      currentSlug: "completing-self-assessment",
    });

    // The employee-guide section is expanded → its page link is visible
    expect(
      screen.getByRole("link", {
        name: /completing your self-assessment/i,
      }),
    ).toBeInTheDocument();

    // Other section accordion triggers are present but their items are
    // collapsed — Radix sets data-state="closed" on the trigger and the
    // matching AccordionContent element.
    const triggers = screen.getAllByRole("button", { name: /expand section/i });
    const closedTriggers = triggers.filter(
      (t) => t.getAttribute("data-state") === "closed",
    );
    // Exactly two sections (Getting Started + Reference) are closed; the
    // active Appraisee Guide section is open. Asserting the exact count
    // catches a regression where a section is unexpectedly open.
    expect(closedTriggers).toHaveLength(2);

    // Cross-check: AccordionContent panels for the two collapsed sections
    // also carry data-state="closed" (Radix sets this on each panel).
    const closedPanels = container.querySelectorAll(
      '[data-state="closed"][role="region"]',
    );
    expect(closedPanels).toHaveLength(2);
  });

  it("keeps the active section expanded across within-section navigation", () => {
    // AC 6: navigating between pages in the *same* section keeps that
    // section expanded. Even if the user manually collapses it before
    // clicking the next link, the effect re-syncs on slug change.
    const { rerender } = renderToc({
      pages: FIXTURE_PAGES,
      currentSection: "employee-guide",
      currentSlug: "completing-self-assessment",
    });

    // Sanity: Appraisee Guide accordion item starts open.
    const initialItem = screen
      .getByRole("button", { name: /appraisee guide.*expand section/i })
      .closest('[data-state]');
    expect(initialItem).toHaveAttribute("data-state", "open");

    // Navigate to a different page within the same section.
    rerender(
      <MemoryRouter>
        <HelpToc
          pages={FIXTURE_PAGES}
          currentSection="employee-guide"
          currentSlug="viewing-history"
        />
      </MemoryRouter>,
    );

    const reopenedItem = screen
      .getByRole("button", { name: /appraisee guide.*expand section/i })
      .closest('[data-state]');
    expect(reopenedItem).toHaveAttribute("data-state", "open");

    // The new active page link is also visible (i.e. the panel stayed open).
    expect(
      screen.getByRole("link", { name: /viewing your appraisal history/i }),
    ).toBeInTheDocument();
  });

  it("re-expands the new section when currentSection changes (controlled)", () => {
    const { rerender } = renderToc({
      pages: FIXTURE_PAGES,
      currentSection: "employee-guide",
      currentSlug: "completing-self-assessment",
    });

    expect(
      screen.getByRole("link", {
        name: /completing your self-assessment/i,
      }),
    ).toBeInTheDocument();

    // Cross-section navigation: switch to a page in Reference. The
    // accordion must re-expand the Reference section.
    rerender(
      <MemoryRouter>
        <HelpToc
          pages={FIXTURE_PAGES}
          currentSection="reference"
          currentSlug="scoring-bands"
        />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("link", { name: /scoring bands/i }),
    ).toBeInTheDocument();
  });

  it("marks the current page link with aria-current='page'", () => {
    const pages = filterPagesByRoles(getAllPages(), ["EMPLOYEE"]);
    renderToc({
      pages,
      currentSection: "employee-guide",
      currentSlug: "completing-self-assessment",
    });

    const activeLink = screen.getByRole("link", {
      name: /completing your self-assessment/i,
    });
    expect(activeLink).toHaveAttribute("aria-current", "page");
  });

  it("does not include HR-Admin-only pages when given EMPLOYEE-filtered input", () => {
    const pages = filterPagesByRoles(getAllPages(), ["EMPLOYEE"]);

    // Sanity-check the input itself: filterPagesByRoles strips hr_admin pages.
    expect(
      pages.some((p) => p.roles.length === 1 && p.roles[0] === "hr_admin"),
    ).toBe(false);

    renderToc({
      pages,
      currentSection: "employee-guide",
      currentSlug: "completing-self-assessment",
    });

    // HR-Admin pages should not surface — verify a known one is absent.
    expect(
      screen.queryByRole("link", { name: /managing appraisal cycles/i }),
    ).toBeNull();
    expect(
      screen.queryByRole("link", { name: /managing users/i }),
    ).toBeNull();
  });

  it("renders search-result list when query is non-empty", () => {
    const pages = filterPagesByRoles(getAllPages(), ["EMPLOYEE"]);
    renderToc({
      pages,
      query: "self assessment",
    });

    const list = screen.getByRole("list", { name: /search results/i });
    const links = within(list).getAllByRole("link");
    expect(links.length).toBeGreaterThan(0);
    // Every result must contain the query text in its title or summary.
    links.forEach((link) => {
      expect(link.textContent?.toLowerCase()).toContain("self");
    });
  });

  it("shows a friendly empty message when no pages match the query", () => {
    const pages = filterPagesByRoles(getAllPages(), ["EMPLOYEE"]);
    renderToc({
      pages,
      query: "zzzz-no-such-keyword",
    });
    expect(
      screen.getByText(/no articles match/i),
    ).toBeInTheDocument();
  });
});
