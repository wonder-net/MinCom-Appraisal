/**
 * Tests for EscalateExecutiveDialog — covers AC-10, AC-11, AC-12 of TASK-268.
 *
 * Verifies:
 *  - Submit disabled until reason >= 10 chars AND executive selected
 *  - Submit enabled when all inputs valid
 *  - Escalate submission body shape
 *  - HTTP 200 → dialog closes + success toast
 *  - HTTP 409 → dialog stays open + reload toast
 *  - HTTP 400 → inline field errors render
 *  - Re-assign mode: title, no reason textarea, picker pre-selected
 *  - Re-assign mode: submits to reassignExecutive (not escalateAppraisal)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EscalateExecutiveDialog } from "../EscalateExecutiveDialog";
import type { AdminUser, Appraisal } from "@/types";

// ---------------------------------------------------------------------------
// Mocks — API
// ---------------------------------------------------------------------------

const mockEscalate = vi.fn();
const mockReassign = vi.fn();
const mockListExecutives = vi.fn();

vi.mock("@/api/appraisals", () => ({
  escalateAppraisal: (...args: unknown[]) =>
    mockEscalate(...(args as [string, unknown])),
  reassignExecutive: (...args: unknown[]) =>
    mockReassign(...(args as [string, unknown])),
}));

vi.mock("@/api/admin-users", () => ({
  listExecutiveUsers: () => mockListExecutives(),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeExec(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id: "exec-1",
    email: "exec1@mincom.test",
    full_name: "Akua Boateng",
    roles: ["EXECUTIVE"],
    is_active: true,
    mfa_enabled: false,
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

function makeAppraisalResponse(): Appraisal {
  return {
    id: "a-001",
    cycle_id: "c-001",
    cycle_period_name: "2026 Annual",
    employee_id: "e-001",
    employee_name: "Yaw Owusu",
    employee_job_title: "Engineer",
    department: "Engineering",
    form_type: "FORM_A",
    status: "DISCUSSION",
    total_score: null,
    performance_descriptor: null,
    kd_average_score: null,
    kd_descriptor: null,
    bc_average_score: null,
    bc_descriptor: null,
    self_rating_enabled: true,
    status_changed_at: null,
    version: 2,
    updated_at: "2026-05-16T00:00:00Z",
    appraiser_id: "m-001",
    escalated_executive: "exec-1",
    escalation_reason: "Manager partial",
    signing_round: 0,
    signatures: [],
  };
}

const EXECS: AdminUser[] = [
  makeExec({ id: "exec-1", full_name: "Akua Boateng" }),
  makeExec({ id: "exec-2", full_name: "Kojo Mensah" }),
];

const APPRAISAL_ID = "a-001";
const APPRAISAL_VERSION = 1;

beforeEach(() => {
  vi.clearAllMocks();
  mockListExecutives.mockResolvedValue(EXECS);
});

async function renderEscalate(): Promise<{
  onClose: ReturnType<typeof vi.fn>;
  onSuccess: ReturnType<typeof vi.fn>;
  user: ReturnType<typeof userEvent.setup>;
}> {
  const onClose = vi.fn();
  const onSuccess = vi.fn();
  const user = userEvent.setup();
  render(
    <EscalateExecutiveDialog
      open
      mode="escalate"
      appraisalId={APPRAISAL_ID}
      appraisalVersion={APPRAISAL_VERSION}
      onClose={onClose}
      onSuccess={onSuccess}
    />,
  );
  // Wait for the executives list to load and the picker to be enabled
  await waitFor(() => {
    expect(screen.getByLabelText(/^Executive/i)).not.toBeDisabled();
  });
  return { onClose, onSuccess, user };
}

async function renderReassign(): Promise<{
  onClose: ReturnType<typeof vi.fn>;
  onSuccess: ReturnType<typeof vi.fn>;
  user: ReturnType<typeof userEvent.setup>;
}> {
  const onClose = vi.fn();
  const onSuccess = vi.fn();
  const user = userEvent.setup();
  render(
    <EscalateExecutiveDialog
      open
      mode="reassign"
      appraisalId={APPRAISAL_ID}
      appraisalVersion={APPRAISAL_VERSION}
      currentExecutive={{ id: "exec-1", full_name: "Akua Boateng" }}
      onClose={onClose}
      onSuccess={onSuccess}
    />,
  );
  await waitFor(() => {
    expect(screen.getByLabelText(/^Executive/i)).not.toBeDisabled();
  });
  return { onClose, onSuccess, user };
}

function getSubmitButton(label: RegExp | string): HTMLButtonElement {
  return screen.getByRole("button", { name: label }) as HTMLButtonElement;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("EscalateExecutiveDialog — escalate mode", () => {
  it("disables submit when reason is shorter than 10 characters", async () => {
    const { user } = await renderEscalate();
    await user.selectOptions(screen.getByLabelText(/^Executive/i), "exec-1");
    await user.type(screen.getByLabelText(/Reason for escalation/i), "short");
    expect(getSubmitButton(/Confirm Escalation/i)).toBeDisabled();
  });

  it("disables submit when no executive is selected", async () => {
    const { user } = await renderEscalate();
    await user.type(
      screen.getByLabelText(/Reason for escalation/i),
      "This is a long enough reason",
    );
    expect(getSubmitButton(/Confirm Escalation/i)).toBeDisabled();
  });

  it("enables submit when reason >= 10 chars and executive selected", async () => {
    const { user } = await renderEscalate();
    await user.selectOptions(screen.getByLabelText(/^Executive/i), "exec-1");
    await user.type(
      screen.getByLabelText(/Reason for escalation/i),
      "Loss of impartiality detected",
    );
    expect(getSubmitButton(/Confirm Escalation/i)).not.toBeDisabled();
  });

  it("caps the reason textarea at 2000 characters and shows 'X / 2000' counter", async () => {
    await renderEscalate();
    const textarea = screen.getByLabelText(
      /Reason for escalation/i,
    ) as HTMLTextAreaElement;
    expect(textarea.maxLength).toBe(2000);
    // Counter starts at "0 / 2000"
    expect(screen.getByText("0 / 2000")).toBeInTheDocument();
  });

  it("submits escalateAppraisal with executive_user_id, reason, and version", async () => {
    mockEscalate.mockResolvedValue(makeAppraisalResponse());
    const { user } = await renderEscalate();
    await user.selectOptions(screen.getByLabelText(/^Executive/i), "exec-2");
    await user.type(
      screen.getByLabelText(/Reason for escalation/i),
      "Manager-level dispute escalation",
    );
    await user.click(getSubmitButton(/Confirm Escalation/i));
    await waitFor(() => {
      expect(mockEscalate).toHaveBeenCalledWith(APPRAISAL_ID, {
        executive_user_id: "exec-2",
        reason: "Manager-level dispute escalation",
        version: APPRAISAL_VERSION,
      });
    });
  });

  it("closes dialog and shows success toast on HTTP 200", async () => {
    mockEscalate.mockResolvedValue(makeAppraisalResponse());
    const { user, onClose, onSuccess } = await renderEscalate();
    await user.selectOptions(screen.getByLabelText(/^Executive/i), "exec-1");
    await user.type(
      screen.getByLabelText(/Reason for escalation/i),
      "Confirmed neutrality concern",
    );
    await user.click(getSubmitButton(/Confirm Escalation/i));
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
    expect(
      await screen.findByText(/Appraisal escalated to Akua Boateng/i),
    ).toBeInTheDocument();
  });

  it("keeps dialog open and toasts reload prompt on HTTP 409", async () => {
    mockEscalate.mockRejectedValue({
      isAxiosError: true,
      response: { status: 409, data: { status: "error", data: { detail: "conflict" } } },
    });
    const { user, onClose, onSuccess } = await renderEscalate();
    await user.selectOptions(screen.getByLabelText(/^Executive/i), "exec-1");
    await user.type(
      screen.getByLabelText(/Reason for escalation/i),
      "Trying to escalate a stale version",
    );
    await user.click(getSubmitButton(/Confirm Escalation/i));
    const toast = await screen.findByText(/reload and try again/i);
    expect(toast).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("renders inline field errors on HTTP 400", async () => {
    mockEscalate.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          status: "error",
          data: {
            errors: {
              reason: ["Reason must be at least 10 characters."],
            },
          },
        },
      },
    });
    const { user } = await renderEscalate();
    await user.selectOptions(screen.getByLabelText(/^Executive/i), "exec-1");
    await user.type(
      screen.getByLabelText(/Reason for escalation/i),
      "Plausible reason text",
    );
    await user.click(getSubmitButton(/Confirm Escalation/i));
    const reasonInput = screen.getByLabelText(/Reason for escalation/i);
    const wrapper = reasonInput.closest("div")?.parentElement;
    expect(wrapper).not.toBeNull();
    await waitFor(() => {
      expect(
        within(wrapper as HTMLElement).getByText(
          /Reason must be at least 10 characters\./,
        ),
      ).toBeInTheDocument();
    });
  });
});

describe("EscalateExecutiveDialog — re-assign mode", () => {
  it("renders 'Re-assign Executive' title, hides reason textarea, pre-selects picker", async () => {
    await renderReassign();
    expect(
      screen.getByRole("heading", { name: /Re-assign Executive/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/Reason for escalation/i),
    ).not.toBeInTheDocument();
    const picker = screen.getByLabelText(/^Executive/i) as HTMLSelectElement;
    expect(picker.value).toBe("exec-1");
  });

  it("submits to reassignExecutive (not escalateAppraisal) on confirm", async () => {
    mockReassign.mockResolvedValue(makeAppraisalResponse());
    const { user } = await renderReassign();
    await user.selectOptions(screen.getByLabelText(/^Executive/i), "exec-2");
    await user.click(getSubmitButton(/Confirm Re-assignment/i));
    await waitFor(() => {
      expect(mockReassign).toHaveBeenCalledWith(APPRAISAL_ID, {
        executive_user_id: "exec-2",
        version: APPRAISAL_VERSION,
      });
    });
    expect(mockEscalate).not.toHaveBeenCalled();
  });
});
