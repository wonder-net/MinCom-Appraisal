/**
 * Regression tests for EmployeeListPage — guards against the search input
 * being disabled or unmounted during loading state (see UAT-004 / TASK-215).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { PaginatedResponse } from "@/types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/api/employees", () => ({
  listEmployees: vi.fn(),
}));

vi.mock("@/auth/useAuth", () => ({
  useAuth: () => ({
    user: {
      id: "u-001",
      email: "test@mincom.com",
      roles: ["EMPLOYEE"],
      is_mfa_enabled: false,
    },
    isAuthenticated: true,
    isLoading: false,
    accessToken: "fake-token",
    login: vi.fn(),
    verifyMFA: vi.fn(),
    logout: vi.fn(),
  }),
}));

import { listEmployees } from "@/api/employees";
import type { Employee } from "@/api/employees";
import { EmployeeListPage } from "../pages/EmployeeListPage";

const mockListEmployees = vi.mocked(listEmployees);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPage() {
  return render(
    <MemoryRouter>
      <EmployeeListPage />
    </MemoryRouter>,
  );
}

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: "emp-001",
    employee_number: "EMP001",
    name: "Test Employee",
    job_title: "Engineer",
    department: "dept-001",
    department_name: "Engineering",
    job_family: "IT",
    location: "Accra",
    classification: "NON_MANAGERIAL",
    classification_display: "Non-Managerial",
    ...overrides,
  };
}

function emptyResponse(): PaginatedResponse<Employee[]> {
  return {
    data: [],
    meta: { pagination: { count: 0, next: null, previous: null } },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mockListEmployees.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("EmployeeListPage", () => {
  it("search input is present and not disabled while loading", () => {
    // Mock listEmployees to return a perpetually pending promise so
    // the component stays in loading state for the duration of the test.
    mockListEmployees.mockReturnValue(new Promise(() => {}));

    renderPage();

    const searchInput = screen.getByRole("searchbox", {
      name: /search employees/i,
    });

    expect(searchInput).toBeInTheDocument();
    expect(searchInput).not.toBeDisabled();
  });

  it("shows empty-state message containing the search term", async () => {
    const user = userEvent.setup({
      advanceTimers: vi.advanceTimersByTime,
    });

    mockListEmployees.mockResolvedValue(emptyResponse());

    renderPage();

    // Flush the initial 300ms debounce so the first fetch fires
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    // Wait for the initial fetch to resolve (loading -> empty state)
    await waitFor(() => {
      expect(screen.getByText(/no employees found/i)).toBeInTheDocument();
    });

    // Type a search term into the input
    const searchInput = screen.getByRole("searchbox", {
      name: /search employees/i,
    });
    await user.type(searchInput, "xyz");

    // Advance past the 300ms debounce so the search term propagates
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    // After debounce resolves, the empty state should mention the search term
    await waitFor(() => {
      expect(
        screen.getByText(/no employees found matching "xyz"/i),
      ).toBeInTheDocument();
    });
  });

  it("renders employee rows when data is loaded", async () => {
    const employees = [
      makeEmployee({ id: "emp-001", name: "Jane Doe" }),
      makeEmployee({ id: "emp-002", name: "John Smith" }),
    ];

    mockListEmployees.mockResolvedValue({
      data: employees,
      meta: { pagination: { count: 2, next: null, previous: null } },
    });

    renderPage();

    // Flush the initial debounce
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(screen.getByText("Jane Doe")).toBeInTheDocument();
      expect(screen.getByText("John Smith")).toBeInTheDocument();
    });

    // Search input must still be present and enabled
    const searchInput = screen.getByRole("searchbox", {
      name: /search employees/i,
    });
    expect(searchInput).not.toBeDisabled();
  });
});
