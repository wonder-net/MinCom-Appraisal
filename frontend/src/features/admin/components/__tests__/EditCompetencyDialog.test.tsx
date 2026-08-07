/**
 * Tests for EditCompetencyDialog — verifies pre-fill, name immutability,
 * payload composition (name omitted), and error path keeps dialog open.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockPatchCompetency = vi.fn();

vi.mock("@/api/competencies", async () => {
  const actual =
    await vi.importActual<typeof import("@/api/competencies")>(
      "@/api/competencies",
    );
  return {
    ...actual,
    patchCompetency: (...args: unknown[]) => mockPatchCompetency(...args),
  };
});

import { EditCompetencyDialog } from "../EditCompetencyDialog";
import type { Competency } from "@/api/competencies";

function makeCompetency(overrides: Partial<Competency> = {}): Competency {
  return {
    id: "c-001",
    name: "Customer Focus",
    category: "MANAGERIAL",
    applicable_to: "MANAGERIAL",
    is_core: false,
    sort_order: 3,
    is_active: true,
    ...overrides,
  };
}

describe("EditCompetencyDialog", () => {
  beforeEach(() => {
    mockPatchCompetency.mockReset();
  });

  it("pre-fills fields from the competency prop", () => {
    const competency = makeCompetency({
      applicable_to: "MANAGERIAL",
      is_core: false,
      sort_order: 3,
    });
    render(
      <EditCompetencyDialog
        open
        competency={competency}
        onClose={() => {}}
        onSuccess={() => {}}
      />,
    );

    const applicableToSelect = screen.getByLabelText(
      /applicable to/i,
    ) as HTMLSelectElement;
    expect(applicableToSelect.value).toBe("MANAGERIAL");

    const sortOrderInput = screen.getByLabelText(
      /sort order/i,
    ) as HTMLInputElement;
    expect(sortOrderInput.value).toBe("3");

    const isCoreCheckbox = screen.getByRole("checkbox", {
      name: /core competency/i,
    });
    expect(isCoreCheckbox).toHaveAttribute("data-state", "unchecked");
  });

  it("renders the name input as disabled with the historical-rating tooltip", () => {
    const competency = makeCompetency();
    render(
      <EditCompetencyDialog
        open
        competency={competency}
        onClose={() => {}}
        onSuccess={() => {}}
      />,
    );

    const nameInput = screen.getByLabelText(/^name$/i) as HTMLInputElement;
    expect(nameInput).toBeDisabled();
    const title = nameInput.getAttribute("title") ?? "";
    expect(title).toContain("historical appraisal ratings");
  });

  it("submits PATCH with only changed fields and omits name", async () => {
    const user = userEvent.setup();
    mockPatchCompetency.mockResolvedValueOnce({});
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    const competency = makeCompetency({
      applicable_to: "MANAGERIAL",
      is_core: false,
      sort_order: 3,
    });

    render(
      <EditCompetencyDialog
        open
        competency={competency}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );

    const sortOrderInput = screen.getByLabelText(/sort order/i);
    await user.clear(sortOrderInput);
    await user.type(sortOrderInput, "9");

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(mockPatchCompetency).toHaveBeenCalledTimes(1);
    });

    expect(mockPatchCompetency).toHaveBeenCalledWith(
      competency.id,
      expect.not.objectContaining({ name: expect.anything() }),
    );
    expect(mockPatchCompetency).toHaveBeenCalledWith(
      competency.id,
      expect.objectContaining({ sort_order: 9 }),
    );

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("skips the API call when Save is clicked with no changes", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    const competency = makeCompetency({
      applicable_to: "MANAGERIAL",
      is_core: false,
      sort_order: 3,
    });

    render(
      <EditCompetencyDialog
        open
        competency={competency}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(mockPatchCompetency).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("skips the API call when fields are changed then reverted before submit", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    const competency = makeCompetency({
      applicable_to: "MANAGERIAL",
      is_core: false,
      sort_order: 3,
    });

    render(
      <EditCompetencyDialog
        open
        competency={competency}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );

    const sortOrderInput = screen.getByLabelText(/sort order/i);
    await user.clear(sortOrderInput);
    await user.type(sortOrderInput, "9");
    await user.clear(sortOrderInput);
    await user.type(sortOrderInput, "3");

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(mockPatchCompetency).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps the dialog open and shows an error when the API rejects", async () => {
    const user = userEvent.setup();
    mockPatchCompetency.mockRejectedValueOnce(
      new Error("Server exploded gracefully"),
    );
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    const competency = makeCompetency();

    render(
      <EditCompetencyDialog
        open
        competency={competency}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );

    const sortOrderInput = screen.getByLabelText(/sort order/i);
    await user.clear(sortOrderInput);
    await user.type(sortOrderInput, "7");

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(mockPatchCompetency).toHaveBeenCalledTimes(1);
    });

    expect(onSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    // Dialog still mounted (title is unique to this dialog).
    expect(
      screen.getByRole("dialog", { name: /edit competency/i }),
    ).toBeInTheDocument();

    // An error message is rendered (form-level alert or toast).
    const alerts = await screen.findAllByRole("alert");
    expect(alerts.length).toBeGreaterThan(0);
  });
});
