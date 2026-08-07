/**
 * Unit tests for EditUserDialog — focused on the department
 * lookup error handling, Save button disable behaviour, and
 * the Reset MFA action visibility gate.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mockUpdateUser = vi.fn();
const mockResetUserMFA = vi.fn();
const mockUnlockUser = vi.fn();
const mockListDepartments = vi.fn();
const mockListLocations = vi.fn();
const mockListJobFamilies = vi.fn();

vi.mock("@/api/admin-users", () => ({
  updateUser: (...args: unknown[]) => mockUpdateUser(...args),
  resetUserMFA: (...args: unknown[]) => mockResetUserMFA(...args),
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
  unlockUser: (...args: unknown[]) => mockUnlockUser(...args),
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
  listDepartments: () => mockListDepartments(),
  listLocations: () => mockListLocations(),
  listJobFamilies: () => mockListJobFamilies(),
  listEmployeesForManager: vi.fn().mockResolvedValue([]),
  listEmployees: vi.fn().mockResolvedValue({ data: [], meta: {} }),
}));

// Default useAuth mock returns an admin distinct from the editable target
// user (id "u-001"); individual tests can override per-render via the
// mock implementation below.
const mockUseAuth = vi.fn(() => ({
  user: {
    id: "u-admin",
    email: "admin@mincom.com",
    roles: ["HR_ADMIN"],
    is_mfa_enabled: true,
    employee_id: null,
    must_change_password: false,
  },
  isAuthenticated: true,
  isLoading: false,
}));

vi.mock("@/auth/useAuth", () => ({
  useAuth: () => mockUseAuth(),
}));

import { EditUserDialog } from "../EditUserDialog";
import type { AdminUser } from "@/types";

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

describe("EditUserDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("disables the Save button when useEmployeeLookups returns isError=true", async () => {
    mockListDepartments.mockRejectedValue(new Error("Network error"));
    mockListLocations.mockResolvedValue(["Head Office"]);
    mockListJobFamilies.mockResolvedValue(["Accounting"]);

    render(
      <EditUserDialog
        user={makeUser()}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    await waitFor(() => {
      const saveButton = screen.getByRole("button", {
        name: /Save Changes/,
      });
      expect(saveButton).toBeDisabled();
    });
  });

  it("enables the Save button when useEmployeeLookups returns isError=false", async () => {
    mockListDepartments.mockResolvedValue([
      { id: "dept-1", name: "Finance" },
    ]);
    mockListLocations.mockResolvedValue(["Head Office"]);
    mockListJobFamilies.mockResolvedValue(["Accounting"]);

    render(
      <EditUserDialog
        user={makeUser()}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    await waitFor(() => {
      const saveButton = screen.getByRole("button", {
        name: /Save Changes/,
      });
      expect(saveButton).toBeEnabled();
    });
  });

  it("shows department error message when lookups fail", async () => {
    mockListDepartments.mockRejectedValue(new Error("Network error"));
    mockListLocations.mockResolvedValue(["Head Office"]);
    mockListJobFamilies.mockResolvedValue(["Accounting"]);

    render(
      <EditUserDialog
        user={makeUser()}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText(
          "Could not load departments. Please try again.",
        ),
      ).toBeInTheDocument();
    });
  });

  describe("Reset MFA visibility gate", () => {
    beforeEach(() => {
      mockListDepartments.mockResolvedValue([
        { id: "dept-1", name: "Finance" },
      ]);
      mockListLocations.mockResolvedValue(["Head Office"]);
      mockListJobFamilies.mockResolvedValue(["Accounting"]);
    });

    it("renders the Reset MFA button when target user has MFA enabled and is not the current user", async () => {
      render(
        <EditUserDialog
          user={makeUser({
            id: "u-001",
            full_name: "Kwame Asante",
            mfa_enabled: true,
          })}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(
          screen.getByRole("button", {
            name: "Reset MFA for Kwame Asante",
          }),
        ).toBeInTheDocument();
      });
    });

    it("does not render the Reset MFA button when target user has MFA disabled", async () => {
      render(
        <EditUserDialog
          user={makeUser({
            id: "u-001",
            full_name: "No MFA User",
            mfa_enabled: false,
          })}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
        />,
      );

      // Wait for dialog form to render
      await waitFor(() => {
        expect(screen.getByText("Edit User")).toBeInTheDocument();
      });

      expect(
        screen.queryByRole("button", {
          name: /Reset MFA for No MFA User/,
        }),
      ).not.toBeInTheDocument();
    });

    it("does not render the Reset MFA button when editing the currently signed-in user", async () => {
      // Target user.id matches current user.id
      render(
        <EditUserDialog
          user={makeUser({
            id: "u-admin",
            full_name: "Self Admin",
            mfa_enabled: true,
          })}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("Edit User")).toBeInTheDocument();
      });

      expect(
        screen.queryByRole("button", {
          name: /Reset MFA for Self Admin/,
        }),
      ).not.toBeInTheDocument();
    });
  });

  describe("Unlock account visibility gate", () => {
    beforeEach(() => {
      mockListDepartments.mockResolvedValue([
        { id: "dept-1", name: "Finance" },
      ]);
      mockListLocations.mockResolvedValue(["Head Office"]);
      mockListJobFamilies.mockResolvedValue(["Accounting"]);
    });

    it("renders the Unlock account button when target user is locked and is not the current user", async () => {
      render(
        <EditUserDialog
          user={makeUser({
            id: "u-001",
            full_name: "Locked User",
            is_locked: true,
          })}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(
          screen.getByRole("button", {
            name: "Unlock account for Locked User",
          }),
        ).toBeInTheDocument();
      });
    });

    it("does not render the Unlock account button when target user is not locked", async () => {
      render(
        <EditUserDialog
          user={makeUser({
            id: "u-001",
            full_name: "Unlocked User",
            is_locked: false,
          })}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("Edit User")).toBeInTheDocument();
      });

      expect(
        screen.queryByRole("button", {
          name: /Unlock account for Unlocked User/,
        }),
      ).not.toBeInTheDocument();
    });

    it("does not render the Unlock account button when editing the currently signed-in user", async () => {
      // Target user.id matches current user.id ("u-admin")
      render(
        <EditUserDialog
          user={makeUser({
            id: "u-admin",
            full_name: "Self Admin",
            is_locked: true,
          })}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("Edit User")).toBeInTheDocument();
      });

      expect(
        screen.queryByRole("button", {
          name: /Unlock account for Self Admin/,
        }),
      ).not.toBeInTheDocument();
    });
  });

  describe("Single-role dropdown", () => {
    beforeEach(() => {
      mockListDepartments.mockResolvedValue([
        { id: "dept-1", name: "Finance" },
      ]);
      mockListLocations.mockResolvedValue(["Head Office"]);
      mockListJobFamilies.mockResolvedValue(["Accounting"]);
      mockUpdateUser.mockResolvedValue(undefined);
    });

    it("pre-selects the first role for users with a single role", async () => {
      render(
        <EditUserDialog
          user={makeUser({ roles: ["MANAGER"] })}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
        />,
      );

      await waitFor(() => {
        const dropdown = screen.getByLabelText(/^Role/) as HTMLSelectElement;
        expect(dropdown.value).toBe("MANAGER");
      });
    });

    it("shows a multi-role notice when the user has more than one role", async () => {
      render(
        <EditUserDialog
          user={makeUser({ roles: ["HR_ADMIN", "MANAGER"] })}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(
          screen.getByText(
            /This user currently has multiple roles:\s*HR Admin,\s*Appraisor/i,
          ),
        ).toBeInTheDocument();
      });

      // First role is pre-selected
      const dropdown = screen.getByLabelText(/^Role/) as HTMLSelectElement;
      expect(dropdown.value).toBe("HR_ADMIN");
    });

    it("does not show the multi-role notice for users with a single role", async () => {
      render(
        <EditUserDialog
          user={makeUser({ roles: ["MANAGER"] })}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("Edit User")).toBeInTheDocument();
      });

      expect(
        screen.queryByText(/This user currently has multiple roles/i),
      ).not.toBeInTheDocument();
    });

    it("sends roles: [<new>] in the PATCH when the dropdown is changed, with the HR Director label rendered for HR_OFFICER", async () => {
      render(
        <EditUserDialog
          user={makeUser({ roles: ["MANAGER"] })}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
        />,
      );

      const dropdown = await waitFor(() => {
        const el = screen.getByLabelText(/^Role/) as HTMLSelectElement;
        expect(el.value).toBe("MANAGER");
        return el;
      });

      // Guard against future rename regressions: the user-visible
      // option for the HR_OFFICER value must read "HR Director" (per
      // TASK-279). Look up the option element directly to assert the
      // label-to-value mapping.
      const hrOfficerOption = Array.from(dropdown.options).find(
        (opt) => opt.value === "HR_OFFICER",
      );
      expect(hrOfficerOption).toBeDefined();
      expect(hrOfficerOption?.textContent).toBe("HR Director");

      fireEvent.change(dropdown, { target: { value: "HR_OFFICER" } });
      fireEvent.click(
        screen.getByRole("button", { name: /Save Changes/ }),
      );

      await waitFor(() => {
        expect(mockUpdateUser).toHaveBeenCalledWith(
          "u-001",
          expect.objectContaining({ roles: ["HR_OFFICER"] }),
        );
      });
    });

    it("does not include 'roles' in the PATCH payload when only a non-role field changes", async () => {
      render(
        <EditUserDialog
          user={makeUser({
            roles: ["MANAGER"],
            full_name: "Kwame Asante",
          })}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
        />,
      );

      // Wait for the form to be ready (role dropdown reflects user state).
      await waitFor(() => {
        const dropdown = screen.getByLabelText(/^Role/) as HTMLSelectElement;
        expect(dropdown.value).toBe("MANAGER");
      });

      const fullNameInput = screen.getByLabelText(
        /Full name/,
      ) as HTMLInputElement;
      fireEvent.change(fullNameInput, {
        target: { value: "Kwame A. Asante" },
      });

      fireEvent.click(
        screen.getByRole("button", { name: /Save Changes/ }),
      );

      await waitFor(() => {
        expect(mockUpdateUser).toHaveBeenCalledTimes(1);
      });

      const [, payload] = mockUpdateUser.mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];
      expect(payload.full_name).toBe("Kwame A. Asante");
      expect(payload).not.toHaveProperty("roles");
    });

    it("pre-selects the same role regardless of backend role array ordering", async () => {
      // Same multi-role set, different array orders — both should
      // pre-select HR_ADMIN (highest priority in ROLE_PRIORITY).
      const { unmount } = render(
        <EditUserDialog
          user={makeUser({ roles: ["MANAGER", "HR_ADMIN", "EMPLOYEE"] })}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
        />,
      );

      await waitFor(() => {
        const dropdown = screen.getByLabelText(/^Role/) as HTMLSelectElement;
        expect(dropdown.value).toBe("HR_ADMIN");
      });

      unmount();

      render(
        <EditUserDialog
          user={makeUser({ roles: ["EMPLOYEE", "MANAGER", "HR_ADMIN"] })}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
        />,
      );

      await waitFor(() => {
        const dropdown = screen.getByLabelText(/^Role/) as HTMLSelectElement;
        expect(dropdown.value).toBe("HR_ADMIN");
      });
    });

    it("reduces a multi-role user to the single chosen role on save", async () => {
      render(
        <EditUserDialog
          user={makeUser({ roles: ["HR_ADMIN", "MANAGER"] })}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
        />,
      );

      const dropdown = await waitFor(() => {
        const el = screen.getByLabelText(/^Role/) as HTMLSelectElement;
        expect(el.value).toBe("HR_ADMIN");
        return el;
      });

      fireEvent.change(dropdown, { target: { value: "EXECUTIVE" } });
      fireEvent.click(
        screen.getByRole("button", { name: /Save Changes/ }),
      );

      await waitFor(() => {
        expect(mockUpdateUser).toHaveBeenCalledWith(
          "u-001",
          expect.objectContaining({ roles: ["EXECUTIVE"] }),
        );
      });
    });

    it("shows a validation error when the role is cleared and save is clicked", async () => {
      render(
        <EditUserDialog
          user={makeUser({ roles: ["MANAGER"] })}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
        />,
      );

      const dropdown = await waitFor(() => {
        const el = screen.getByLabelText(/^Role/) as HTMLSelectElement;
        expect(el.value).toBe("MANAGER");
        return el;
      });

      fireEvent.change(dropdown, { target: { value: "" } });
      fireEvent.click(
        screen.getByRole("button", { name: /Save Changes/ }),
      );

      await waitFor(() => {
        expect(screen.getByText("Please select a role")).toBeInTheDocument();
      });
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });
  });
});
