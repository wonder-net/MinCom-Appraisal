/**
 * Tests for GrowthPlanForm — verifies rendering modes, editable/read-only
 * state, dynamic list operations, save behaviour, and error handling.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GrowthPlanForm } from "../components/GrowthPlanForm";
import type { GrowthPlan } from "@/types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetGrowthPlan = vi.fn<(appraisalId: string) => Promise<GrowthPlan | null>>();
const mockCreateGrowthPlan = vi.fn<
  (appraisalId: string, data: unknown) => Promise<GrowthPlan>
>();
const mockUpdateGrowthPlan = vi.fn<
  (appraisalId: string, data: unknown) => Promise<GrowthPlan>
>();

vi.mock("@/api/growth-plans", () => ({
  getGrowthPlan: (...args: unknown[]) =>
    mockGetGrowthPlan(args[0] as string),
  createGrowthPlan: (...args: unknown[]) =>
    mockCreateGrowthPlan(args[0] as string, args[1]),
  updateGrowthPlan: (...args: unknown[]) =>
    mockUpdateGrowthPlan(args[0] as string, args[1]),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGrowthPlan(overrides: Partial<GrowthPlan> = {}): GrowthPlan {
  return {
    id: "gp-001",
    appraisal_id: "a-001",
    overall_assessment: "A strong contributor who consistently meets targets.",
    strengths_weaknesses: [
      { id: "sw-1", type: "STRENGTH", description: "Strong leadership" },
      { id: "sw-2", type: "WEAKNESS", description: "Time management" },
    ],
    training_needs: [
      { id: "tn-1", type: "ON_THE_JOB", priority: "FIRST", description: "Project management certification" },
    ],
    career_plans: [
      {
        id: "cp-1",
        aspired_role: "Senior Engineer",
        priority: "FIRST",
      },
    ],
    development_needs: [
      { id: "dn-1", description: "Advanced data analytics training", priority: "FIRST" },
    ],
    created_at: "2026-03-15T10:00:00Z",
    updated_at: "2026-03-15T12:00:00Z",
    ...overrides,
  };
}

const mockOnRefresh = vi.fn();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GrowthPlanForm", () => {
  it("renders editable form when status=GROWTH_PLANNING and userRelation=APPRAISER", async () => {
    mockGetGrowthPlan.mockResolvedValueOnce(null);

    render(
      <GrowthPlanForm
        appraisalId="a-001"
        status="GROWTH_PLANNING"
        userRelation="APPRAISER"
        signingRound={0}
        onRefresh={mockOnRefresh}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByLabelText("Loading growth plan")).not.toBeInTheDocument();
    });

    // Editable indicators
    expect(screen.getByText("Appraisor Editing")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Growth Plan" })).toBeInTheDocument();

    // Form inputs are present and enabled
    const textarea = screen.getByLabelText(/Assessment narrative/);
    expect(textarea).not.toBeDisabled();
  });

  it("renders read-only view when status=PENDING_SIGNOFF", async () => {
    mockGetGrowthPlan.mockResolvedValueOnce(makeGrowthPlan());

    render(
      <GrowthPlanForm
        appraisalId="a-001"
        status="PENDING_SIGNOFF"
        userRelation="APPRAISER"
        signingRound={1}
        onRefresh={mockOnRefresh}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByLabelText("Loading growth plan")).not.toBeInTheDocument();
    });

    // No save button in read-only mode
    expect(screen.queryByRole("button", { name: "Save Growth Plan" })).not.toBeInTheDocument();
    // No "Appraisor Editing" badge
    expect(screen.queryByText("Appraisor Editing")).not.toBeInTheDocument();
    // Data is displayed
    expect(screen.getByText("A strong contributor who consistently meets targets.")).toBeInTheDocument();
    expect(screen.getByText("Strong leadership")).toBeInTheDocument();
  });

  it("renders read-only view when userRelation=APPRAISEE and status=GROWTH_PLANNING", async () => {
    mockGetGrowthPlan.mockResolvedValueOnce(makeGrowthPlan());

    render(
      <GrowthPlanForm
        appraisalId="a-001"
        status="GROWTH_PLANNING"
        userRelation="APPRAISEE"
        signingRound={0}
        onRefresh={mockOnRefresh}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByLabelText("Loading growth plan")).not.toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: "Save Growth Plan" })).not.toBeInTheDocument();
    expect(screen.queryByText("Appraisor Editing")).not.toBeInTheDocument();
  });

  it("renders 'not available' when status is pre-GROWTH_PLANNING and does not fetch", async () => {
    render(
      <GrowthPlanForm
        appraisalId="a-001"
        status="DISCUSSION"
        userRelation="APPRAISER"
        signingRound={0}
        onRefresh={mockOnRefresh}
      />,
    );

    expect(screen.getByText("Growth plan not yet available")).toBeInTheDocument();
    expect(mockGetGrowthPlan).not.toHaveBeenCalled();
  });

  it("shows 'not available' in first DISCUSSION when signing_round === 0", async () => {
    render(
      <GrowthPlanForm
        appraisalId="a-001"
        status="DISCUSSION"
        userRelation="APPRAISEE"
        signingRound={0}
        onRefresh={mockOnRefresh}
      />,
    );

    expect(screen.getByText("Growth plan not yet available")).toBeInTheDocument();
    expect(mockGetGrowthPlan).not.toHaveBeenCalled();
  });

  it("shows growth plan in DISCUSSION when signing_round >= 1 (post-escalation)", async () => {
    mockGetGrowthPlan.mockResolvedValueOnce(makeGrowthPlan());

    render(
      <GrowthPlanForm
        appraisalId="a-001"
        status="DISCUSSION"
        userRelation="APPRAISEE"
        signingRound={1}
        onRefresh={mockOnRefresh}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByLabelText("Loading growth plan")).not.toBeInTheDocument();
    });

    // "Not available" message should NOT appear
    expect(screen.queryByText("Growth plan not yet available")).not.toBeInTheDocument();
    // Growth plan data is rendered (read-only view since status is not GROWTH_PLANNING)
    expect(screen.getByText("A strong contributor who consistently meets targets.")).toBeInTheDocument();
    expect(screen.getByText("Strong leadership")).toBeInTheDocument();
    // No save button (read-only)
    expect(screen.queryByRole("button", { name: "Save Growth Plan" })).not.toBeInTheDocument();
    // The hook was called to fetch the data
    expect(mockGetGrowthPlan).toHaveBeenCalledWith("a-001");
  });

  it("renders pre-populated initialData correctly in all form fields", async () => {
    const plan = makeGrowthPlan();
    mockGetGrowthPlan.mockResolvedValueOnce(plan);

    render(
      <GrowthPlanForm
        appraisalId="a-001"
        status="GROWTH_PLANNING"
        userRelation="APPRAISER"
        signingRound={0}
        onRefresh={mockOnRefresh}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByLabelText("Loading growth plan")).not.toBeInTheDocument();
    });

    // Overall assessment
    const textarea = screen.getByLabelText(/Assessment narrative/) as HTMLTextAreaElement;
    expect(textarea.value).toBe("A strong contributor who consistently meets targets.");

    // Strengths/Weaknesses descriptions
    const swDesc1 = screen.getByLabelText("Strength / Weakness description 1") as HTMLInputElement;
    expect(swDesc1.value).toBe("Strong leadership");
    const swDesc2 = screen.getByLabelText("Strength / Weakness description 2") as HTMLInputElement;
    expect(swDesc2.value).toBe("Time management");

    // Training need
    const tnDesc = screen.getByLabelText("On-the-job training description 1") as HTMLInputElement;
    expect(tnDesc.value).toBe("Project management certification");

    // Career plan
    const cpRole = screen.getByLabelText("Aspired role 1") as HTMLInputElement;
    expect(cpRole.value).toBe("Senior Engineer");

    // Development need
    const dnDesc = screen.getByLabelText("Development need description 1") as HTMLInputElement;
    expect(dnDesc.value).toBe("Advanced data analytics training");
  });

  it("calls updateGrowthPlan when editing existing plan and clicking save", async () => {
    const user = userEvent.setup();
    const plan = makeGrowthPlan();
    mockGetGrowthPlan.mockResolvedValueOnce(plan);
    mockUpdateGrowthPlan.mockResolvedValueOnce(makeGrowthPlan({
      overall_assessment: "Updated assessment text",
    }));

    render(
      <GrowthPlanForm
        appraisalId="a-001"
        status="GROWTH_PLANNING"
        userRelation="APPRAISER"
        signingRound={0}
        onRefresh={mockOnRefresh}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByLabelText("Loading growth plan")).not.toBeInTheDocument();
    });

    const textarea = screen.getByLabelText(/Assessment narrative/);
    await user.clear(textarea);
    await user.type(textarea, "Updated assessment text");

    await user.click(screen.getByRole("button", { name: "Save Growth Plan" }));

    await waitFor(() => {
      expect(mockUpdateGrowthPlan).toHaveBeenCalledWith("a-001", expect.objectContaining({
        overall_assessment: "Updated assessment text",
      }));
    });

    // onRefresh should be called on success
    await waitFor(() => {
      expect(mockOnRefresh).toHaveBeenCalled();
    });
  });

  it("calls createGrowthPlan when no initialData exists and user saves", async () => {
    const user = userEvent.setup();
    mockGetGrowthPlan.mockResolvedValueOnce(null);
    mockCreateGrowthPlan.mockResolvedValueOnce(makeGrowthPlan());

    render(
      <GrowthPlanForm
        appraisalId="a-001"
        status="GROWTH_PLANNING"
        userRelation="APPRAISER"
        signingRound={0}
        onRefresh={mockOnRefresh}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByLabelText("Loading growth plan")).not.toBeInTheDocument();
    });

    const textarea = screen.getByLabelText(/Assessment narrative/);
    await user.type(textarea, "New assessment for employee");

    await user.click(screen.getByRole("button", { name: "Save Growth Plan" }));

    await waitFor(() => {
      expect(mockCreateGrowthPlan).toHaveBeenCalledWith("a-001", expect.objectContaining({
        overall_assessment: "New assessment for employee",
      }));
    });
  });

  it("shows inline error when save fails", async () => {
    const user = userEvent.setup();
    mockGetGrowthPlan.mockResolvedValueOnce(null);
    mockCreateGrowthPlan.mockRejectedValueOnce(new Error("Network error"));

    render(
      <GrowthPlanForm
        appraisalId="a-001"
        status="GROWTH_PLANNING"
        userRelation="APPRAISER"
        signingRound={0}
        onRefresh={mockOnRefresh}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByLabelText("Loading growth plan")).not.toBeInTheDocument();
    });

    const textarea = screen.getByLabelText(/Assessment narrative/);
    await user.type(textarea, "Some text");

    await user.click(screen.getByRole("button", { name: "Save Growth Plan" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });

  it("disables save button while API request is in flight", async () => {
    const user = userEvent.setup();
    let resolveCreate: ((value: GrowthPlan) => void) | undefined;
    mockGetGrowthPlan.mockResolvedValueOnce(null);
    mockCreateGrowthPlan.mockImplementationOnce(
      () => new Promise<GrowthPlan>((resolve) => { resolveCreate = resolve; }),
    );

    render(
      <GrowthPlanForm
        appraisalId="a-001"
        status="GROWTH_PLANNING"
        userRelation="APPRAISER"
        signingRound={0}
        onRefresh={mockOnRefresh}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByLabelText("Loading growth plan")).not.toBeInTheDocument();
    });

    const textarea = screen.getByLabelText(/Assessment narrative/);
    await user.type(textarea, "Test");

    const saveButton = screen.getByRole("button", { name: "Save Growth Plan" });
    await user.click(saveButton);

    // Button should be disabled while saving
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
    });

    // Resolve the promise to clean up
    resolveCreate?.(makeGrowthPlan());
  });

  it("adds and removes rows in the strengths/weaknesses section", async () => {
    const user = userEvent.setup();
    mockGetGrowthPlan.mockResolvedValueOnce(null);

    render(
      <GrowthPlanForm
        appraisalId="a-001"
        status="GROWTH_PLANNING"
        userRelation="APPRAISER"
        signingRound={0}
        onRefresh={mockOnRefresh}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByLabelText("Loading growth plan")).not.toBeInTheDocument();
    });

    // Initially one SW row
    expect(screen.getAllByLabelText(/Strength \/ Weakness description/)).toHaveLength(1);

    // Add an entry
    const addButton = screen.getByRole("button", { name: "+ Add Strength" });
    await user.click(addButton);

    expect(screen.getAllByLabelText(/Strength \/ Weakness description/)).toHaveLength(2);

    // Remove the first entry
    const removeButtons = screen.getAllByLabelText(/Remove entry/);
    await user.click(removeButtons[0]);

    expect(screen.getAllByLabelText(/Strength \/ Weakness description/)).toHaveLength(1);
  });

  it("renders loading skeleton initially", () => {
    mockGetGrowthPlan.mockReturnValueOnce(new Promise(() => {}));

    render(
      <GrowthPlanForm
        appraisalId="a-001"
        status="GROWTH_PLANNING"
        userRelation="APPRAISER"
        signingRound={0}
        onRefresh={mockOnRefresh}
      />,
    );

    expect(screen.getByLabelText("Loading growth plan")).toBeInTheDocument();
  });

  it("shows fetch error when API call fails", async () => {
    mockGetGrowthPlan.mockRejectedValueOnce(new Error("Server error"));

    render(
      <GrowthPlanForm
        appraisalId="a-001"
        status="GROWTH_PLANNING"
        userRelation="APPRAISER"
        signingRound={0}
        onRefresh={mockOnRefresh}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Server error")).toBeInTheDocument();
    });
  });
});
