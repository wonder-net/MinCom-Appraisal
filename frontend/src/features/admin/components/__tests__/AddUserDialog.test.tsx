/**
 * Integration/smoke tests for the expanded AddUserDialog.
 *
 * Verifies that the dialog submits the correct payload shape
 * including employee profile fields when filled in, and that the
 * new single-role dropdown validates and submits correctly.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mock API modules before imports
const mockCreateUser = vi.fn();
const mockListDepartments = vi.fn();
const mockListLocations = vi.fn();
const mockListJobFamilies = vi.fn();

vi.mock("@/api/admin-users", () => ({
  createUser: (...args: unknown[]) => mockCreateUser(...args),
}));

vi.mock("@/api/employees", () => ({
  listDepartments: () => mockListDepartments(),
  listLocations: () => mockListLocations(),
  listJobFamilies: () => mockListJobFamilies(),
  listEmployeesForManager: vi.fn().mockResolvedValue([]),
  listEmployees: vi.fn().mockResolvedValue({ data: [], meta: {} }),
}));

import { AddUserDialog } from "../AddUserDialog";

function selectRole(label: string) {
  const dropdown = screen.getByLabelText(/^Role/);
  fireEvent.change(dropdown, { target: { value: label } });
}

describe("AddUserDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListDepartments.mockResolvedValue([
      { id: "dept-1", name: "Finance" },
      { id: "dept-2", name: "IT" },
    ]);
    mockListLocations.mockResolvedValue(["Head Office", "Branch A"]);
    mockListJobFamilies.mockResolvedValue(["Accounting", "Engineering"]);
    mockCreateUser.mockResolvedValue({
      id: "user-1",
      email: "test@mincom.com",
      full_name: "Test User",
      roles: ["EMPLOYEE"],
    });
  });

  it("renders both Account and Employee Profile fieldsets", async () => {
    render(
      <AddUserDialog isOpen onClose={vi.fn()} onSuccess={vi.fn()} />,
    );

    expect(screen.getByText("Account")).toBeInTheDocument();
    expect(screen.getByText(/Employee Profile/)).toBeInTheDocument();
  });

  it("renders the single-role dropdown with all five role options", () => {
    render(
      <AddUserDialog isOpen onClose={vi.fn()} onSuccess={vi.fn()} />,
    );

    const dropdown = screen.getByLabelText(/^Role/) as HTMLSelectElement;
    const labels = Array.from(dropdown.options).map((o) => o.textContent);
    expect(labels).toEqual(
      expect.arrayContaining([
        "— Select a role —",
        "Appraisee",
        "Appraisor",
        "HR Director",
        "HR Admin",
        "Executive",
      ]),
    );
  });

  it("submits account-only payload (roles wrapped in array) when employee fields are empty", async () => {
    const onSuccess = vi.fn();
    render(
      <AddUserDialog isOpen onClose={vi.fn()} onSuccess={onSuccess} />,
    );

    fireEvent.change(screen.getByLabelText(/Full name/), {
      target: { value: "Abena Owusu" },
    });
    fireEvent.change(screen.getByLabelText(/Email address/), {
      target: { value: "abena@mincom.com" },
    });

    selectRole("EMPLOYEE");

    fireEvent.click(screen.getByRole("button", { name: /Create User/ }));

    await waitFor(() => {
      expect(mockCreateUser).toHaveBeenCalledWith({
        email: "abena@mincom.com",
        full_name: "Abena Owusu",
        roles: ["EMPLOYEE"],
      });
    });
  });

  it("shows a validation error when submitting without selecting a role", async () => {
    render(
      <AddUserDialog isOpen onClose={vi.fn()} onSuccess={vi.fn()} />,
    );

    fireEvent.change(screen.getByLabelText(/Full name/), {
      target: { value: "Abena Owusu" },
    });
    fireEvent.change(screen.getByLabelText(/Email address/), {
      target: { value: "abena@mincom.com" },
    });
    // Do not pick a role
    fireEvent.click(screen.getByRole("button", { name: /Create User/ }));

    await waitFor(() => {
      expect(screen.getByText("Please select a role")).toBeInTheDocument();
    });
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it("sends roles: [<chosen-role>] when a role is selected and the form is submitted", async () => {
    render(
      <AddUserDialog isOpen onClose={vi.fn()} onSuccess={vi.fn()} />,
    );

    fireEvent.change(screen.getByLabelText(/Full name/), {
      target: { value: "Akua Mensah" },
    });
    fireEvent.change(screen.getByLabelText(/Email address/), {
      target: { value: "akua@mincom.com" },
    });
    selectRole("HR_ADMIN");

    fireEvent.click(screen.getByRole("button", { name: /Create User/ }));

    await waitFor(() => {
      expect(mockCreateUser).toHaveBeenCalledWith(
        expect.objectContaining({ roles: ["HR_ADMIN"] }),
      );
    });
  });

  it("renders employee profile fields: employee number, job title, department, classification", async () => {
    render(
      <AddUserDialog isOpen onClose={vi.fn()} onSuccess={vi.fn()} />,
    );

    expect(screen.getByLabelText(/Employee number/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Job title/)).toBeInTheDocument();

    // Wait for lookups to load — department combobox appears
    await waitFor(() => {
      expect(
        screen.getByPlaceholderText(/Select or type department/i),
      ).toBeInTheDocument();
    });

    expect(screen.getByLabelText(/Select classification/)).toBeInTheDocument();
  });

  it("shows validation errors when employee_number is filled but required fields are missing", async () => {
    render(
      <AddUserDialog isOpen onClose={vi.fn()} onSuccess={vi.fn()} />,
    );

    // Fill account fields
    fireEvent.change(screen.getByLabelText(/Full name/), {
      target: { value: "Test" },
    });
    fireEvent.change(screen.getByLabelText(/Email address/), {
      target: { value: "test@mincom.com" },
    });
    selectRole("EMPLOYEE");

    // Fill only employee number
    fireEvent.change(screen.getByLabelText(/Employee number/), {
      target: { value: "EMP-001" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Create User/ }));

    await waitFor(() => {
      expect(screen.getByText("Job title is required")).toBeInTheDocument();
      expect(screen.getByText("Department is required")).toBeInTheDocument();
      expect(
        screen.getByText("Classification is required"),
      ).toBeInTheDocument();
    });

    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it("shows loading skeletons while lookups are fetching", () => {
    // Make lookups never resolve
    mockListDepartments.mockReturnValue(new Promise(() => {}));
    mockListLocations.mockReturnValue(new Promise(() => {}));
    mockListJobFamilies.mockReturnValue(new Promise(() => {}));

    render(
      <AddUserDialog isOpen onClose={vi.fn()} onSuccess={vi.fn()} />,
    );

    // Skeleton divs should be present (aria-busy="true")
    const busyElements = document.querySelectorAll("[aria-busy='true']");
    expect(busyElements.length).toBeGreaterThan(0);
  });

  it("resets form when cancel is clicked", async () => {
    const onClose = vi.fn();
    render(
      <AddUserDialog isOpen onClose={onClose} onSuccess={vi.fn()} />,
    );

    // Fill in a field
    fireEvent.change(screen.getByLabelText(/Full name/), {
      target: { value: "Test User" },
    });

    // Click Cancel — triggers handleClose which resets form and calls onClose
    fireEvent.click(screen.getByRole("button", { name: /Cancel/ }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("disables the Create User button when useEmployeeLookups returns isError=true", async () => {
    mockListDepartments.mockRejectedValue(new Error("Network error"));

    render(
      <AddUserDialog isOpen onClose={vi.fn()} onSuccess={vi.fn()} />,
    );

    await waitFor(() => {
      const createButton = screen.getByRole("button", {
        name: /Create User/,
      });
      expect(createButton).toBeDisabled();
    });
  });

  it("enables the Create User button when useEmployeeLookups returns isError=false", async () => {
    render(
      <AddUserDialog isOpen onClose={vi.fn()} onSuccess={vi.fn()} />,
    );

    await waitFor(() => {
      const createButton = screen.getByRole("button", {
        name: /Create User/,
      });
      expect(createButton).toBeEnabled();
    });
  });

  it("shows department error message when lookups fail", async () => {
    mockListDepartments.mockRejectedValue(new Error("Network error"));

    render(
      <AddUserDialog isOpen onClose={vi.fn()} onSuccess={vi.fn()} />,
    );

    await waitFor(() => {
      expect(
        screen.getByText(
          "Could not load departments. Please try again.",
        ),
      ).toBeInTheDocument();
    });
  });
});
