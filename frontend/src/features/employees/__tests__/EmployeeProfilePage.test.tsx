/**
 * Tests for EmployeeProfilePage's self-service photo upload — verifies
 * the change/remove photo controls only render for the viewer's own
 * profile, and that upload/remove call the expected API functions and
 * surface success/error feedback.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { EmployeeProfilePage } from "../pages/EmployeeProfilePage";
import type { Employee } from "@/api/employees";

const mockGetEmployee = vi.fn<(id: string) => Promise<Employee>>();
const mockUploadMyPhoto = vi.fn<(file: File) => Promise<Employee>>();
const mockDeleteMyPhoto = vi.fn<() => Promise<Employee>>();

vi.mock("@/api/employees", () => ({
  getEmployee: (id: string) => mockGetEmployee(id),
  getDirectReports: () => Promise.resolve([]),
  uploadMyPhoto: (file: File) => mockUploadMyPhoto(file),
  deleteMyPhoto: () => mockDeleteMyPhoto(),
}));

vi.mock("@/features/reports/components/EmployeeAppraisalHistorySection", () => ({
  EmployeeAppraisalHistorySection: () => null,
}));

const mockSetSidebarPhotoUrl = vi.fn();

vi.mock("@/context/MyPhotoContext", () => ({
  useMyPhoto: () => ({ photoUrl: null, setPhotoUrl: mockSetSidebarPhotoUrl }),
}));

let mockEmployeeId = "emp-1";
let mockRoles: string[] = ["EMPLOYEE"];

vi.mock("@/auth/useAuth", () => ({
  useAuth: () => ({
    user: {
      id: "u-1",
      email: "jane@mincom.com",
      roles: mockRoles,
      employee_id: mockEmployeeId,
      is_mfa_enabled: false,
    },
    isAuthenticated: true,
    isLoading: false,
  }),
}));

const baseEmployee: Employee = {
  id: "emp-1",
  employee_number: "EMP-001",
  name: "Jane Doe",
  job_title: "Engineer",
  department: "dep-1",
  department_name: "Engineering",
  job_family: "",
  location: "",
  classification: "NON_MANAGERIAL",
  classification_display: "Non-managerial",
  photo_url: null,
};

const renderPage = (routeId: string) =>
  render(
    <MemoryRouter initialEntries={[`/employees/${routeId}`]}>
      <Routes>
        <Route path="/employees/:id" element={<EmployeeProfilePage />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  mockEmployeeId = "emp-1";
  mockRoles = ["EMPLOYEE"];
});

describe("EmployeeProfilePage Employee Directory breadcrumb", () => {
  it("hides the breadcrumb for a plain EMPLOYEE — /employees is gated and would be a dead end", async () => {
    mockRoles = ["EMPLOYEE"];
    mockGetEmployee.mockResolvedValue(baseEmployee);

    renderPage("emp-1");

    await screen.findByText("Jane Doe");
    expect(screen.queryByText("Employee Directory")).not.toBeInTheDocument();
  });

  it("shows the breadcrumb for roles that can actually open the Directory", async () => {
    mockRoles = ["MANAGER"];
    mockGetEmployee.mockResolvedValue(baseEmployee);

    renderPage("emp-1");

    expect(await screen.findByText("Employee Directory")).toBeInTheDocument();
  });
});

describe("EmployeeProfilePage photo upload", () => {
  it("shows the change-photo control when viewing your own profile", async () => {
    mockGetEmployee.mockResolvedValue(baseEmployee);

    renderPage("emp-1");

    expect(await screen.findByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByLabelText("Add a profile photo")).toBeInTheDocument();
  });

  it("does not show the change-photo control on someone else's profile", async () => {
    mockGetEmployee.mockResolvedValue({ ...baseEmployee, id: "emp-2" });

    renderPage("emp-2");

    expect(await screen.findByText("Jane Doe")).toBeInTheDocument();
    expect(screen.queryByLabelText("Add a profile photo")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Change profile photo")).not.toBeInTheDocument();
  });

  it("shows a remove-photo control only once a photo is set", async () => {
    mockGetEmployee.mockResolvedValue({ ...baseEmployee, photo_url: "https://example.test/photo.jpg" });

    renderPage("emp-1");

    expect(await screen.findByLabelText("Remove profile photo")).toBeInTheDocument();
    expect(screen.getByLabelText("Change profile photo")).toBeInTheDocument();
  });

  it("uploads the selected file and refreshes the profile on success", async () => {
    mockGetEmployee.mockResolvedValue(baseEmployee);
    mockUploadMyPhoto.mockResolvedValue({ ...baseEmployee, photo_url: "https://example.test/photo.jpg" });
    const user = userEvent.setup();

    renderPage("emp-1");
    await screen.findByText("Jane Doe");

    const file = new File(["fake-bytes"], "photo.jpg", { type: "image/jpeg" });
    const input = screen.getByLabelText("Choose a new profile photo", { selector: "input" });
    await user.upload(input, file);

    await waitFor(() => expect(mockUploadMyPhoto).toHaveBeenCalledWith(file));
    await waitFor(() => expect(mockGetEmployee).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Profile photo updated.")).toBeInTheDocument();
    // The sidebar avatar (Layout) is updated directly rather than
    // waiting for its own next fetch — see useMyPhoto() in the handler.
    expect(mockSetSidebarPhotoUrl).toHaveBeenCalledWith("https://example.test/photo.jpg");
  });

  it("shows an error toast when upload fails", async () => {
    mockGetEmployee.mockResolvedValue(baseEmployee);
    mockUploadMyPhoto.mockRejectedValue({
      isAxiosError: true,
      response: { data: { data: { message: "Only JPG, PNG, and WEBP images are supported." } } },
    });
    const user = userEvent.setup();

    renderPage("emp-1");
    await screen.findByText("Jane Doe");

    const file = new File(["fake-bytes"], "photo.jpg", { type: "image/jpeg" });
    const input = screen.getByLabelText("Choose a new profile photo", { selector: "input" });
    await user.upload(input, file);

    expect(await screen.findByText("Only JPG, PNG, and WEBP images are supported.")).toBeInTheDocument();
  });

  it("removes the photo when the remove control is clicked", async () => {
    mockGetEmployee.mockResolvedValue({ ...baseEmployee, photo_url: "https://example.test/photo.jpg" });
    mockDeleteMyPhoto.mockResolvedValue({ ...baseEmployee, photo_url: null });
    const user = userEvent.setup();

    renderPage("emp-1");
    const removeButton = await screen.findByLabelText("Remove profile photo");
    await user.click(removeButton);

    await waitFor(() => expect(mockDeleteMyPhoto).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Profile photo removed.")).toBeInTheDocument();
    expect(mockSetSidebarPhotoUrl).toHaveBeenCalledWith(null);
  });
});
