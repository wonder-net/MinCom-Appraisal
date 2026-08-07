/**
 * Tests for the NotificationItem component.
 *
 * Covers TASK-283: the whole notification row is the click target. Clicking
 * anywhere on a row marks the notification as read (if unread), closes the
 * popover via the `onClose` callback, and — when the notification has a
 * target — navigates to that target.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import type { Notification } from "@/types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import { NotificationItem } from "../NotificationItem";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: "n-001",
    event_type: "APPRAISAL_SUBMITTED",
    title: "Appraisal Submitted",
    message: "Your appraisal has been submitted for review.",
    is_read: false,
    created_at: new Date(Date.now() - 3600_000).toISOString(),
    appraisal: "a-001",
    related_object_type: "",
    related_object_id: null,
    ...overrides,
  };
}

function Wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

let onMarkRead: ReturnType<typeof vi.fn>;
let onClose: ReturnType<typeof vi.fn>;

beforeEach(() => {
  onMarkRead = vi.fn();
  onClose = vi.fn();
  mockNavigate.mockReset();
});

// ---------------------------------------------------------------------------
// Tests — TASK-283: whole-row click is the action
// ---------------------------------------------------------------------------

describe("NotificationItem — TASK-283: whole-row click target", () => {
  it("row click on a notification with `appraisal` navigates to /appraisals/<id>, marks read, calls onClose", async () => {
    const user = userEvent.setup();
    const notification = makeNotification({
      id: "n-appraisal",
      title: "Appraisal Updated",
      appraisal: "a-123",
      related_object_type: "",
      related_object_id: null,
      is_read: false,
    });

    render(
      <NotificationItem
        notification={notification}
        onMarkRead={onMarkRead}
        onClose={onClose}
      />,
      { wrapper: Wrapper },
    );

    await user.click(
      screen.getByRole("button", { name: /unread: appraisal updated/i }),
    );

    expect(onMarkRead).toHaveBeenCalledTimes(1);
    expect(onMarkRead).toHaveBeenCalledWith("n-appraisal");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith("/appraisals/a-123");
  });

  it("row click on an appraisal-bulk-import notification navigates to the import results page", async () => {
    const user = userEvent.setup();
    const notification = makeNotification({
      id: "n-appraisal-import",
      title: "Appraisal import complete",
      appraisal: null,
      related_object_type: "AppraisalBulkImportJob",
      related_object_id: "job-aaa",
      is_read: false,
    });

    render(
      <NotificationItem
        notification={notification}
        onMarkRead={onMarkRead}
        onClose={onClose}
      />,
      { wrapper: Wrapper },
    );

    await user.click(
      screen.getByRole("button", { name: /appraisal import complete/i }),
    );

    expect(onMarkRead).toHaveBeenCalledWith("n-appraisal-import");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith(
      "/admin/appraisals/import/job-aaa/results",
    );
  });

  it("row click on a user-bulk-import notification navigates to the user import results page", async () => {
    const user = userEvent.setup();
    const notification = makeNotification({
      id: "n-user-import",
      title: "User import complete",
      appraisal: null,
      related_object_type: "BulkImportJob",
      related_object_id: "job-bbb",
      is_read: false,
    });

    render(
      <NotificationItem
        notification={notification}
        onMarkRead={onMarkRead}
        onClose={onClose}
      />,
      { wrapper: Wrapper },
    );

    await user.click(
      screen.getByRole("button", { name: /user import complete/i }),
    );

    expect(onMarkRead).toHaveBeenCalledWith("n-user-import");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith(
      "/admin/users/import/job-bbb/results",
    );
  });

  it("row click on a notification with NO target marks read + calls onClose but does NOT navigate", async () => {
    const user = userEvent.setup();
    const notification = makeNotification({
      id: "n-no-target",
      title: "System Announcement",
      appraisal: null,
      related_object_type: "",
      related_object_id: null,
      is_read: false,
    });

    render(
      <NotificationItem
        notification={notification}
        onMarkRead={onMarkRead}
        onClose={onClose}
      />,
      { wrapper: Wrapper },
    );

    await user.click(
      screen.getByRole("button", { name: /system announcement\. press to dismiss\./i }),
    );

    expect(onMarkRead).toHaveBeenCalledTimes(1);
    expect(onMarkRead).toHaveBeenCalledWith("n-no-target");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("row click on an already-read notification still calls onClose + navigates but does NOT call onMarkRead", async () => {
    const user = userEvent.setup();
    const notification = makeNotification({
      id: "n-already-read",
      title: "Old Notification",
      appraisal: "a-999",
      is_read: true,
    });

    render(
      <NotificationItem
        notification={notification}
        onMarkRead={onMarkRead}
        onClose={onClose}
      />,
      { wrapper: Wrapper },
    );

    await user.click(screen.getByRole("button", { name: /old notification/i }));

    expect(onMarkRead).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith("/appraisals/a-999");
  });

  it("onClose is optional — row click works without it", async () => {
    const user = userEvent.setup();
    const notification = makeNotification({
      id: "n-no-onclose",
      title: "No OnClose Notification",
      appraisal: "a-555",
      is_read: false,
    });

    render(
      <NotificationItem notification={notification} onMarkRead={onMarkRead} />,
      { wrapper: Wrapper },
    );

    await user.click(
      screen.getByRole("button", { name: /no onclose notification/i }),
    );

    expect(onMarkRead).toHaveBeenCalledWith("n-no-onclose");
    expect(mockNavigate).toHaveBeenCalledWith("/appraisals/a-555");
  });

  it("keyboard activation (Enter) triggers the same row action", async () => {
    const user = userEvent.setup();
    const notification = makeNotification({
      id: "n-keyboard",
      title: "Keyboard Notification",
      appraisal: "a-kbd",
      is_read: false,
    });

    render(
      <NotificationItem
        notification={notification}
        onMarkRead={onMarkRead}
        onClose={onClose}
      />,
      { wrapper: Wrapper },
    );

    const row = screen.getByRole("button", { name: /keyboard notification/i });
    row.focus();
    await user.keyboard("{Enter}");

    expect(onMarkRead).toHaveBeenCalledWith("n-keyboard");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith("/appraisals/a-kbd");
  });

  it("does not render an inline link inside the row (single focus target)", () => {
    const notification = makeNotification({
      id: "n-no-link",
      appraisal: "a-x",
      is_read: false,
    });

    render(
      <NotificationItem notification={notification} onMarkRead={onMarkRead} />,
      { wrapper: Wrapper },
    );

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
