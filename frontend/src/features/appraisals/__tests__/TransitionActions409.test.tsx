/**
 * RTL tests for TransitionActions — 409 version-conflict handling.
 *
 * Verifies:
 * - 409 response shows inline warning alert with conflict message
 * - Successful transition does NOT show any alert
 * - Refresh button in alert calls onRefresh callback
 */

import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TransitionActions } from "../components/TransitionActions";

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
// Helper: click the transition button then confirm in the dialog
// ---------------------------------------------------------------------------

async function triggerTransition(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole("button", { name: "Submit Self-Assessment" }),
  );
  const dialog = screen.getByRole("alertdialog");
  await user.click(
    within(dialog).getByRole("button", { name: "Submit Self-Assessment" }),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TransitionActions 409 conflict handling", () => {
  it("shows a warning alert with conflict message on 409 response", async () => {
    const user = userEvent.setup();
    const conflictError = {
      isAxiosError: true,
      response: {
        status: 409,
        data: {
          status: "error",
          data: { message: "Version conflict" },
        },
      },
    };
    const onTransition = vi.fn(() => Promise.reject(conflictError));
    const onRefresh = vi.fn();

    render(
      <TransitionActions
        status="SELF_ASSESSMENT"
        userRelation="APPRAISEE"
        onTransition={onTransition}
        onRefresh={onRefresh}
      />,
    );

    await triggerTransition(user);

    await waitFor(() => {
      expect(
        screen.getByText(
          "This appraisal was updated by another user. Please refresh.",
        ),
      ).toBeInTheDocument();
    });

    // The alert should use the "warning" variant (amber background)
    const alerts = screen.getAllByRole("alert");
    const warningAlert = alerts.find((el) =>
      el.classList.contains("border-amber-300"),
    );
    expect(warningAlert).toBeDefined();
  });

  it("does NOT show any alert after a successful transition", async () => {
    const user = userEvent.setup();
    const onTransition = vi.fn(() => Promise.resolve());
    const onRefresh = vi.fn();

    render(
      <TransitionActions
        status="SELF_ASSESSMENT"
        userRelation="APPRAISEE"
        onTransition={onTransition}
        onRefresh={onRefresh}
      />,
    );

    await triggerTransition(user);

    await waitFor(() => {
      expect(onTransition).toHaveBeenCalledWith("MANAGER_REVIEW");
    });

    // No alert element should be rendered
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("calls onRefresh when Refresh button in the alert is clicked", async () => {
    const user = userEvent.setup();
    const conflictError = {
      isAxiosError: true,
      response: {
        status: 409,
        data: {
          status: "error",
          data: { message: "Version conflict" },
        },
      },
    };
    const onTransition = vi.fn(() => Promise.reject(conflictError));
    const onRefresh = vi.fn();

    render(
      <TransitionActions
        status="SELF_ASSESSMENT"
        userRelation="APPRAISEE"
        onTransition={onTransition}
        onRefresh={onRefresh}
      />,
    );

    await triggerTransition(user);

    await waitFor(() => {
      expect(
        screen.getByText(
          "This appraisal was updated by another user. Please refresh.",
        ),
      ).toBeInTheDocument();
    });

    // onRefresh is called once immediately on 409 — reset the mock
    expect(onRefresh).toHaveBeenCalledTimes(1);
    onRefresh.mockClear();

    // Click the Refresh button inside the alert
    const refreshButton = screen.getByRole("button", { name: "Refresh" });
    await user.click(refreshButton);

    expect(onRefresh).toHaveBeenCalledTimes(1);

    // Alert should be dismissed after clicking Refresh
    expect(
      screen.queryByText(
        "This appraisal was updated by another user. Please refresh.",
      ),
    ).not.toBeInTheDocument();
  });
});
