/**
 * Unit and integration tests for TransitionActions — verifies the
 * GROWTH_PLANNING → PENDING_SIGNOFF transition button and error display.
 */

import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TransitionActions, getButtons } from "../components/TransitionActions";

// ---------------------------------------------------------------------------
// jsdom does not implement HTMLDialogElement.showModal / .close
// ---------------------------------------------------------------------------

beforeAll(() => {
  if (typeof HTMLDialogElement.prototype.showModal !== "function") {
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    });
  }
  if (typeof HTMLDialogElement.prototype.close !== "function") {
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    });
  }
});

// ---------------------------------------------------------------------------
// Unit tests — getButtons()
// ---------------------------------------------------------------------------

describe("getButtons", () => {
  it("returns a single Submit for Sign-off button for GROWTH_PLANNING + APPRAISER", () => {
    const buttons = getButtons("GROWTH_PLANNING", "APPRAISER");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].toStatus).toBe("PENDING_SIGNOFF");
    expect(buttons[0].label).toBe("Submit for Sign-off");
  });

  it("returns empty array for GROWTH_PLANNING + APPRAISEE", () => {
    expect(getButtons("GROWTH_PLANNING", "APPRAISEE")).toHaveLength(0);
  });

  it("returns empty array for GROWTH_PLANNING + HR_ADMIN", () => {
    expect(getButtons("GROWTH_PLANNING", "HR_ADMIN")).toHaveLength(0);
  });

  it("returns empty array for GROWTH_PLANNING + NONE", () => {
    expect(getButtons("GROWTH_PLANNING", "NONE")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Unit tests — getButtons() with isHRAdmin flag
// ---------------------------------------------------------------------------

describe("getButtons with isHRAdmin=true", () => {
  it("returns Finalise button for SIGNED_OFF when isHRAdmin=true and relation is APPRAISEE", () => {
    const buttons = getButtons("SIGNED_OFF", "APPRAISEE", true);
    expect(buttons).toHaveLength(1);
    expect(buttons[0].toStatus).toBe("FINALISED");
    expect(buttons[0].label).toBe("Finalise");
  });

  it("returns Finalise button for SIGNED_OFF when isHRAdmin=true and relation is APPRAISER", () => {
    const buttons = getButtons("SIGNED_OFF", "APPRAISER", true);
    expect(buttons).toHaveLength(1);
    expect(buttons[0].toStatus).toBe("FINALISED");
    expect(buttons[0].label).toBe("Finalise");
  });

  it("returns Return to Discussion button for DISPUTED when isHRAdmin=true and relation is APPRAISEE", () => {
    const buttons = getButtons("DISPUTED", "APPRAISEE", true);
    expect(buttons).toHaveLength(1);
    expect(buttons[0].toStatus).toBe("DISCUSSION");
    expect(buttons[0].label).toBe("Return to Discussion");
  });

  it("returns Return to Discussion button for DISPUTED when isHRAdmin=true and relation is APPRAISER", () => {
    const buttons = getButtons("DISPUTED", "APPRAISER", true);
    expect(buttons).toHaveLength(1);
    expect(buttons[0].toStatus).toBe("DISCUSSION");
    expect(buttons[0].label).toBe("Return to Discussion");
  });

  it("returns Finalise button for SIGNED_OFF when relation is HR_ADMIN (without isHRAdmin flag)", () => {
    const buttons = getButtons("SIGNED_OFF", "HR_ADMIN", false);
    expect(buttons).toHaveLength(1);
    expect(buttons[0].toStatus).toBe("FINALISED");
  });

  it("returns empty for SIGNED_OFF when isHRAdmin=false and relation is APPRAISEE", () => {
    const buttons = getButtons("SIGNED_OFF", "APPRAISEE", false);
    expect(buttons).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Integration tests — RTL
// ---------------------------------------------------------------------------

describe("TransitionActions GROWTH_PLANNING integration", () => {
  it("renders Submit for Sign-off button for APPRAISER", () => {
    const onTransition = vi.fn(() => Promise.resolve());
    render(
      <TransitionActions
        status="GROWTH_PLANNING"
        userRelation="APPRAISER"
        onTransition={onTransition}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Submit for Sign-off" }),
    ).toBeInTheDocument();
  });

  it("does not render any buttons for APPRAISEE at GROWTH_PLANNING", () => {
    const onTransition = vi.fn(() => Promise.resolve());
    const { container } = render(
      <TransitionActions
        status="GROWTH_PLANNING"
        userRelation="APPRAISEE"
        onTransition={onTransition}
      />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("opens confirm dialog on click and calls onTransition on confirm", async () => {
    const user = userEvent.setup();
    const onTransition = vi.fn(() => Promise.resolve());
    render(
      <TransitionActions
        status="GROWTH_PLANNING"
        userRelation="APPRAISER"
        onTransition={onTransition}
      />,
    );

    // Click the transition button — should NOT call onTransition yet
    await user.click(screen.getByRole("button", { name: "Submit for Sign-off" }));
    expect(onTransition).not.toHaveBeenCalled();

    // The confirm dialog should now be visible
    expect(screen.getByText("Submit the growth plan and request sign-off?")).toBeInTheDocument();

    // Click the confirm button inside the dialog (scoped to the alertdialog)
    const dialog = screen.getByRole("alertdialog");
    const confirmBtn = within(dialog).getByRole("button", { name: "Submit for Sign-off" });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(onTransition).toHaveBeenCalledWith("PENDING_SIGNOFF");
    });
  });

  it("displays error message when onTransition rejects with 422", async () => {
    const user = userEvent.setup();
    const apiError = {
      isAxiosError: true,
      response: {
        status: 422,
        data: {
          status: "error",
          data: {
            message: "Growth plan incomplete: requires at least one strength",
          },
        },
      },
    };

    const onTransition = vi.fn(() => Promise.reject(apiError));
    render(
      <TransitionActions
        status="GROWTH_PLANNING"
        userRelation="APPRAISER"
        onTransition={onTransition}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Submit for Sign-off" }));
    // Confirm in the dialog (scoped to the alertdialog)
    const dialog = screen.getByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Submit for Sign-off" }));

    await waitFor(() => {
      expect(
        screen.getByText("Growth plan incomplete: requires at least one strength"),
      ).toBeInTheDocument();
    });

    // Verify it's rendered with role="alert" for accessibility
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("displays generic error when onTransition rejects with non-Axios error", async () => {
    const user = userEvent.setup();
    const onTransition = vi.fn(() => Promise.reject(new Error("Network error")));
    render(
      <TransitionActions
        status="GROWTH_PLANNING"
        userRelation="APPRAISER"
        onTransition={onTransition}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Submit for Sign-off" }));
    const dialog = screen.getByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Submit for Sign-off" }));

    await waitFor(() => {
      expect(screen.getByText("An unexpected error occurred.")).toBeInTheDocument();
    });
  });
});
