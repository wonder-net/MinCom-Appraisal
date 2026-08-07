/**
 * Tests for AppraisalTable — "Escalated" badge logic (AC-14 of TASK-268).
 *
 * Verifies:
 *  1. "Escalated" badge renders on a row where escalated_executive equals
 *     the supplied currentUserId.
 *  2. "Escalated" badge does not render on a row where escalated_executive
 *     is null.
 */

import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { AppraisalTable } from "../components/AppraisalTable";
import type { Appraisal } from "@/types";

function makeAppraisal(overrides: Partial<Appraisal> = {}): Appraisal {
  return {
    id: "a-001",
    cycle_id: "c-001",
    cycle_period_name: "2026 Annual",
    employee_id: "emp-1",
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
    version: 1,
    updated_at: "2026-05-16T00:00:00Z",
    appraiser_id: "mgr-1",
    escalated_executive: null,
    escalation_reason: null,
    signing_round: 0,
    signatures: [],
    ...overrides,
  };
}

describe("AppraisalTable — Executive escalated badge", () => {
  it("renders 'Escalated' badge on rows where escalated_executive equals currentUserId", () => {
    const data = [
      makeAppraisal({
        id: "a-001",
        employee_name: "Yaw Owusu",
        escalated_executive: "u-exec",
      }),
    ];
    render(
      <AppraisalTable
        data={data}
        isLoading={false}
        totalCount={1}
        hasActiveFilters={false}
        onClearFilters={() => {}}
        onView={() => {}}
        currentUserId="u-exec"
      />,
    );
    // Badge text should appear on the row
    const badges = screen.getAllByLabelText(/Escalated to you/i);
    expect(badges.length).toBeGreaterThan(0);
    expect(badges[0]).toHaveTextContent("Escalated");
  });

  it("does NOT render 'Escalated' badge on rows where escalated_executive is null", () => {
    const data = [
      makeAppraisal({
        id: "a-002",
        employee_name: "Ama Kufuor",
        escalated_executive: null,
      }),
    ];
    render(
      <AppraisalTable
        data={data}
        isLoading={false}
        totalCount={1}
        hasActiveFilters={false}
        onClearFilters={() => {}}
        onView={() => {}}
        currentUserId="u-exec"
      />,
    );
    expect(
      screen.queryByLabelText(/Escalated to you/i),
    ).not.toBeInTheDocument();
  });

  it("does NOT render 'Escalated' badge when escalated_executive belongs to a different user", () => {
    const data = [
      makeAppraisal({
        id: "a-003",
        employee_name: "Kwesi Sarpong",
        escalated_executive: "u-someone-else",
      }),
    ];
    const { container } = render(
      <AppraisalTable
        data={data}
        isLoading={false}
        totalCount={1}
        hasActiveFilters={false}
        onClearFilters={() => {}}
        onView={() => {}}
        currentUserId="u-exec"
      />,
    );
    expect(
      within(container).queryByLabelText(/Escalated to you/i),
    ).not.toBeInTheDocument();
  });
});
