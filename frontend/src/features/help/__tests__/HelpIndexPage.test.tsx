/**
 * Unit tests for HelpIndexPage — verifies role filtering of TOC entries
 * and that the page renders without crashing.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BreadcrumbProvider } from "@/context/BreadcrumbContext";
import { HelpIndexPage } from "../HelpIndexPage";

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

const renderPage = () =>
  render(
    <MemoryRouter>
      <BreadcrumbProvider>
        <HelpIndexPage />
      </BreadcrumbProvider>
    </MemoryRouter>,
  );

describe("HelpIndexPage", () => {
  it("renders the heading without crashing", () => {
    renderPage();
    expect(
      screen.getByRole("heading", { level: 1, name: /help center/i }),
    ).toBeInTheDocument();
  });

  it("renders Appraisee Guide entries for an EMPLOYEE", () => {
    renderPage();
    expect(
      screen.getByRole("link", { name: /completing your self-assessment/i }),
    ).toBeInTheDocument();
  });

  it("does not render manager-only links for an EMPLOYEE", () => {
    renderPage();
    expect(
      screen.queryByRole("link", { name: /rating key deliverables/i }),
    ).toBeNull();
    expect(
      screen.queryByRole("link", { name: /managing appraisal cycles/i }),
    ).toBeNull();
  });
});
