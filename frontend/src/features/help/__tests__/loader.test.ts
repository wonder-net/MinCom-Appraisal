/**
 * Unit tests for the Help Center MD loader and role filter.
 */

import { describe, it, expect } from "vitest";
import {
  getAllPages,
  getPageBySlug,
  isPageVisibleToRoles,
  filterPagesByRoles,
  getPublicPages,
} from "../loader";

describe("loader.getAllPages", () => {
  const pages = getAllPages();

  it("returns exactly 30 pages", () => {
    expect(pages.length).toBe(30);
  });

  it("populates required fields on every page", () => {
    pages.forEach((p) => {
      expect(p.title).not.toBe("");
      expect(p.section).not.toBe("");
      expect(Array.isArray(p.roles)).toBe(true);
      expect(p.body).not.toBe("");
    });
  });

  it("orders sections as: getting-started, employee-guide, manager-guide, hr-admin-guide, reference", () => {
    const seenSections: string[] = [];
    pages.forEach((p) => {
      if (p.sectionSlug && !seenSections.includes(p.sectionSlug)) {
        seenSections.push(p.sectionSlug);
      }
    });
    expect(seenSections).toEqual([
      "getting-started",
      "employee-guide",
      "manager-guide",
      "hr-admin-guide",
      "reference",
    ]);
  });
});

describe("loader.getPageBySlug", () => {
  it("returns the matching page for a known slug", () => {
    const page = getPageBySlug("employee-guide", "completing-self-assessment");
    expect(page).toBeDefined();
    expect(page?.title).toBe("Completing Your Self-Assessment");
    expect(page?.roles).toContain("all");
  });

  it("returns undefined for an unknown slug", () => {
    expect(getPageBySlug("employee-guide", "does-not-exist")).toBeUndefined();
    expect(getPageBySlug("nope", "completing-self-assessment")).toBeUndefined();
  });
});

describe("loader section labels (TASK-284 rename)", () => {
  // The filesystem slugs `employee-guide` and `manager-guide` are unchanged,
  // but their human-readable section labels were renamed to match the
  // Appraisee / Appraisor role labels rolled out in TASK-263 / TASK-279.
  // Pin both label values here so any drift back to the old wording fails
  // the suite loudly.

  it("resolves employee-guide articles with section label 'Appraisee Guide'", () => {
    const slugs = [
      "completing-self-assessment",
      "viewing-your-appraisals",
      "reading-notifications",
      "reviewing-manager-feedback",
      "signing-off",
      "viewing-growth-plan",
    ];
    slugs.forEach((slug) => {
      const page = getPageBySlug("employee-guide", slug);
      expect(page, `employee-guide/${slug} should exist`).toBeDefined();
      if (!page) return;
      expect(page.section).toBe("Appraisee Guide");
      expect(page.sectionSlug).toBe("employee-guide");
    });
  });

  it("resolves manager-guide articles with section label 'Appraisor Guide'", () => {
    const slugs = [
      "rating-key-deliverables",
      "rating-competencies",
      "adding-comments",
      "approving-signoff",
      "conducting-discussion",
      "creating-growth-plan",
      "viewing-direct-reports",
    ];
    slugs.forEach((slug) => {
      const page = getPageBySlug("manager-guide", slug);
      expect(page, `manager-guide/${slug} should exist`).toBeDefined();
      if (!page) return;
      expect(page.section).toBe("Appraisor Guide");
      expect(page.sectionSlug).toBe("manager-guide");
    });
  });

  it("keeps sectionSlug ordering unchanged after the label rename", () => {
    // Slug values drive the TOC sort order in SECTION_ORDER — they must
    // remain `employee-guide` and `manager-guide`, not be auto-derived
    // from the new labels.
    const seenSections: string[] = [];
    getAllPages().forEach((p) => {
      if (p.sectionSlug && !seenSections.includes(p.sectionSlug)) {
        seenSections.push(p.sectionSlug);
      }
    });
    expect(seenSections).toEqual([
      "getting-started",
      "employee-guide",
      "manager-guide",
      "hr-admin-guide",
      "reference",
    ]);
  });
});

describe("loader.isPageVisibleToRoles", () => {
  it("shows pages with `roles: [all]` to every role", () => {
    const allPage = getAllPages().find((p) => p.roles.includes("all"));
    expect(allPage).toBeDefined();
    if (!allPage) return;
    expect(isPageVisibleToRoles(allPage, ["EMPLOYEE"])).toBe(true);
    expect(isPageVisibleToRoles(allPage, ["MANAGER"])).toBe(true);
    expect(isPageVisibleToRoles(allPage, ["HR_ADMIN"])).toBe(true);
  });

  it("shows appraisee-facing employee-guide pages to every role", () => {
    // employee-guide articles like `completing-self-assessment` are
    // tagged `[all]` — anyone who can be appraised needs them, and
    // executives benefit from reading the appraisee perspective for
    // governance/oversight even though they aren't appraised.
    const appraisee = getPageBySlug(
      "employee-guide",
      "completing-self-assessment",
    );
    expect(appraisee).toBeDefined();
    if (!appraisee) return;
    expect(isPageVisibleToRoles(appraisee, ["EMPLOYEE"])).toBe(true);
    expect(isPageVisibleToRoles(appraisee, ["MANAGER"])).toBe(true);
    expect(isPageVisibleToRoles(appraisee, ["HR_ADMIN"])).toBe(true);
    expect(isPageVisibleToRoles(appraisee, ["HR_OFFICER"])).toBe(true);
    expect(isPageVisibleToRoles(appraisee, ["EXECUTIVE"])).toBe(true);
  });

  it("includes appraisee-facing pages in filterPagesByRoles for HR_ADMIN", () => {
    const filtered = filterPagesByRoles(getAllPages(), ["HR_ADMIN"]);
    expect(
      filtered.some(
        (p) =>
          p.sectionSlug === "employee-guide" &&
          p.slug === "completing-self-assessment",
      ),
    ).toBe(true);
  });

  it("shows analytics-and-dashboards to EXECUTIVE", () => {
    const analytics = getPageBySlug("hr-admin-guide", "analytics-and-dashboards");
    expect(analytics).toBeDefined();
    if (!analytics) return;
    expect(isPageVisibleToRoles(analytics, ["EXECUTIVE"])).toBe(true);
  });

  it("hides cycle/user/competencies admin pages from EXECUTIVE", () => {
    const filtered = filterPagesByRoles(getAllPages(), ["EXECUTIVE"]);
    const slugs = filtered.map((p) => `${p.sectionSlug}/${p.slug}`);
    expect(slugs).not.toContain("hr-admin-guide/managing-cycles");
    expect(slugs).not.toContain("hr-admin-guide/managing-users");
    expect(slugs).not.toContain("hr-admin-guide/managing-competencies");
    expect(slugs).not.toContain("hr-admin-guide/closing-cycles");
  });

  it("shows audit-log, analytics, and employees to HR_OFFICER but hides cycle/user/competencies admin", () => {
    const filtered = filterPagesByRoles(getAllPages(), ["HR_OFFICER"]);
    const slugs = filtered.map((p) => `${p.sectionSlug}/${p.slug}`);
    expect(slugs).toContain("hr-admin-guide/audit-log");
    expect(slugs).toContain("hr-admin-guide/analytics-and-dashboards");
    expect(slugs).toContain("hr-admin-guide/managing-employees");
    expect(slugs).not.toContain("hr-admin-guide/managing-cycles");
    expect(slugs).not.toContain("hr-admin-guide/managing-users");
    expect(slugs).not.toContain("hr-admin-guide/managing-competencies");
    expect(slugs).not.toContain("hr-admin-guide/closing-cycles");
  });

  it("does not include the removed bulk-import-appraisals article (TASK-288)", () => {
    expect(
      getPageBySlug("hr-admin-guide", "bulk-import-appraisals"),
    ).toBeUndefined();
  });

  it("scopes managing-competencies to HR_ADMIN only", () => {
    const page = getPageBySlug("hr-admin-guide", "managing-competencies");
    expect(page).toBeDefined();
    if (!page) return;
    expect(page.roles).toEqual(["hr_admin"]);
    expect(isPageVisibleToRoles(page, ["HR_ADMIN"])).toBe(true);
    expect(isPageVisibleToRoles(page, ["HR_OFFICER"])).toBe(false);
    expect(isPageVisibleToRoles(page, ["EXECUTIVE"])).toBe(false);
    expect(isPageVisibleToRoles(page, ["MANAGER"])).toBe(false);
    expect(isPageVisibleToRoles(page, ["EMPLOYEE"])).toBe(false);
  });

  it("shows manager-guide pages to a user with both EMPLOYEE and MANAGER roles", () => {
    const managerPage = getPageBySlug(
      "manager-guide",
      "rating-key-deliverables",
    );
    expect(managerPage).toBeDefined();
    if (!managerPage) return;
    expect(isPageVisibleToRoles(managerPage, ["EMPLOYEE", "MANAGER"])).toBe(true);
  });

  it("shows manager-guide pages to HR_ADMIN appraisers and HR_OFFICER/EXECUTIVE for oversight", () => {
    // HR_ADMIN can be assigned as a direct manager (per recent product
    // direction) and reaches the KdSection HelpIcon's canMgrRate branch.
    // HR_OFFICER and EXECUTIVE can read for governance/oversight even if
    // they don't appraise. Only EMPLOYEE-only users (without MANAGER) are
    // excluded so their TOC stays clean.
    //
    // Spot-check both articles reachable from the appraisal-detail
    // HelpIcons (`rating-key-deliverables` from KdSection, `rating-
    // competencies` from CompetenciesTab) so a tag drift on either is
    // caught individually.
    for (const slug of ["rating-key-deliverables", "rating-competencies"]) {
      const page = getPageBySlug("manager-guide", slug);
      expect(page, `manager-guide/${slug} should exist`).toBeDefined();
      if (!page) continue;
      expect(isPageVisibleToRoles(page, ["HR_ADMIN"])).toBe(true);
      expect(isPageVisibleToRoles(page, ["HR_OFFICER"])).toBe(true);
      expect(isPageVisibleToRoles(page, ["EXECUTIVE"])).toBe(true);
      expect(isPageVisibleToRoles(page, ["EMPLOYEE"])).toBe(false);
    }
  });

  it("includes manager-guide pages in filterPagesByRoles for HR_ADMIN", () => {
    const filtered = filterPagesByRoles(getAllPages(), ["HR_ADMIN"]);
    const slugs = filtered.map((p) => `${p.sectionSlug}/${p.slug}`);
    expect(slugs).toContain("manager-guide/rating-key-deliverables");
    expect(slugs).toContain("manager-guide/rating-competencies");
  });

  it("hides pages with empty roles array (fail-closed)", () => {
    const fakePage = {
      slug: "x",
      section: "x",
      sectionSlug: "x",
      title: "x",
      order: 0,
      roles: [],
      keywords: [],
      summary: "",
      body: "",
    };
    expect(isPageVisibleToRoles(fakePage, ["HR_ADMIN"])).toBe(false);
    expect(isPageVisibleToRoles(fakePage, ["EMPLOYEE"])).toBe(false);
  });
});

describe("loader.getPublicPages", () => {
  it("returns exactly 3 pages", () => {
    expect(getPublicPages().length).toBe(3);
  });

  it("returns the login-screen allowlist (logging-in, first-time-sign-in, account-settings)", () => {
    const slugs = getPublicPages()
      .map((p) => p.slug)
      .sort();
    expect(slugs).toEqual(
      ["account-settings", "first-time-sign-in", "logging-in"].sort(),
    );
  });

  it("flags every returned page with public === true", () => {
    getPublicPages().forEach((p) => {
      expect(p.public).toBe(true);
    });
  });

  it("leaves non-allowlisted pages with falsy `public`", () => {
    const page = getPageBySlug("manager-guide", "rating-key-deliverables");
    expect(page).toBeDefined();
    if (!page) return;
    expect(page.public).toBeFalsy();
  });
});
