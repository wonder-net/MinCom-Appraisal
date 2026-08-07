/**
 * Type definitions for the in-app Help Center feature.
 *
 * Help pages are bundled at build time via `import.meta.glob` from
 * `frontend/src/help-content/**\/*.md` and parsed (frontmatter + body)
 * by `loader.ts`.
 */

/** Lowercase role values used in MD frontmatter. */
export type HelpRole =
  | "all"
  | "employee"
  | "manager"
  | "hr_admin"
  | "hr_officer"
  | "executive";

/**
 * Shape of a single help page after frontmatter parsing.
 *
 * `slug` is derived from the filename (e.g. `completing-self-assessment.md`
 * becomes `completing-self-assessment`). `sectionSlug` is derived from the
 * parent directory name (e.g. `employee-guide`). `section` is the human-
 * readable label sourced from the frontmatter `section` field.
 */
export interface HelpPage {
  /** URL-safe slug derived from the MD filename (without extension). */
  slug: string;
  /** Human-readable section label (e.g. "Appraisee Guide") from frontmatter. */
  section: string;
  /** URL-safe section slug derived from the parent directory name. */
  sectionSlug: string;
  /** Page title (frontmatter `title`). */
  title: string;
  /** Sort order within the section (frontmatter `order`). */
  order: number;
  /** Roles permitted to see this page in the role-filtered TOC. */
  roles: HelpRole[];
  /** Search keywords (frontmatter `keywords`). */
  keywords: string[];
  /** One-line summary (frontmatter `summary`). */
  summary: string;
  /** Markdown body (frontmatter stripped). */
  body: string;
  /**
   * Whether this page is exposed via the unauthenticated `/help/public/...`
   * route. Only set to `true` for the small allowlist of articles linked from
   * the login screen. Defaults to `false` — fail closed.
   */
  public?: boolean;
}
