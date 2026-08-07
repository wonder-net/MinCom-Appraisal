/**
 * Tests for ResetMFAAlert — verify dialog behaviour:
 *   - cancel calls onCancel
 *   - confirm disabled until password is entered
 *   - submit calls onConfirm(password)
 *   - INVALID_PASSWORD rejection keeps dialog open and shows inline error
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ResetMFAAlert } from "../ResetMFAAlert";
import type { AdminUser } from "@/types";

function makeUser(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id: "u-001",
    email: "k.asante@mincom.com",
    full_name: "Kwame Asante",
    roles: ["MANAGER"],
    is_active: true,
    mfa_enabled: true,
    last_login: null,
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

describe("ResetMFAAlert", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render when open is false", () => {
    render(
      <ResetMFAAlert
        open={false}
        user={makeUser()}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.queryByText("Reset MFA?")).not.toBeInTheDocument();
  });

  it("renders title, user name, and password input when open", () => {
    render(
      <ResetMFAAlert
        open
        user={makeUser({ full_name: "Kwame Asante" })}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("Reset MFA?")).toBeInTheDocument();
    expect(screen.getByText("Kwame Asante")).toBeInTheDocument();
    expect(screen.getByLabelText("Your password")).toBeInTheDocument();
  });

  it("calls onCancel when Cancel button is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(
      <ResetMFAAlert
        open
        user={makeUser()}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("disables Confirm button when password is empty and enables it once typed", async () => {
    const user = userEvent.setup();

    render(
      <ResetMFAAlert
        open
        user={makeUser()}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const confirmButton = screen.getByRole("button", { name: "Reset MFA" });
    expect(confirmButton).toBeDisabled();

    await user.type(screen.getByLabelText("Your password"), "secret-pass");
    expect(confirmButton).toBeEnabled();
  });

  it("calls onConfirm with the entered password on submit", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockResolvedValue(undefined);

    render(
      <ResetMFAAlert
        open
        user={makeUser()}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText("Your password"), "my-password-123");
    await user.click(screen.getByRole("button", { name: "Reset MFA" }));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });
    expect(onConfirm).toHaveBeenCalledWith("my-password-123");
  });

  it("does not call onConfirm when password is whitespace only", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockResolvedValue(undefined);

    render(
      <ResetMFAAlert
        open
        user={makeUser()}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    // Confirm button should be disabled with empty password — typing only
    // spaces leaves it disabled (we trim before enabling).
    await user.type(screen.getByLabelText("Your password"), "   ");
    expect(screen.getByRole("button", { name: "Reset MFA" })).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("shows inline 'Incorrect password' and stays open when onConfirm rejects with INVALID_PASSWORD", async () => {
    const user = userEvent.setup();
    const onConfirm = vi
      .fn()
      .mockRejectedValueOnce({ code: "INVALID_PASSWORD" });

    render(
      <ResetMFAAlert
        open
        user={makeUser()}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText("Your password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Reset MFA" }));

    await waitFor(() => {
      expect(screen.getByText("Incorrect password")).toBeInTheDocument();
    });

    // Dialog still mounted
    expect(screen.getByText("Reset MFA?")).toBeInTheDocument();
    // Confirm button re-enabled (loading cleared)
    expect(screen.getByRole("button", { name: "Reset MFA" })).toBeEnabled();
  });

  it("clears the inline error when the user edits the password again", async () => {
    const user = userEvent.setup();
    const onConfirm = vi
      .fn()
      .mockRejectedValueOnce({ code: "INVALID_PASSWORD" });

    render(
      <ResetMFAAlert
        open
        user={makeUser()}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText("Your password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Reset MFA" }));

    await waitFor(() => {
      expect(screen.getByText("Incorrect password")).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText("Your password"), "x");
    expect(screen.queryByText("Incorrect password")).not.toBeInTheDocument();
  });
});
