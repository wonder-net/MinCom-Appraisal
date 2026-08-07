/**
 * Tests for the Layout component's top-bar Help entry point.
 *
 * Verifies that a Help link is present in the top-bar, points at /help,
 * carries the expected aria-label, and uses react-router navigation
 * (anchor element) so the SPA does not perform a full page reload.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { AuthContextType } from "@/auth/types";
import { AuthContext } from "@/auth/AuthContext";
import { Layout } from "../Layout";

vi.mock("@/components/NotificationBell", () => ({
  NotificationBell: () => <div data-testid="notification-bell" />,
}));

vi.mock("@/components/sidebar-nav", () => ({
  SidebarNav: () => <nav data-testid="sidebar-nav" />,
}));

function buildAuthContext(): AuthContextType {
  return {
    user: {
      id: "u-001",
      email: "test@mincom.com",
      roles: ["EMPLOYEE"],
      is_mfa_enabled: true,
      employee_id: "e-001",
      must_change_password: false,
    },
    isAuthenticated: true,
    isLoading: false,
    mfaSetupRequired: false,
    accessToken: "fake-token",
    login: vi.fn(),
    verifyMFA: vi.fn(),
    logout: vi.fn(),
    updateUser: vi.fn(),
    refreshSession: vi.fn(),
  };
}

describe("Layout top-bar Help link", () => {
  it("renders a Help link in the top-bar pointing to /help", () => {
    render(
      <AuthContext.Provider value={buildAuthContext()}>
        <MemoryRouter initialEntries={["/appraisals"]}>
          <Layout />
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    const helpLink = screen.getByRole("link", { name: "Help" });
    expect(helpLink).toBeInTheDocument();
    expect(helpLink.tagName).toBe("A");
    expect(helpLink).toHaveAttribute("href", "/help");
  });
});
