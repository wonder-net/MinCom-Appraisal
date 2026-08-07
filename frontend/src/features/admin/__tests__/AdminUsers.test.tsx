/**
 * Tests for AdminUsers page — verifies user listing, add dialog,
 * edit dialog, deactivation confirmation, and error handling.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminUsers } from "../pages/AdminUsers";

// jsdom does not implement HTMLDialogElement.showModal / .close
beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.close ??= vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  });
});
import type {
  PaginatedResponse,
  AdminUser,
} from "@/types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockListUsers = vi.fn<
  (pageOrUrl?: number | string) => Promise<PaginatedResponse<AdminUser[]>>
>();
const mockCreateUser = vi.fn<
  (data: { email: string; full_name: string; roles: string[] }) => Promise<AdminUser>
>();
const mockUpdateUser = vi.fn<
  (id: string, data: Record<string, unknown>) => Promise<AdminUser>
>();
const mockResendInvitation = vi.fn<(id: string) => Promise<void>>();
const mockResetUserMFA = vi.fn<
  (userId: string, password: string) => Promise<void>
>();
const mockUnlockUser = vi.fn<
  (userId: string, password: string) => Promise<void>
>();

vi.mock("@/api/admin-users", () => ({
  listUsers: (...args: unknown[]) =>
    mockListUsers(args[0] as number | string | undefined),
  createUser: (...args: unknown[]) =>
    mockCreateUser(
      args[0] as { email: string; full_name: string; roles: string[] },
    ),
  updateUser: (...args: unknown[]) =>
    mockUpdateUser(
      args[0] as string,
      args[1] as Record<string, unknown>,
    ),
  resendInvitation: (...args: unknown[]) =>
    mockResendInvitation(args[0] as string),
  INVITATION_ALREADY_USED: "INVITATION_ALREADY_USED",
  resetUserMFA: (...args: unknown[]) =>
    mockResetUserMFA(args[0] as string, args[1] as string),
  isResetMFAError: (err: unknown): boolean =>
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err as { code: unknown }).code === "string" &&
    [
      "INVALID_PASSWORD",
      "MFA_NOT_ENABLED",
      "SELF_RESET_NOT_ALLOWED",
    ].includes((err as { code: string }).code),
  unlockUser: (...args: unknown[]) =>
    mockUnlockUser(args[0] as string, args[1] as string),
  isUnlockUserError: (err: unknown): boolean =>
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err as { code: unknown }).code === "string" &&
    [
      "INVALID_PASSWORD",
      "NOT_LOCKED",
      "SELF_UNLOCK_NOT_ALLOWED",
    ].includes((err as { code: string }).code),
}));

vi.mock("@/api/employees", () => ({
  listDepartments: vi.fn().mockResolvedValue([]),
  listLocations: vi.fn().mockResolvedValue([]),
  listJobFamilies: vi.fn().mockResolvedValue([]),
  listEmployeesForManager: vi.fn().mockResolvedValue([]),
  listEmployees: vi.fn().mockResolvedValue({ data: [], meta: {} }),
}));

// Mock useAuth for RoleGuard — not directly used by AdminUsers but
// needed if RoleGuard is invoked. The page itself doesn't use it.
vi.mock("@/auth/useAuth", () => ({
  useAuth: () => ({
    user: { id: "u-admin", email: "admin@mincom.com", roles: ["HR_ADMIN"], is_mfa_enabled: true, must_change_password: false },
    isAuthenticated: true,
    isLoading: false,
  }),
}));

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
  meta: { count?: number; next?: string | null; previous?: string | null } = {},
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
  vi.clearAllMocks();
});

describe("AdminUsers", () => {
  it("calls listUsers on mount and renders user rows in the table", async () => {
    const users = [
      makeUser({ id: "u-001", full_name: "Kwame Asante", email: "k.asante@mincom.com" }),
      makeUser({ id: "u-002", full_name: "Adjoa Mensah", email: "a.mensah@mincom.com", roles: ["EMPLOYEE"] }),
    ];
    mockListUsers.mockResolvedValueOnce(makeListResponse(users));

    render(<AdminUsers />);

    // Both desktop table and mobile card list render names — use getAllByText
    await waitFor(() => {
      expect(screen.getAllByText("Kwame Asante").length).toBeGreaterThan(0);
    });

    expect(screen.getAllByText("Adjoa Mensah").length).toBeGreaterThan(0);
    expect(screen.getAllByText("k.asante@mincom.com").length).toBeGreaterThan(0);
    expect(screen.getAllByText("a.mensah@mincom.com").length).toBeGreaterThan(0);
    expect(mockListUsers).toHaveBeenCalledTimes(1);
  });

  it("opens Add User dialog, fills form, submits, and calls createUser", async () => {
    const user = userEvent.setup();
    mockListUsers.mockResolvedValueOnce(makeListResponse([]));

    const newUser = makeUser({
      id: "u-new",
      email: "new@mincom.com",
      full_name: "New User",
      roles: ["EMPLOYEE"],
    });
    mockCreateUser.mockResolvedValueOnce(newUser);
    // After success, list is refetched
    mockListUsers.mockResolvedValueOnce(makeListResponse([newUser]));

    render(<AdminUsers />);

    await waitFor(() => {
      expect(screen.getByText("No users found")).toBeInTheDocument();
    });

    // Click the Add User button in the header (first one)
    const addButtons = screen.getAllByText("+ Add User");
    await user.click(addButtons[0]);

    // Dialog should be open
    await waitFor(() => {
      expect(screen.getByText("Add User")).toBeInTheDocument();
    });

    // Fill in the form
    await user.type(screen.getByLabelText(/full name/i), "New User");
    await user.type(screen.getByLabelText(/email address/i), "new@mincom.com");

    // Select EMPLOYEE role from the dropdown
    await user.selectOptions(screen.getByLabelText(/^Role/), "EMPLOYEE");

    // Submit
    await user.click(screen.getByRole("button", { name: "Create User" }));

    await waitFor(() => {
      expect(mockCreateUser).toHaveBeenCalledWith({
        email: "new@mincom.com",
        full_name: "New User",
        roles: ["EMPLOYEE"],
      });
    });

    // List should be refetched
    await waitFor(() => {
      expect(mockListUsers).toHaveBeenCalledTimes(2);
    });
  });

  it("shows inline error when createUser returns 409 conflict", async () => {
    const user = userEvent.setup();
    mockListUsers.mockResolvedValueOnce(makeListResponse([]));

    const axiosError = Object.assign(new Error("Conflict"), {
      isAxiosError: true,
      response: { status: 409, data: { data: { message: "Duplicate email" } } },
    });
    mockCreateUser.mockRejectedValueOnce(axiosError);

    render(<AdminUsers />);

    await waitFor(() => {
      expect(screen.getByText("No users found")).toBeInTheDocument();
    });

    const addButtons = screen.getAllByText("+ Add User");
    await user.click(addButtons[0]);

    await waitFor(() => {
      expect(screen.getByText("Add User")).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/full name/i), "Test User");
    await user.type(screen.getByLabelText(/email address/i), "existing@mincom.com");
    await user.selectOptions(screen.getByLabelText(/^Role/), "EMPLOYEE");
    await user.click(screen.getByRole("button", { name: "Create User" }));

    await waitFor(() => {
      expect(
        screen.getByText("A user with this email already exists"),
      ).toBeInTheDocument();
    });
  });

  it("opens edit dialog with pre-filled data when user row is clicked; email is read-only", async () => {
    const user = userEvent.setup();
    const existingUser = makeUser({
      id: "u-001",
      full_name: "Kwame Asante",
      email: "k.asante@mincom.com",
      roles: ["MANAGER"],
    });
    mockListUsers.mockResolvedValueOnce(makeListResponse([existingUser]));

    render(<AdminUsers />);

    await waitFor(() => {
      expect(screen.getAllByText("Kwame Asante").length).toBeGreaterThan(0);
    });

    // Click the Edit button (in the desktop table)
    await user.click(screen.getByRole("button", { name: "Edit Kwame Asante" }));

    await waitFor(() => {
      expect(screen.getByText("Edit User")).toBeInTheDocument();
    });

    // Email should be read-only
    const emailInput = screen.getByLabelText(/email address/i);
    expect(emailInput).toHaveAttribute("readOnly");
    expect(emailInput).toHaveValue("k.asante@mincom.com");

    // Full name should be pre-filled
    const nameInput = screen.getByLabelText(/full name/i);
    expect(nameInput).toHaveValue("Kwame Asante");

    // MANAGER role should be pre-selected in the dropdown
    const roleSelect = screen.getByLabelText(/^Role/) as HTMLSelectElement;
    expect(roleSelect.value).toBe("MANAGER");
  });

  it("shows deactivation AlertDialog when toggling is_active to false, and calls updateUser on confirm", async () => {
    const user = userEvent.setup();
    const existingUser = makeUser({
      id: "u-001",
      full_name: "Kwame Asante",
      is_active: true,
    });
    mockListUsers.mockResolvedValueOnce(makeListResponse([existingUser]));

    const updatedUser = makeUser({
      ...existingUser,
      is_active: false,
    });
    mockUpdateUser.mockResolvedValueOnce(updatedUser);
    // After success, list is refetched
    mockListUsers.mockResolvedValueOnce(makeListResponse([updatedUser]));

    render(<AdminUsers />);

    await waitFor(() => {
      expect(screen.getAllByText("Kwame Asante").length).toBeGreaterThan(0);
    });

    // Open edit dialog
    await user.click(screen.getByRole("button", { name: "Edit Kwame Asante" }));

    await waitFor(() => {
      expect(screen.getByText("Edit User")).toBeInTheDocument();
    });

    // Toggle the active checkbox off
    const toggles = screen.getAllByLabelText("Toggle account active status");
    // The input is the sr-only checkbox
    const activeToggle = toggles.find(
      (el) => el.tagName === "INPUT",
    ) as HTMLInputElement;
    expect(activeToggle).toBeDefined();
    await user.click(activeToggle);

    // AlertDialog should appear
    await waitFor(() => {
      expect(screen.getByText("Deactivate account?")).toBeInTheDocument();
    });

    expect(
      screen.getByText(
        "Deactivating this user will immediately log them out of all active sessions. Continue?",
      ),
    ).toBeInTheDocument();

    // Click Deactivate
    await user.click(screen.getByRole("button", { name: "Deactivate" }));

    // AlertDialog should close
    await waitFor(() => {
      expect(screen.queryByText("Deactivate account?")).not.toBeInTheDocument();
    });

    // Now submit the edit form
    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledWith("u-001", {
        is_active: false,
      });
    });
  });

  it("shows empty state when no users exist", async () => {
    mockListUsers.mockResolvedValueOnce(makeListResponse([]));

    render(<AdminUsers />);

    await waitFor(() => {
      expect(screen.getByText("No users found")).toBeInTheDocument();
    });

    expect(
      screen.getByText("Add the first user account to get started."),
    ).toBeInTheDocument();
  });

  it("shows error state and retry button when listUsers fails", async () => {
    const user = userEvent.setup();
    mockListUsers.mockRejectedValueOnce(new Error("Network error"));

    render(<AdminUsers />);

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();

    // Retry should call listUsers again
    mockListUsers.mockResolvedValueOnce(makeListResponse([]));
    await user.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(mockListUsers).toHaveBeenCalledTimes(2);
    });
  });

  it("renders Resend Invitation button when must_change_password is true", async () => {
    const users = [
      makeUser({ id: "u-001", full_name: "New User", email: "new@mincom.com", must_change_password: true }),
      makeUser({ id: "u-002", full_name: "Active User", email: "active@mincom.com", must_change_password: false }),
    ];
    mockListUsers.mockResolvedValueOnce(makeListResponse(users));

    render(<AdminUsers />);

    await waitFor(() => {
      expect(screen.getAllByText("New User").length).toBeGreaterThan(0);
    });

    // "Resend Invitation" should appear for the first user (desktop + mobile = 2)
    const resendButtons = screen.getAllByLabelText("Resend invitation to New User");
    expect(resendButtons.length).toBeGreaterThan(0);

    // Should NOT appear for the second user
    expect(screen.queryByLabelText("Resend invitation to Active User")).not.toBeInTheDocument();
  });

  it("shows success toast when resendInvitation resolves", async () => {
    const user = userEvent.setup();
    mockResendInvitation.mockResolvedValueOnce(undefined);

    const users = [
      makeUser({ id: "u-001", full_name: "New User", email: "new@mincom.com", must_change_password: true }),
    ];
    mockListUsers.mockResolvedValueOnce(makeListResponse(users));

    render(<AdminUsers />);

    await waitFor(() => {
      expect(screen.getAllByText("New User").length).toBeGreaterThan(0);
    });

    // Click resend button to open the confirm dialog
    const resendButtons = screen.getAllByLabelText("Resend invitation to New User");
    await user.click(resendButtons[0]);

    // Find the confirm dialog and click the confirm button inside it
    const dialog = await screen.findByRole("alertdialog");
    const { within } = await import("@testing-library/react");
    const confirmButton = within(dialog).getByRole("button", { name: /resend/i });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(screen.getByText("Invitation email resent to new@mincom.com")).toBeInTheDocument();
    });

    expect(mockResendInvitation).toHaveBeenCalledWith("u-001");
  });

  it("shows already-set toast when resendInvitation rejects with INVITATION_ALREADY_USED", async () => {
    const user = userEvent.setup();
    mockResendInvitation.mockRejectedValueOnce({ code: "INVITATION_ALREADY_USED" });

    const users = [
      makeUser({ id: "u-001", full_name: "New User", email: "new@mincom.com", must_change_password: true }),
    ];
    mockListUsers.mockResolvedValueOnce(makeListResponse(users));

    render(<AdminUsers />);

    await waitFor(() => {
      expect(screen.getAllByText("New User").length).toBeGreaterThan(0);
    });

    // Click resend button to open the confirm dialog
    const resendButtons = screen.getAllByLabelText("Resend invitation to New User");
    await user.click(resendButtons[0]);

    // Find the confirm dialog and click the confirm button inside it
    const dialog = await screen.findByRole("alertdialog");
    const { within } = await import("@testing-library/react");
    const confirmButton = within(dialog).getByRole("button", { name: /resend/i });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(screen.getByText("This user has already set their own password.")).toBeInTheDocument();
    });
  });

  it("opens EditUserDialog, clicks Reset MFA, enters password, confirms, calls resetUserMFA and refetches", async () => {
    const user = userEvent.setup();
    mockResetUserMFA.mockResolvedValueOnce(undefined);

    const target = makeUser({
      id: "u-001",
      full_name: "MFA User",
      email: "mfa@mincom.com",
      mfa_enabled: true,
    });
    mockListUsers.mockResolvedValueOnce(makeListResponse([target]));
    // After success, list is refetched
    mockListUsers.mockResolvedValueOnce(makeListResponse([target]));

    render(<AdminUsers />);

    await waitFor(() => {
      expect(screen.getAllByText("MFA User").length).toBeGreaterThan(0);
    });

    // Open the edit dialog for the target user
    await user.click(screen.getByRole("button", { name: "Edit MFA User" }));

    await waitFor(() => {
      expect(screen.getByText("Edit User")).toBeInTheDocument();
    });

    // The Reset MFA button now lives inside EditUserDialog
    await user.click(
      screen.getByRole("button", { name: "Reset MFA for MFA User" }),
    );

    // ResetMFAAlert opens
    await waitFor(() => {
      expect(screen.getByText("Reset MFA?")).toBeInTheDocument();
    });

    await user.type(
      screen.getByLabelText("Your password"),
      "admin-password-123",
    );

    const dialog = screen.getByRole("alertdialog");
    const { within } = await import("@testing-library/react");
    await user.click(within(dialog).getByRole("button", { name: "Reset MFA" }));

    await waitFor(() => {
      expect(mockResetUserMFA).toHaveBeenCalledWith("u-001", "admin-password-123");
    });

    // Alert dialog closes
    await waitFor(() => {
      expect(screen.queryByText("Reset MFA?")).not.toBeInTheDocument();
    });

    // Parent refetch was triggered
    await waitFor(() => {
      expect(mockListUsers).toHaveBeenCalledTimes(2);
    });

    // Success toast surfaces (rendered inside the EditUserDialog ToastContainer)
    expect(
      screen.getByText(/MFA reset for MFA User/),
    ).toBeInTheDocument();
  });

  it("shows inline 'Incorrect password' when resetUserMFA rejects with INVALID_PASSWORD", async () => {
    const user = userEvent.setup();
    mockResetUserMFA.mockRejectedValueOnce({ code: "INVALID_PASSWORD" });

    const target = makeUser({
      id: "u-001",
      full_name: "MFA User",
      email: "mfa@mincom.com",
      mfa_enabled: true,
    });
    mockListUsers.mockResolvedValueOnce(makeListResponse([target]));

    render(<AdminUsers />);

    await waitFor(() => {
      expect(screen.getAllByText("MFA User").length).toBeGreaterThan(0);
    });

    // Open EditUserDialog, then click Reset MFA inside it
    await user.click(screen.getByRole("button", { name: "Edit MFA User" }));

    await waitFor(() => {
      expect(screen.getByText("Edit User")).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole("button", { name: "Reset MFA for MFA User" }),
    );

    await waitFor(() => {
      expect(screen.getByText("Reset MFA?")).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText("Your password"), "wrong-password");

    const dialog = screen.getByRole("alertdialog");
    const { within } = await import("@testing-library/react");
    await user.click(within(dialog).getByRole("button", { name: "Reset MFA" }));

    await waitFor(() => {
      expect(screen.getByText("Incorrect password")).toBeInTheDocument();
    });

    // Alert dialog stays open
    expect(screen.getByText("Reset MFA?")).toBeInTheDocument();
  });

  it("does not call resendInvitation when confirm dialog is cancelled", async () => {
    const user = userEvent.setup();

    const users = [
      makeUser({ id: "u-001", full_name: "New User", email: "new@mincom.com", must_change_password: true }),
    ];
    mockListUsers.mockResolvedValueOnce(makeListResponse(users));

    render(<AdminUsers />);

    await waitFor(() => {
      expect(screen.getAllByText("New User").length).toBeGreaterThan(0);
    });

    // Click resend button to open the confirm dialog
    const resendButtons = screen.getAllByLabelText("Resend invitation to New User");
    await user.click(resendButtons[0]);

    // Find the confirm dialog and click the cancel button inside it
    const dialog = await screen.findByRole("alertdialog");
    const { within } = await import("@testing-library/react");
    const cancelButton = within(dialog).getByText("Cancel");
    await user.click(cancelButton);

    expect(mockResendInvitation).not.toHaveBeenCalled();
  });

  it("opens EditUserDialog, clicks Unlock account, enters password, confirms, calls unlockUser and refetches", async () => {
    const user = userEvent.setup();
    mockUnlockUser.mockResolvedValueOnce(undefined);

    const target = makeUser({
      id: "u-001",
      full_name: "Locked User",
      email: "locked@mincom.com",
      is_locked: true,
    });
    mockListUsers.mockResolvedValueOnce(makeListResponse([target]));
    // After success, list is refetched
    mockListUsers.mockResolvedValueOnce(makeListResponse([target]));

    render(<AdminUsers />);

    await waitFor(() => {
      expect(screen.getAllByText("Locked User").length).toBeGreaterThan(0);
    });

    // Open the edit dialog for the target user
    await user.click(
      screen.getByRole("button", { name: "Edit Locked User" }),
    );

    await waitFor(() => {
      expect(screen.getByText("Edit User")).toBeInTheDocument();
    });

    // Click the Unlock account button inside EditUserDialog
    await user.click(
      screen.getByRole("button", { name: "Unlock account for Locked User" }),
    );

    // UnlockAccountAlert opens
    await waitFor(() => {
      expect(screen.getByText("Unlock account?")).toBeInTheDocument();
    });

    await user.type(
      screen.getByLabelText("Your password"),
      "admin-password-123",
    );

    const dialog = screen.getByRole("alertdialog");
    const { within } = await import("@testing-library/react");
    await user.click(
      within(dialog).getByRole("button", { name: "Unlock account" }),
    );

    await waitFor(() => {
      expect(mockUnlockUser).toHaveBeenCalledWith(
        "u-001",
        "admin-password-123",
      );
    });

    // Alert dialog closes
    await waitFor(() => {
      expect(screen.queryByText("Unlock account?")).not.toBeInTheDocument();
    });

    // Parent refetch was triggered
    await waitFor(() => {
      expect(mockListUsers).toHaveBeenCalledTimes(2);
    });

    // Success toast surfaces (rendered inside the EditUserDialog ToastContainer)
    expect(
      screen.getByText(/Locked User's account has been unlocked/),
    ).toBeInTheDocument();
  });
});
