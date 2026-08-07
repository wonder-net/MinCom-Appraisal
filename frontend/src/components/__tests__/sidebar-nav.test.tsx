/**
 * Tests for the SidebarNav component.
 *
 * Verifies role-aware rendering for flat items and the collapsible Reports
 * group: correct links appear for each role, active-link highlighting,
 * expand/collapse toggling, and click callback.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { SidebarNav } from "../sidebar-nav";
import type { AuthContextType } from "@/auth/types";
import type { UserRole } from "@/auth/types";
import { AuthContext } from "@/auth/AuthContext";

function buildAuthContext(roles: UserRole[]): AuthContextType {
  return {
    user: {
      id: "u-001",
      email: "test@mincom.com",
      roles,
      is_mfa_enabled: true,
      employee_id: null,
      must_change_password: false,
    },
    isAuthenticated: true,
    isLoading: false,
    mfaSetupRequired: true,
    accessToken: "fake-token",
    login: vi.fn(),
    verifyMFA: vi.fn(),
    logout: vi.fn(),
    updateUser: vi.fn(),
    refreshSession: vi.fn(),
  };
}

function renderWithProviders(
  ui: ReactNode,
  authCtx: AuthContextType,
  initialRoute = "/appraisals",
) {
  return render(
    <AuthContext.Provider value={authCtx}>
      <MemoryRouter initialEntries={[initialRoute]}>
        {ui}
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("SidebarNav", () => {
  it("renders Appraisals link for EMPLOYEE role", () => {
    renderWithProviders(<SidebarNav />, buildAuthContext(["EMPLOYEE"]));

    expect(screen.getByRole("link", { name: "Appraisals" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reports/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Users" })).not.toBeInTheDocument();
  });

  it("EMPLOYEE does not see the Reports group at all", () => {
    renderWithProviders(<SidebarNav />, buildAuthContext(["EMPLOYEE"]));

    expect(screen.queryByRole("button", { name: /reports/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
  });

  it("renders Appraisals and Reports group for EXECUTIVE role", () => {
    renderWithProviders(<SidebarNav />, buildAuthContext(["EXECUTIVE"]));

    expect(screen.getByRole("link", { name: "Appraisals" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reports/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Users" })).not.toBeInTheDocument();
  });

  it("renders all flat links and Reports group for HR_ADMIN role", () => {
    renderWithProviders(<SidebarNav />, buildAuthContext(["HR_ADMIN"]));

    expect(screen.getByRole("link", { name: "Appraisals" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reports/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Users" })).toBeInTheDocument();
  });

  it("MANAGER does not see the Reports group", () => {
    renderWithProviders(<SidebarNav />, buildAuthContext(["MANAGER"]));

    expect(screen.getByRole("link", { name: "Appraisals" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reports/i })).not.toBeInTheDocument();
  });

  it("HR_OFFICER sees Appraisals, Employees, Reports group, Audit Log, Settings", () => {
    renderWithProviders(<SidebarNav />, buildAuthContext(["HR_OFFICER"]));

    expect(screen.getByRole("link", { name: "Appraisals" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Employees" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reports/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Audit Log" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings" })).toBeInTheDocument();
  });

  it("HR_OFFICER does NOT see Cycles or Users (mutation surfaces remain HR_ADMIN-only)", () => {
    renderWithProviders(<SidebarNav />, buildAuthContext(["HR_OFFICER"]));

    expect(screen.queryByRole("link", { name: "Cycles" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Users" })).not.toBeInTheDocument();
  });

  it("highlights the active flat link with aria-current", () => {
    renderWithProviders(
      <SidebarNav />,
      buildAuthContext(["HR_ADMIN"]),
      "/appraisals",
    );

    const appraisalsLink = screen.getByRole("link", { name: "Appraisals" });
    expect(appraisalsLink).toHaveAttribute("aria-current", "page");
  });

  it("applies active styles to appraisals sub-routes", () => {
    renderWithProviders(
      <SidebarNav />,
      buildAuthContext(["EMPLOYEE"]),
      "/appraisals/some-uuid",
    );

    const appraisalsLink = screen.getByRole("link", { name: "Appraisals" });
    expect(appraisalsLink).toHaveAttribute("aria-current", "page");
  });

  it("calls onLinkClick when a flat link is clicked", async () => {
    const user = userEvent.setup();
    const onLinkClick = vi.fn();

    renderWithProviders(
      <SidebarNav onLinkClick={onLinkClick} />,
      buildAuthContext(["EMPLOYEE"]),
    );

    await user.click(screen.getByRole("link", { name: "Appraisals" }));
    expect(onLinkClick).toHaveBeenCalledTimes(1);
  });

  it("renders nothing when user is null", () => {
    const ctx: AuthContextType = {
      user: null,
      isAuthenticated: false,
      isLoading: false,
      mfaSetupRequired: true,
      accessToken: null,
      login: vi.fn(),
      verifyMFA: vi.fn(),
      logout: vi.fn(),
      updateUser: vi.fn(),
      refreshSession: vi.fn(),
    };

    const { container } = render(
      <AuthContext.Provider value={ctx}>
        <MemoryRouter>
          <SidebarNav />
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    expect(container.querySelector("nav")).not.toBeInTheDocument();
  });

  describe("Reports group", () => {
    it("HR_ADMIN sees all 12 sub-links when expanded", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <SidebarNav />,
        buildAuthContext(["HR_ADMIN"]),
        "/appraisals",
      );

      const reportsBtn = screen.getByRole("button", { name: /reports/i });
      await user.click(reportsBtn);

      expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Unapprised" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Distribution" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Competency Gaps" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Manager Effectiveness" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Disputes" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "BSC Perspectives" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Identified Training Needs" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Career Pipeline" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Audit Compliance" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Trend" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Rating Variance" })).toBeInTheDocument();
    });

    it("HR_OFFICER sees all 12 sub-links when expanded (read-only org-wide access)", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <SidebarNav />,
        buildAuthContext(["HR_OFFICER"]),
        "/appraisals",
      );

      const reportsBtn = screen.getByRole("button", { name: /reports/i });
      await user.click(reportsBtn);

      expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Unapprised" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Distribution" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Competency Gaps" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Manager Effectiveness" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Disputes" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "BSC Perspectives" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Identified Training Needs" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Career Pipeline" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Audit Compliance" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Trend" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Rating Variance" })).toBeInTheDocument();
    });

    it("EXECUTIVE sees only 4 sub-links when expanded", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <SidebarNav />,
        buildAuthContext(["EXECUTIVE"]),
        "/appraisals",
      );

      const reportsBtn = screen.getByRole("button", { name: /reports/i });
      await user.click(reportsBtn);

      expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Distribution" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Manager Effectiveness" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "BSC Perspectives" })).toBeInTheDocument();

      expect(screen.queryByRole("link", { name: "Unapprised" })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Competency Gaps" })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Disputes" })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Identified Training Needs" })).not.toBeInTheDocument();
    });

    it("auto-expands when pathname is /reports/disputes", () => {
      renderWithProviders(
        <SidebarNav />,
        buildAuthContext(["HR_ADMIN"]),
        "/reports/disputes",
      );

      const reportsBtn = screen.getByRole("button", { name: /reports/i });
      expect(reportsBtn).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByRole("link", { name: "Disputes" })).toBeInTheDocument();
    });

    it("is collapsed when pathname is /appraisals", () => {
      renderWithProviders(
        <SidebarNav />,
        buildAuthContext(["HR_ADMIN"]),
        "/appraisals",
      );

      const reportsBtn = screen.getByRole("button", { name: /reports/i });
      expect(reportsBtn).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByRole("link", { name: "Dashboard" })).not.toBeInTheDocument();
    });

    it("clicking the Reports parent row toggles expansion state", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <SidebarNav />,
        buildAuthContext(["HR_ADMIN"]),
        "/appraisals",
      );

      const reportsBtn = screen.getByRole("button", { name: /reports/i });
      expect(reportsBtn).toHaveAttribute("aria-expanded", "false");

      await user.click(reportsBtn);
      expect(reportsBtn).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();

      await user.click(reportsBtn);
      expect(reportsBtn).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByRole("link", { name: "Dashboard" })).not.toBeInTheDocument();
    });

    it("active sub-link has aria-current='page'", () => {
      renderWithProviders(
        <SidebarNav />,
        buildAuthContext(["HR_ADMIN"]),
        "/reports/disputes",
      );

      const disputesLink = screen.getByRole("link", { name: "Disputes" });
      expect(disputesLink).toHaveAttribute("aria-current", "page");

      const dashboardLink = screen.getByRole("link", { name: "Dashboard" });
      expect(dashboardLink).not.toHaveAttribute("aria-current");
    });

    it("Dashboard sub-link is active only on exact /reports path", () => {
      renderWithProviders(
        <SidebarNav />,
        buildAuthContext(["HR_ADMIN"]),
        "/reports",
      );

      const dashboardLink = screen.getByRole("link", { name: "Dashboard" });
      expect(dashboardLink).toHaveAttribute("aria-current", "page");
    });

    it("Dashboard sub-link is not active on /reports/disputes", () => {
      renderWithProviders(
        <SidebarNav />,
        buildAuthContext(["HR_ADMIN"]),
        "/reports/disputes",
      );

      const dashboardLink = screen.getByRole("link", { name: "Dashboard" });
      expect(dashboardLink).not.toHaveAttribute("aria-current");
    });

    it("Reports parent is a button, not a link", () => {
      renderWithProviders(
        <SidebarNav />,
        buildAuthContext(["HR_ADMIN"]),
        "/appraisals",
      );

      const reportsBtn = screen.getByRole("button", { name: /reports/i });
      expect(reportsBtn.tagName).toBe("BUTTON");
      expect(reportsBtn).toHaveAttribute("type", "button");
    });

    it("calls onLinkClick when a sub-link is clicked", async () => {
      const user = userEvent.setup();
      const onLinkClick = vi.fn();

      renderWithProviders(
        <SidebarNav onLinkClick={onLinkClick} />,
        buildAuthContext(["HR_ADMIN"]),
        "/reports",
      );

      await user.click(screen.getByRole("link", { name: "Disputes" }));
      expect(onLinkClick).toHaveBeenCalledTimes(1);
    });
  });
});
