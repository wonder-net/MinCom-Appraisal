/**
 * Regression tests for AppraisalFilterBar — guards against the search
 * input being disabled during loading/fetching states (see UAT-005 / TASK-216).
 *
 * The filter bar is rendered in isolation with stub props; no router or
 * auth context is needed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppraisalFilterBar } from "../components/AppraisalFilterBar";
import type { AppraisalCycle } from "@/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCycle(overrides: Partial<AppraisalCycle> = {}): AppraisalCycle {
  return {
    id: "c-001",
    period_name: "2026 Annual",
    start_date: "2026-01-01",
    end_date: "2026-12-31",
    status: "ACTIVE",
    self_rating_enabled: true,
    is_active: true,
    created_by: null,
    config_snapshot: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const defaultProps = {
  cycleId: "",
  statusFilter: "",
  searchInput: "",
  cycles: [makeCycle()],
  isLoading: false,
  isFetching: false,
  onCycleChange: vi.fn(),
  onStatusChange: vi.fn(),
  onSearchChange: vi.fn(),
};

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AppraisalFilterBar", () => {
  it("search input is present and NOT disabled when isLoading=true", () => {
    render(
      <AppraisalFilterBar {...defaultProps} isLoading={true} />,
    );

    const searchInput = screen.getByRole("textbox", {
      name: /search appraisals/i,
    });
    expect(searchInput).toBeInTheDocument();
    expect(searchInput).not.toBeDisabled();
  });

  it("search input is NOT disabled when isFetching=true", () => {
    render(
      <AppraisalFilterBar
        {...defaultProps}
        isLoading={false}
        isFetching={true}
      />,
    );

    const searchInput = screen.getByRole("textbox", {
      name: /search appraisals/i,
    });
    expect(searchInput).toBeInTheDocument();
    expect(searchInput).not.toBeDisabled();
  });

  it("cycle select IS disabled when isLoading=true", () => {
    render(
      <AppraisalFilterBar {...defaultProps} isLoading={true} />,
    );

    const cycleSelect = screen.getByRole("combobox", {
      name: /filter by cycle/i,
    });
    expect(cycleSelect).toBeDisabled();
  });

  it("cycle select is NOT disabled when isLoading=false even if isFetching=true", () => {
    render(
      <AppraisalFilterBar
        {...defaultProps}
        isLoading={false}
        isFetching={true}
      />,
    );

    const cycleSelect = screen.getByRole("combobox", {
      name: /filter by cycle/i,
    });
    expect(cycleSelect).not.toBeDisabled();
  });

  it("status select IS disabled when isLoading=true", () => {
    render(
      <AppraisalFilterBar {...defaultProps} isLoading={true} />,
    );

    const statusSelect = screen.getByRole("combobox", {
      name: /filter by status/i,
    });
    expect(statusSelect).toBeDisabled();
  });

  it("status select follows the same disabled pattern as cycle select", () => {
    render(
      <AppraisalFilterBar
        {...defaultProps}
        isLoading={false}
        isFetching={true}
      />,
    );

    const statusSelect = screen.getByRole("combobox", {
      name: /filter by status/i,
    });
    expect(statusSelect).not.toBeDisabled();
  });

  it("typing in search input calls onSearchChange with the typed value", async () => {
    const onSearchChange = vi.fn();
    const user = userEvent.setup();

    render(
      <AppraisalFilterBar
        {...defaultProps}
        onSearchChange={onSearchChange}
      />,
    );

    const searchInput = screen.getByRole("textbox", {
      name: /search appraisals/i,
    });

    await user.type(searchInput, "a");

    // onSearchChange fires for each keystroke with e.target.value
    expect(onSearchChange).toHaveBeenCalledTimes(1);
    expect(onSearchChange).toHaveBeenCalledWith("a");
  });
});
