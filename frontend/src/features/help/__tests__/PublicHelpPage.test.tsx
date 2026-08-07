/**
 * Unit tests for PublicHelpPage — verifies the unauthenticated help-article
 * route renders only `public: true` pages, hard-blocks everything else, and
 * keeps cross-links inside the `/help/public/...` namespace.
 *
 * Important: PublicHelpPage must NOT depend on `useAuth` or
 * `useBreadcrumbs` — these tests render WITHOUT mocking either, so any
 * accidental dependency would surface as a failure.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PublicHelpPage } from "../PublicHelpPage";

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/help/public/:section/:slug"
          element={<PublicHelpPage />}
        />
      </Routes>
    </MemoryRouter>,
  );

describe("PublicHelpPage", () => {
  it("renders the Logging In article without authentication", () => {
    renderAt("/help/public/getting-started/logging-in");
    expect(
      screen.getByRole("heading", { level: 1, name: /^logging in$/i }),
    ).toBeInTheDocument();
  });

  it("renders the First-Time Sign-In article", () => {
    renderAt("/help/public/getting-started/first-time-sign-in");
    expect(
      screen.getByRole("heading", { level: 1, name: /first-time sign-in/i }),
    ).toBeInTheDocument();
  });

  it("renders the Account Settings article (transitive cross-link target)", () => {
    renderAt("/help/public/getting-started/account-settings");
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /account settings and password/i,
      }),
    ).toBeInTheDocument();
  });

  it("renders the not-found state for a non-public article", () => {
    renderAt("/help/public/manager-guide/rating-key-deliverables");
    expect(
      screen.getByRole("heading", { name: /help article not found/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /back to sign in/i }),
    ).toBeInTheDocument();
    // The article body must not leak through.
    expect(
      screen.queryByRole("heading", { name: /rating key deliverables/i }),
    ).not.toBeInTheDocument();
  });

  it("renders the not-found state for an unknown slug", () => {
    renderAt("/help/public/getting-started/does-not-exist");
    expect(
      screen.getByRole("heading", { name: /help article not found/i }),
    ).toBeInTheDocument();
  });

  it("rewrites cross-links from logging-in to /help/public/...", () => {
    renderAt("/help/public/getting-started/logging-in");
    const link = screen.getByRole("link", { name: /first-time sign-in/i });
    expect(link.getAttribute("href")).toBe(
      "/help/public/getting-started/first-time-sign-in",
    );
  });

  it("rewrites cross-links from first-time-sign-in to /help/public/account-settings", () => {
    renderAt("/help/public/getting-started/first-time-sign-in");
    const links = screen
      .getAllByRole("link", { name: /account settings and password/i })
      .map((a) => a.getAttribute("href"));
    expect(links.length).toBeGreaterThan(0);
    links.forEach((href) =>
      expect(href).toBe("/help/public/getting-started/account-settings"),
    );
  });
});
