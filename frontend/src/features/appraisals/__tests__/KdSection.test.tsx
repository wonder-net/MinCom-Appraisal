/**
 * Unit tests for KdSection / KdPerspectiveCard — verifies that
 * add/edit/delete controls are visible when the user can edit
 * (status=SELF_ASSESSMENT, role=appraisee) and hidden otherwise
 * (status=MANAGER_REVIEW, role=appraisee).
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactElement } from "react";
import { KdSection } from "../components/KdSection";
import type { KeyDeliverable, BscPerspective } from "@/types";

/** Render with MemoryRouter so the embedded HelpIcon `<Link>` resolves. */
function renderWithRouter(ui: ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeKd(overrides: Partial<KeyDeliverable> = {}): KeyDeliverable {
  return {
    id: "kd-001",
    appraisal: "a-001",
    perspective: "FINANCIAL" as BscPerspective,
    perspective_name: "Financial",
    perspective_weight_cap: "0.3000",
    perspective_max_kd_count: 4,
    description: "Increase quarterly revenue by 10%",
    weight: 0.3,
    self_rating: 4,
    manager_rating: null,
    weighted_score: null,
    sort_order: 1,
    created_at: "2026-03-14T10:00:00Z",
    updated_at: "2026-03-14T10:00:00Z",
    ...overrides,
  };
}

const noopUpdate = vi.fn();
const noopDelete = vi.fn();
const noopAdd = vi.fn();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("KdSection edit controls visibility", () => {
  it(
    "shows '+ Add key performance indicator' button and edit/delete controls when canEditKd is true",
    () => {
      const deliverables = [
        makeKd({ id: "kd-001", description: "Revenue target" }),
        makeKd({ id: "kd-002", description: "Cost reduction", perspective: "FINANCIAL" }),
      ];

      renderWithRouter(
        <KdSection
          deliverables={deliverables}
          selfRatingEnabled={true}
          canEditKd={true}
          canMgrRate={false}
          onUpdateKd={noopUpdate}
          formType="FORM_B"
          onDeleteKd={noopDelete}
          onAddKd={noopAdd}
        />,
      );

      // The add button should be visible (one per perspective that is rendered)
      const addButtons = screen.getAllByRole("button", {
        name: /add key performance indicator/i,
      });
      expect(addButtons.length).toBeGreaterThan(0);

      // Edit and delete controls should be visible for each KD
      expect(
        screen.getByRole("button", { name: /edit revenue target/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /delete revenue target/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /edit cost reduction/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /delete cost reduction/i }),
      ).toBeInTheDocument();
    },
    15000,
  );

  it("hides edit/delete controls and add button when canEditKd is false", () => {
    const deliverables = [
      makeKd({ id: "kd-001", description: "Revenue target" }),
    ];

    renderWithRouter(
      <KdSection
        deliverables={deliverables}
        selfRatingEnabled={true}
        canEditKd={false}
        canMgrRate={false}
        onUpdateKd={noopUpdate}
        formType="FORM_B"
        onDeleteKd={noopDelete}
        onAddKd={noopAdd}
      />,
    );

    // The add button should NOT be present
    expect(
      screen.queryByRole("button", { name: /add key performance indicator/i }),
    ).not.toBeInTheDocument();

    // Edit and delete controls should NOT be present
    expect(
      screen.queryByRole("button", { name: /edit revenue target/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /delete revenue target/i }),
    ).not.toBeInTheDocument();
  });

  it("shows Actions column header only when canEditKd is true", () => {
    const deliverables = [makeKd()];

    const { rerender } = render(
      <MemoryRouter>
        <KdSection
          deliverables={deliverables}
          selfRatingEnabled={false}
          canEditKd={true}
          canMgrRate={false}
          onUpdateKd={noopUpdate}
          formType="FORM_B"
          onDeleteKd={noopDelete}
          onAddKd={noopAdd}
        />
      </MemoryRouter>,
    );

    expect(screen.getAllByText("Actions").length).toBeGreaterThan(0);

    rerender(
      <MemoryRouter>
        <KdSection
          deliverables={deliverables}
          selfRatingEnabled={false}
          canEditKd={false}
          canMgrRate={false}
          onUpdateKd={noopUpdate}
          formType="FORM_B"
          onDeleteKd={noopDelete}
          onAddKd={noopAdd}
        />
      </MemoryRouter>,
    );

    expect(screen.queryByText("Actions")).not.toBeInTheDocument();
  });

  it("groups deliverables by perspective and renders descriptions", () => {
    const deliverables = [
      makeKd({
        id: "kd-fin",
        perspective: "FINANCIAL",
        perspective_name: "Financial",
        description: "Revenue growth",
        appraisal: "a-001",
      }),
      makeKd({
        id: "kd-cust",
        perspective: "CUSTOMER",
        perspective_name: "Customer",
        description: "Client satisfaction",
        appraisal: "a-001",
      }),
    ];

    renderWithRouter(
      <KdSection
        deliverables={deliverables}
        selfRatingEnabled={false}
        canEditKd={false}
        canMgrRate={false}
        onUpdateKd={noopUpdate}
        formType="FORM_B"
        onDeleteKd={noopDelete}
        onAddKd={noopAdd}
      />,
    );

    expect(screen.getByText("Revenue growth")).toBeInTheDocument();
    expect(screen.getByText("Client satisfaction")).toBeInTheDocument();
    expect(screen.getByText("Financial")).toBeInTheDocument();
    expect(screen.getByText("Customer")).toBeInTheDocument();
  });
});

describe("KdSection help icon target by context", () => {
  it("links to manager-guide when canMgrRate=true (regardless of canEditKd)", () => {
    renderWithRouter(
      <KdSection
        deliverables={[makeKd()]}
        selfRatingEnabled={false}
        canEditKd={false}
        canMgrRate={true}
        onUpdateKd={noopUpdate}
        formType="FORM_B"
        onDeleteKd={noopDelete}
        onAddKd={noopAdd}
      />,
    );

    const link = screen.getByRole("link", { name: /open help for rating key performance indicators/i });
    expect(link).toHaveAttribute("href", "/help/manager-guide/rating-key-deliverables");
  });

  it("links to employee-guide self-assessment when canMgrRate=false and canEditKd=true", () => {
    renderWithRouter(
      <KdSection
        deliverables={[makeKd()]}
        selfRatingEnabled={true}
        canEditKd={true}
        canMgrRate={false}
        onUpdateKd={noopUpdate}
        formType="FORM_B"
        onDeleteKd={noopDelete}
        onAddKd={noopAdd}
      />,
    );

    const link = screen.getByRole("link", { name: /open help for self assessment/i });
    expect(link).toHaveAttribute("href", "/help/employee-guide/completing-self-assessment");
  });

  it("links to reference workflow-stages when read-only (canMgrRate=false and canEditKd=false)", () => {
    renderWithRouter(
      <KdSection
        deliverables={[makeKd()]}
        selfRatingEnabled={false}
        canEditKd={false}
        canMgrRate={false}
        onUpdateKd={noopUpdate}
        formType="FORM_B"
        onDeleteKd={noopDelete}
        onAddKd={noopAdd}
      />,
    );

    const link = screen.getByRole("link", { name: /open help for workflow stages/i });
    expect(link).toHaveAttribute("href", "/help/reference/workflow-stages");
  });
});
