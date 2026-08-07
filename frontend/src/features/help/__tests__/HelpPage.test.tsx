/**
 * Unit tests for HelpPage — verifies the page title renders in an <h1>
 * and that relative `../screenshots/...` image paths are rewritten to
 * `/help-screenshots/...` in the rendered DOM.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { BreadcrumbProvider } from "@/context/BreadcrumbContext";
import { HelpPage } from "../HelpPage";

vi.mock("@/auth/useAuth", () => ({
  useAuth: () => ({
    user: {
      id: "u-emp",
      email: "emp@mincom.com",
      roles: ["EMPLOYEE"],
      is_mfa_enabled: false,
      employee_id: "e-1",
      must_change_password: false,
    },
    isAuthenticated: true,
    isLoading: false,
  }),
}));

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <BreadcrumbProvider>
        <Routes>
          <Route path="/help/:section/:slug" element={<HelpPage />} />
        </Routes>
      </BreadcrumbProvider>
    </MemoryRouter>,
  );

describe("HelpPage", () => {
  it("renders the page title in an <h1>", () => {
    renderAt("/help/employee-guide/completing-self-assessment");
    const heading = screen.getByRole("heading", {
      level: 1,
      name: /completing your self-assessment/i,
    });
    expect(heading).toBeInTheDocument();
  });

  it("rewrites relative ../screenshots paths to /help-screenshots/...", () => {
    renderAt("/help/employee-guide/completing-self-assessment");
    const img = screen.getByAltText(
      /Appraisal in Self Assessment status with workflow progress bar/i,
    ) as HTMLImageElement;
    // Browsers resolve relative paths against the document base URL,
    // so we check the underlying attribute literal.
    expect(img.getAttribute("src")).toBe(
      "/help-screenshots/employee/02-appraisal-detail-key-deliverables.png",
    );
  });

  it("renders HelpNotFoundPage for an unknown slug", () => {
    renderAt("/help/employee-guide/does-not-exist");
    expect(
      screen.getByRole("heading", { name: /help article not found/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /back to help center/i }),
    ).toBeInTheDocument();
  });

  it("renders HelpNotFoundPage when an EMPLOYEE direct-navigates to an HR-Admin page", () => {
    renderAt("/help/hr-admin-guide/managing-cycles");
    expect(
      screen.getByRole("heading", { name: /help article not found/i }),
    ).toBeInTheDocument();
  });

  it("rewrites a sibling-section markdown link, stripping numeric prefix and .md", () => {
    // viewing-your-appraisals.md links to "../05-reference/workflow-stages.md"
    renderAt("/help/employee-guide/viewing-your-appraisals");
    const link = screen.getByRole("link", { name: /workflow stages/i });
    expect(link.getAttribute("href")).toBe("/help/reference/workflow-stages");
  });

  it("rewrites a same-section markdown cross-link to the SPA route (drops .md)", () => {
    // logging-in.md cross-links to "first-time-sign-in.md"
    renderAt("/help/getting-started/logging-in");
    const link = screen.getByRole("link", { name: /first-time sign-in/i });
    expect(link.getAttribute("href")).toBe(
      "/help/getting-started/first-time-sign-in",
    );
  });
});

describe("resolveHelpHref", () => {
  it("returns null for absolute URLs (mailto, tel, http, https)", async () => {
    const { resolveHelpHref } = await import("../HelpPage");
    expect(resolveHelpHref("mailto:hr@mincom.com", "getting-started")).toBeNull();
    expect(resolveHelpHref("tel:+233200000000", "getting-started")).toBeNull();
    expect(resolveHelpHref("http://example.com", "getting-started")).toBeNull();
    expect(resolveHelpHref("https://example.com", "getting-started")).toBeNull();
  });

  it("returns null for in-page anchor hrefs", async () => {
    const { resolveHelpHref } = await import("../HelpPage");
    expect(resolveHelpHref("#step-1", "getting-started")).toBeNull();
  });

  it("returns null for paths that escape the /help/ namespace", async () => {
    const { resolveHelpHref } = await import("../HelpPage");
    expect(resolveHelpHref("/admin/users", "getting-started")).toBeNull();
    expect(resolveHelpHref("../../admin/users", "getting-started")).toBeNull();
  });

  it("strips .md and resolves a same-section relative link", async () => {
    const { resolveHelpHref } = await import("../HelpPage");
    expect(
      resolveHelpHref("first-time-sign-in.md", "getting-started"),
    ).toBe("/help/getting-started/first-time-sign-in");
  });

  it("strips NN- numeric directory prefixes", async () => {
    const { resolveHelpHref } = await import("../HelpPage");
    expect(
      resolveHelpHref("../05-reference/workflow-stages.md", "employee-guide"),
    ).toBe("/help/reference/workflow-stages");
  });

  it("resolves under a custom pathPrefix (/help/public)", async () => {
    const { resolveHelpHref } = await import("../HelpPage");
    expect(
      resolveHelpHref(
        "first-time-sign-in.md",
        "getting-started",
        "/help/public",
      ),
    ).toBe("/help/public/getting-started/first-time-sign-in");
  });

  it("rejects escape attempts under a custom pathPrefix (/help/public)", async () => {
    const { resolveHelpHref } = await import("../HelpPage");
    expect(
      resolveHelpHref("../../admin/users", "getting-started", "/help/public"),
    ).toBeNull();
  });
});
