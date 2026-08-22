/**
 * Tests for the Layout component's top-bar Help entry point.
 *
 * Verifies that a Help link is present in the top-bar, points at /help,
 * carries the expected aria-label, and uses react-router navigation
 * (anchor element) so the SPA does not perform a full page reload.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { AuthContextType } from "@/auth/types";
import { AuthContext } from "@/auth/AuthContext";
import { Layout } from "../Layout";
import type { Employee } from "@/api/employees";

vi.mock("@/components/NotificationBell", () => ({
  NotificationBell: () => <div data-testid="notification-bell" />,
}));

vi.mock("@/components/sidebar-nav", () => ({
  SidebarNav: () => <nav data-testid="sidebar-nav" />,
}));

const mockGetEmployee = vi.fn<(id: string) => Promise<Employee>>();

vi.mock("@/api/employees", () => ({
  getEmployee: (id: string) => mockGetEmployee(id),
}));

beforeEach(() => {
  mockGetEmployee.mockReset();
  mockGetEmployee.mockResolvedValue({
    id: "e-001",
    employee_number: "EMP-001",
    name: "Test User",
    job_title: "Engineer",
    department: "dep-1",
    job_family: "",
    location: "",
    classification: "NON_MANAGERIAL",
    classification_display: "Non-managerial",
    photo_url: null,
  });
});

function buildAuthContext(employeeId: string | null = "e-001"): AuthContextType {
  return {
    user: {
      id: "u-001",
      email: "test@mincom.com",
      roles: ["EMPLOYEE"],
      is_mfa_enabled: true,
      employee_id: employeeId,
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

describe("Layout sidebar user footer — My Profile entry point", () => {
  it("links the user footer to the account's own employee profile", () => {
    render(
      <AuthContext.Provider value={buildAuthContext("e-001")}>
        <MemoryRouter initialEntries={["/appraisals"]}>
          <Layout />
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    const profileLinks = screen.getAllByRole("link", { name: "View my profile" });
    expect(profileLinks.length).toBeGreaterThan(0);
    for (const link of profileLinks) {
      expect(link).toHaveAttribute("href", "/employees/e-001");
    }
  });

  it("renders a plain (non-link) footer when the account has no linked employee profile", () => {
    render(
      <AuthContext.Provider value={buildAuthContext(null)}>
        <MemoryRouter initialEntries={["/appraisals"]}>
          <Layout />
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    expect(screen.queryByRole("link", { name: "View my profile" })).not.toBeInTheDocument();
    // No employee profile to fetch a photo for either.
    expect(mockGetEmployee).not.toHaveBeenCalled();
  });

  it("shows the uploaded photo in the sidebar avatar once loaded, instead of initials", async () => {
    mockGetEmployee.mockResolvedValue({
      id: "e-001",
      employee_number: "EMP-001",
      name: "Test User",
      job_title: "Engineer",
      department: "dep-1",
      job_family: "",
      location: "",
      classification: "NON_MANAGERIAL",
      classification_display: "Non-managerial",
      photo_url: "https://example.test/me.jpg",
    });

    const { container } = render(
      <AuthContext.Provider value={buildAuthContext("e-001")}>
        <MemoryRouter initialEntries={["/appraisals"]}>
          <Layout />
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    // alt="" (decorative) keeps it out of the accessibility tree by
    // design (see SidebarUserFooter), so query the DOM directly rather
    // than by role.
    await waitFor(() => {
      expect(container.querySelector('img[src="https://example.test/me.jpg"]')).not.toBeNull();
    });
  });

  it("falls back to initials while no photo is set", async () => {
    render(
      <AuthContext.Provider value={buildAuthContext("e-001")}>
        <MemoryRouter initialEntries={["/appraisals"]}>
          <Layout />
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    await waitFor(() => expect(mockGetEmployee).toHaveBeenCalledWith("e-001"));
    expect(screen.getAllByText("TE").length).toBeGreaterThan(0);
  });
});
