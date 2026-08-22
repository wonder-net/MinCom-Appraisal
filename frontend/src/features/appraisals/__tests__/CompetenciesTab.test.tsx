/**
 * Tests for CompetenciesTab — verifies the legacy flat-rating path
 * (Select dropdown, no sub-competencies) still works, that a core
 * value with sub_competency_ratings renders bounded number inputs per
 * sub-item, committing on blur, with a read-only total, and that the
 * appraisee can add their own sub-competency during self-assessment.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CompetenciesTab } from "../components/CompetenciesTab";
import type { CompetencyRating, SubCompetencyRating } from "@/types";

function makeCr(overrides: Partial<CompetencyRating> = {}): CompetencyRating {
  return {
    id: "cr-1",
    appraisal: "a-1",
    competency: "comp-1",
    competency_name: "Teamwork",
    competency_applicable_to: "ALL",
    competency_is_core: true,
    competency_sort_order: 1,
    self_rating: null,
    manager_rating: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeSubRating(overrides: Partial<SubCompetencyRating> = {}): SubCompetencyRating {
  return {
    id: "scr-1",
    competency_rating: "cr-1",
    sub_competency: "sc-1",
    is_custom: false,
    name: "Collaboration",
    sort_order: 1,
    max_score: 2.5,
    self_rating: null,
    manager_rating: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const noop = () => Promise.resolve();

describe("CompetenciesTab — legacy direct-rating path", () => {
  it("renders a Select and calls onUpdateRating when no sub-competencies are present", async () => {
    const onUpdateRating = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(
      <CompetenciesTab
        competencies={[makeCr()]}
        selfRatingEnabled={false}
        canMgrRate
        canSelfRate={false}
        status="MANAGER_REVIEW"
        bcAverage={null}
        bcDescriptor={null}
        onUpdateRating={onUpdateRating}
        onUpdateSubRating={noop}
        onAddSubCompetency={noop}
      />,
    );

    const select = screen.getByLabelText("Appraisor rating for Teamwork");
    await user.selectOptions(select, "4.5");

    expect(onUpdateRating).toHaveBeenCalledWith("cr-1", "manager_rating", 4.5);
  });

  it("shows a read-only score when the viewer cannot rate", () => {
    render(
      <CompetenciesTab
        competencies={[makeCr({ manager_rating: 6.5 })]}
        selfRatingEnabled={false}
        canMgrRate={false}
        canSelfRate={false}
        status="FINALISED"
        bcAverage={6.5}
        bcDescriptor="Good"
        onUpdateRating={noop}
        onUpdateSubRating={noop}
        onAddSubCompetency={noop}
      />,
    );

    expect(screen.getByText("6.5")).toBeInTheDocument();
  });
});

describe("CompetenciesTab — sub-competency rating path", () => {
  it("renders a bounded number input per sub-competency instead of the Select", () => {
    const cr = makeCr({
      sub_competency_ratings: [
        makeSubRating({ id: "scr-1", name: "Collaboration", max_score: 2.5 }),
        makeSubRating({ id: "scr-2", name: "Communication", max_score: 2.5 }),
        makeSubRating({ id: "scr-3", name: "Reliability", max_score: 2.5 }),
      ],
    });

    render(
      <CompetenciesTab
        competencies={[cr]}
        selfRatingEnabled={false}
        canMgrRate
        canSelfRate={false}
        status="MANAGER_REVIEW"
        bcAverage={null}
        bcDescriptor={null}
        onUpdateRating={noop}
        onUpdateSubRating={noop}
        onAddSubCompetency={noop}
      />,
    );

    expect(screen.queryByLabelText("Appraisor rating for Teamwork")).not.toBeInTheDocument();
    const input = screen.getByLabelText("Appraisor rating for Teamwork / Collaboration");
    expect(input).toHaveAttribute("max", "2.5");
    expect(input).toHaveAttribute("min", "0");
  });

  it("commits a sub-competency rating on blur, not on every keystroke", async () => {
    const onUpdateSubRating = vi.fn().mockResolvedValue(undefined);
    const cr = makeCr({
      sub_competency_ratings: [makeSubRating({ id: "scr-1", name: "Collaboration", max_score: 2.5 })],
    });

    render(
      <CompetenciesTab
        competencies={[cr]}
        selfRatingEnabled={false}
        canMgrRate
        canSelfRate={false}
        status="MANAGER_REVIEW"
        bcAverage={null}
        bcDescriptor={null}
        onUpdateRating={noop}
        onUpdateSubRating={onUpdateSubRating}
        onAddSubCompetency={noop}
      />,
    );

    const input = screen.getByLabelText("Appraisor rating for Teamwork / Collaboration");
    fireEvent.change(input, { target: { value: "2" } });
    expect(onUpdateSubRating).not.toHaveBeenCalled();

    fireEvent.blur(input);
    expect(onUpdateSubRating).toHaveBeenCalledWith("cr-1", "scr-1", "manager_rating", 2);
  });

  it("rejects a value above the sub-competency's max_score and reverts the draft", () => {
    const onUpdateSubRating = vi.fn().mockResolvedValue(undefined);
    const cr = makeCr({
      sub_competency_ratings: [makeSubRating({ id: "scr-1", name: "Collaboration", max_score: 2.5, manager_rating: 1 })],
    });

    render(
      <CompetenciesTab
        competencies={[cr]}
        selfRatingEnabled={false}
        canMgrRate
        canSelfRate={false}
        status="MANAGER_REVIEW"
        bcAverage={null}
        bcDescriptor={null}
        onUpdateRating={noop}
        onUpdateSubRating={onUpdateSubRating}
        onAddSubCompetency={noop}
      />,
    );

    const input = screen.getByLabelText("Appraisor rating for Teamwork / Collaboration");
    fireEvent.change(input, { target: { value: "9.99" } });
    fireEvent.blur(input);

    expect(onUpdateSubRating).not.toHaveBeenCalled();
    expect(input).toHaveValue(1);
  });

  it("shows the read-only roll-up total for the core value", () => {
    const cr = makeCr({
      self_rating: 5,
      sub_competency_ratings: [
        makeSubRating({ id: "scr-1", name: "Collaboration", max_score: 2.5, self_rating: 2.5 }),
        makeSubRating({ id: "scr-2", name: "Communication", max_score: 2.5, self_rating: 2.5 }),
        makeSubRating({ id: "scr-3", name: "Reliability", max_score: 2.5, self_rating: null }),
      ],
    });

    render(
      <CompetenciesTab
        competencies={[cr]}
        selfRatingEnabled
        canMgrRate={false}
        canSelfRate
        status="SELF_ASSESSMENT"
        bcAverage={null}
        bcDescriptor={null}
        onUpdateRating={noop}
        onUpdateSubRating={noop}
        onAddSubCompetency={noop}
      />,
    );

    expect(screen.getAllByText("Total").length).toBeGreaterThan(0);
    expect(screen.getByText("5.0")).toBeInTheDocument();
  });
});

describe("CompetenciesTab — appraisee adds their own sub-competency", () => {
  it("only shows the add control in the self-rating column when canSelfRate is true", () => {
    render(
      <CompetenciesTab
        competencies={[makeCr()]}
        selfRatingEnabled
        canMgrRate={false}
        canSelfRate
        status="SELF_ASSESSMENT"
        bcAverage={null}
        bcDescriptor={null}
        onUpdateRating={noop}
        onUpdateSubRating={noop}
        onAddSubCompetency={noop}
      />,
    );

    expect(screen.getByText("+ Add sub-competency")).toBeInTheDocument();
  });

  it("does not show the add control when the viewer cannot self-rate", () => {
    render(
      <CompetenciesTab
        competencies={[makeCr()]}
        selfRatingEnabled
        canMgrRate
        canSelfRate={false}
        status="MANAGER_REVIEW"
        bcAverage={null}
        bcDescriptor={null}
        onUpdateRating={noop}
        onUpdateSubRating={noop}
        onAddSubCompetency={noop}
      />,
    );

    expect(screen.queryByText("+ Add sub-competency")).not.toBeInTheDocument();
  });

  it("submits the entered name and collapses the form on success", async () => {
    const onAddSubCompetency = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(
      <CompetenciesTab
        competencies={[makeCr()]}
        selfRatingEnabled
        canMgrRate={false}
        canSelfRate
        status="SELF_ASSESSMENT"
        bcAverage={null}
        bcDescriptor={null}
        onUpdateRating={noop}
        onUpdateSubRating={noop}
        onAddSubCompetency={onAddSubCompetency}
      />,
    );

    await user.click(screen.getByText("+ Add sub-competency"));
    const input = screen.getByLabelText("New sub-competency name for Teamwork");
    await user.type(input, "Punctuality");
    await user.click(screen.getByText("Add"));

    expect(onAddSubCompetency).toHaveBeenCalledWith("cr-1", "Punctuality");
    await waitFor(() => expect(screen.getByText("+ Add sub-competency")).toBeInTheDocument());
  });

  it("shows an inline error and keeps the form open when the add fails", async () => {
    const onAddSubCompetency = vi.fn().mockRejectedValue({
      isAxiosError: true,
      response: { data: { data: { message: "A sub-competency with this name already exists for this core value." } } },
    });
    const user = userEvent.setup();

    render(
      <CompetenciesTab
        competencies={[makeCr()]}
        selfRatingEnabled
        canMgrRate={false}
        canSelfRate
        status="SELF_ASSESSMENT"
        bcAverage={null}
        bcDescriptor={null}
        onUpdateRating={noop}
        onUpdateSubRating={noop}
        onAddSubCompetency={onAddSubCompetency}
      />,
    );

    await user.click(screen.getByText("+ Add sub-competency"));
    await user.type(screen.getByLabelText("New sub-competency name for Teamwork"), "Collaboration");
    await user.click(screen.getByText("Add"));

    expect(await screen.findByText("A sub-competency with this name already exists for this core value.")).toBeInTheDocument();
    expect(screen.getByLabelText("New sub-competency name for Teamwork")).toBeInTheDocument();
  });

  it("also appears for a core value that already has sub-competencies", () => {
    const cr = makeCr({
      sub_competency_ratings: [makeSubRating({ id: "scr-1", name: "Collaboration", max_score: 7.5 })],
    });

    render(
      <CompetenciesTab
        competencies={[cr]}
        selfRatingEnabled
        canMgrRate={false}
        canSelfRate
        status="SELF_ASSESSMENT"
        bcAverage={null}
        bcDescriptor={null}
        onUpdateRating={noop}
        onUpdateSubRating={noop}
        onAddSubCompetency={noop}
      />,
    );

    expect(screen.getByText("+ Add sub-competency")).toBeInTheDocument();
  });
});
