/**
 * Help content loader — bundles every Markdown file under
 * `frontend/src/help-content/**\/*.md` into the build via Vite's
 * `import.meta.glob`. Frontmatter is parsed with `js-yaml`; the
 * remaining body is exposed as a plain string for `react-markdown`.
 *
 * Pure functions only — no side effects, no filesystem access at runtime.
 */

import yaml from "js-yaml";
import type { HelpPage, HelpRole } from "./types";
import type { UserRole } from "@/auth/types";

/** Eager raw imports of every help-content Markdown file. */
const RAW_PAGES = import.meta.glob("/src/help-content/**/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** Bridge between uppercase auth roles and lowercase frontmatter roles. */
const AUTH_ROLE_TO_HELP_ROLE: Readonly<Record<UserRole, HelpRole>> = {
  EMPLOYEE: "employee",
  MANAGER: "manager",
  HR_ADMIN: "hr_admin",
  // SYSTEM_ADMIN has identical access to HR_ADMIN (TASK-303), so help
  // pages gated to `hr_admin` should also be visible to system admins.
  SYSTEM_ADMIN: "hr_admin",
  HR_OFFICER: "hr_officer",
  EXECUTIVE: "executive",
};

/** Frontmatter delimiter used in the MD files. */
const FM_DELIMITER = "---";

/**
 * Split a raw Markdown string into `[frontmatter, body]`.
 * Returns `["", raw]` if no frontmatter is present.
 */
const splitFrontmatter = (raw: string): readonly [string, string] => {
  if (!raw.startsWith(FM_DELIMITER)) return ["", raw];
  const rest = raw.slice(FM_DELIMITER.length);
  const closeIdx = rest.indexOf(`\n${FM_DELIMITER}`);
  if (closeIdx === -1) return ["", raw];
  const fm = rest.slice(0, closeIdx).replace(/^\n/, "");
  const body = rest.slice(closeIdx + FM_DELIMITER.length + 1).replace(/^\n+/, "");
  return [fm, body] as const;
};

/** Parse a YAML frontmatter block into a plain object. Returns `{}` on failure. */
const parseFrontmatter = (fm: string): Record<string, unknown> => {
  if (fm.trim() === "") return {};
  const parsed = yaml.load(fm);
  if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  return {};
};

const asString = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

const asNumber = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const asBoolean = (value: unknown, fallback = false): boolean =>
  typeof value === "boolean" ? value : fallback;

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

const asRoleArray = (value: unknown): HelpRole[] => {
  const allowed: ReadonlySet<HelpRole> = new Set<HelpRole>([
    "all",
    "employee",
    "manager",
    "hr_admin",
    "hr_officer",
    "executive",
  ]);
  return asStringArray(value).filter((r): r is HelpRole =>
    allowed.has(r as HelpRole),
  );
};

/**
 * Extract `[sectionSlug, slug]` from an absolute glob path, e.g.
 * `/src/help-content/employee-guide/completing-self-assessment.md` →
 * `["employee-guide", "completing-self-assessment"]`.
 *
 * Files at the top level (e.g. `index.md`) yield `["", slug]`.
 */
const parsePath = (filePath: string): readonly [string, string] => {
  const fileName = filePath.split("/").pop() ?? "";
  const slug = fileName.replace(/\.md$/, "");
  const parts = filePath.split("/");
  // .../help-content/<sectionSlug>/<file>.md or .../help-content/<file>.md
  const helpIdx = parts.indexOf("help-content");
  const sectionSlug =
    helpIdx >= 0 && parts.length - helpIdx > 2 ? parts[helpIdx + 1] : "";
  return [sectionSlug, slug] as const;
};

const buildPage = (filePath: string, raw: string): HelpPage => {
  const [fm, body] = splitFrontmatter(raw);
  const meta = parseFrontmatter(fm);
  const [sectionSlug, slug] = parsePath(filePath);
  return {
    slug,
    section: asString(meta.section, sectionSlug),
    sectionSlug,
    title: asString(meta.title, slug),
    order: asNumber(meta.order, 999),
    roles: asRoleArray(meta.roles),
    keywords: asStringArray(meta.keywords),
    summary: asString(meta.summary),
    body,
    public: asBoolean(meta.public, false),
  };
};

/**
 * Display order for known section slugs. Sections appear in the TOC in this
 * sequence; any section not listed here falls back to alphabetical order
 * after the known ones. This is the natural learning order — orientation
 * first, then role-specific guides, then reference material.
 */
const SECTION_ORDER: readonly string[] = [
  "getting-started",
  "employee-guide",
  "manager-guide",
  "hr-admin-guide",
  "reference",
];

const sectionRank = (slug: string): number => {
  const idx = SECTION_ORDER.indexOf(slug);
  return idx === -1 ? SECTION_ORDER.length : idx;
};

/** Build all pages once at module load. */
const ALL_PAGES: readonly HelpPage[] = Object.entries(RAW_PAGES)
  .map(([path, raw]) => buildPage(path, raw))
  .sort((a, b) => {
    if (a.sectionSlug === b.sectionSlug) return a.order - b.order;
    const rankDiff = sectionRank(a.sectionSlug) - sectionRank(b.sectionSlug);
    return rankDiff !== 0 ? rankDiff : a.sectionSlug.localeCompare(b.sectionSlug);
  });

/** Return every loaded help page. */
export const getAllPages = (): HelpPage[] => [...ALL_PAGES];

/** Look up a page by `sectionSlug` and `slug`. */
export const getPageBySlug = (
  section: string,
  slug: string,
): HelpPage | undefined =>
  ALL_PAGES.find((p) => p.sectionSlug === section && p.slug === slug);

/**
 * Predicate — true if a page should be visible to a user with the given
 * uppercase auth roles. Pages tagged `roles: [all]` are always visible.
 * A page with no `roles` entry (malformed frontmatter) is hidden — fail
 * closed so missing metadata can't accidentally expose role-restricted
 * content.
 */
export const isPageVisibleToRoles = (
  page: HelpPage,
  authRoles: readonly UserRole[],
): boolean => {
  if (page.roles.includes("all")) return true;
  if (page.roles.length === 0) return false;
  const helpRoles = authRoles.map((r) => AUTH_ROLE_TO_HELP_ROLE[r]);
  return helpRoles.some((r) => page.roles.includes(r));
};

/** Filter a list of pages by user roles using `isPageVisibleToRoles`. */
export const filterPagesByRoles = (
  pages: readonly HelpPage[],
  authRoles: readonly UserRole[],
): HelpPage[] => pages.filter((p) => isPageVisibleToRoles(p, authRoles));

/**
 * Return every page flagged `public: true` in its frontmatter. These are the
 * articles exposed via the unauthenticated `/help/public/:section/:slug`
 * route — currently the small set of login-screen guides.
 */
export const getPublicPages = (): HelpPage[] =>
  ALL_PAGES.filter((p) => p.public === true);
