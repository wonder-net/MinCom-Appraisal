/**
 * Regression tests for AdminUsers search propagation — guards against
 * the search input being disabled or not propagating the search term
 * to the listUsers API call (see UAT-005 / TASK-216).
 *
 * Uses API-level mocking with fake timers to verify debounced search
 * terms reach the listUsers API call.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PaginatedResponse, AdminUser } from "@/types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/api/admin-users", () => ({
  listUsers: vi.fn(),
  resendInvitation: vi.fn(),
  INVITATION_ALREADY_USED: "INVITATION_ALREADY_USED",
}));

vi.mock("@/api/employees", () => ({
  listDepartments: vi.fn().mockResolvedValue([]),
  listLocations: vi.fn().mockResolvedValue([]),
  listJobFamilies: vi.fn().mockResolvedValue([]),
  listEmployeesForManager: vi.fn().mockResolvedValue([]),
  listEmployees: vi.fn().mockResolvedValue({ data: [], meta: {} }),
}));

vi.mock("@/auth/useAuth", () => ({
  useAuth: () => ({
    user: {
      id: "u-admin",
      email: "admin@mincom.com",
      roles: ["HR_ADMIN"],
      is_mfa_enabled: true,
      must_change_password: false,
    },
    isAuthenticated: true,
    isLoading: false,
  }),
}));

import { listUsers } from "@/api/admin-users";
import { AdminUsers } from "../pages/AdminUsers";

const mockListUsers = vi.mocked(listUsers);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUser(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id: "u-001",
    email: "k.asante@mincom.com",
    full_name: "Kwame Asante",
    roles: ["MANAGER"],
    is_active: true,
    mfa_enabled: true,
    last_login: "2026-03-18T08:31:00Z",
    employee_id: null,
    employee_name: null,
    employee_number: null,
    job_title: null,
    job_family: null,
    department_id: null,
    department_name: null,
    location: null,
    classification: null,
    manager_id: null,
    manager_name: null,
    must_change_password: false,
    is_locked: false,
    ...overrides,
  };
}

function makeListResponse(
  users: AdminUser[],
  meta: {
    count?: number;
    next?: string | null;
    previous?: string | null;
  } = {},
): PaginatedResponse<AdminUser[]> {
  return {
    data: users,
    meta: {
      pagination: {
        count: meta.count ?? users.length,
        next: meta.next ?? null,
        previous: meta.previous ?? null,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AdminUsers — search propagation", () => {
  it("search input is present and NOT disabled after initial load", async () => {
    mockListUsers.mockResolvedValue(
      makeListResponse([makeUser()]),
    );

    render(<AdminUsers />);

    // Wait for the initial load to complete
    await waitFor(() => {
      expect(screen.getAllByText("Kwame Asante").length).toBeGreaterThan(0);
    });

    const searchInput = screen.getByRole("searchbox", {
      name: /search users/i,
    });
    expect(searchInput).toBeInTheDocument();
    expect(searchInput).not.toBeDisabled();
  });

  it("typing 'bob' triggers a debounced listUsers call with the search term", async () => {
    const user = userEvent.setup({
      advanceTimers: vi.advanceTimersByTime,
    });

    mockListUsers.mockResolvedValue(
      makeListResponse([makeUser()]),
    );

    render(<AdminUsers />);

    // Wait for initial load to complete
    await waitFor(() => {
      expect(screen.getAllByText("Kwame Asante").length).toBeGreaterThan(0);
    });

    // Clear mock to isolate the search-triggered call
    mockListUsers.mockClear();
    mockListUsers.mockResolvedValue(makeListResponse([]));

    // Type into the search input
    const searchInput = screen.getByRole("searchbox", {
      name: /search users/i,
    });
    await user.type(searchInput, "bob");

    // Advance past the 300ms debounce
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    // listUsers should have been called with the search term
    await waitFor(() => {
      const calls = mockListUsers.mock.calls;
      const hasSearchCall = calls.some(
        (call) => call[1] === "bob",
      );
      expect(hasSearchCall).toBe(true);
    });
  });

  it("changing search resets to page 1 (listUsers called without page cursor)", async () => {
    const user = userEvent.setup({
      advanceTimers: vi.advanceTimersByTime,
    });

    mockListUsers.mockResolvedValue(
      makeListResponse(
        [makeUser()],
        {
          count: 40,
          next: "http://localhost/api/v1/admin/users/?page=2",
          previous: null,
        },
      ),
    );

    render(<AdminUsers />);

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getAllByText("Kwame Asante").length).toBeGreaterThan(0);
    });

    // Navigate to page 2
    mockListUsers.mockResolvedValue(
      makeListResponse(
        [makeUser({ id: "u-002", full_name: "Page Two User" })],
        {
          count: 40,
          next: null,
          previous: "http://localhost/api/v1/admin/users/?page=1",
        },
      ),
    );

    const nextButton = screen.getByRole("button", { name: /next page/i });
    await user.click(nextButton);

    await waitFor(() => {
      expect(screen.getAllByText("Page Two User").length).toBeGreaterThan(0);
    });

    // Clear mock to isolate the search call
    mockListUsers.mockClear();
    mockListUsers.mockResolvedValue(makeListResponse([]));

    // Type a search term
    const searchInput = screen.getByRole("searchbox", {
      name: /search users/i,
    });
    await user.type(searchInput, "test");

    // Advance past debounce
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    // The hook resets pageUrl to undefined when search changes.
    // After the reset re-render, listUsers is called with undefined page cursor.
    await waitFor(() => {
      const calls = mockListUsers.mock.calls;
      // Find the final call with the search term and no page cursor
      const resetCall = calls.find(
        (call) => call[0] === undefined && call[1] === "test",
      );
      expect(resetCall).toBeDefined();
    });
  });

  it("empty/whitespace search does not send search param", async () => {
    const user = userEvent.setup({
      advanceTimers: vi.advanceTimersByTime,
    });

    mockListUsers.mockResolvedValue(
      makeListResponse([makeUser()]),
    );

    render(<AdminUsers />);

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getAllByText("Kwame Asante").length).toBeGreaterThan(0);
    });

    // Type something
    const searchInput = screen.getByRole("searchbox", {
      name: /search users/i,
    });
    await user.type(searchInput, "bob");

    // Advance past debounce
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(mockListUsers.mock.calls.some((call) => call[1] === "bob")).toBe(
        true,
      );
    });

    // Wait for the component to settle after the "bob" search resolves
    await waitFor(() => {
      expect(
        screen.getByRole("searchbox", { name: /search users/i }),
      ).toBeInTheDocument();
    });

    // Clear the mock and delete typed text using keyboard
    mockListUsers.mockClear();
    mockListUsers.mockResolvedValue(
      makeListResponse([makeUser()]),
    );

    // Re-query the input in case the DOM was updated
    const currentInput = screen.getByRole("searchbox", {
      name: /search users/i,
    });
    // Select all text and delete it
    await user.tripleClick(currentInput);
    await user.keyboard("{Backspace}");

    // Advance past debounce
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    // listUsers should be called with empty string search
    // (the useDebounce hook delivers "" which listUsers treats as no search)
    await waitFor(() => {
      const calls = mockListUsers.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const lastCall = calls[calls.length - 1];
      // The search argument should be empty string
      expect(lastCall[1] === "" || lastCall[1] === undefined).toBe(true);
    });
  });
});
