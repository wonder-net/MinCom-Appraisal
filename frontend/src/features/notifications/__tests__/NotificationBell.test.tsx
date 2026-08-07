/**
 * Tests for the NotificationBell component and its child components.
 * Covers TASK-111, TASK-112, and TASK-113 acceptance criteria.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import type { Notification } from "@/types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetUnreadCount = vi.fn<() => Promise<number>>();
const mockListNotifications = vi.fn<() => Promise<Notification[]>>();
const mockMarkRead = vi.fn<(id: string) => Promise<void>>();
const mockMarkAllRead = vi.fn<() => Promise<void>>();

vi.mock("@/api/notifications", () => ({
  getUnreadCount: () => mockGetUnreadCount(),
  listNotifications: () => mockListNotifications(),
  markRead: (id: string) => mockMarkRead(id),
  markAllRead: () => mockMarkAllRead(),
}));

// Lazy-import after mocks
const { NotificationBell } = await import("@/components/NotificationBell");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNotification(
  overrides: Partial<Notification> = {},
): Notification {
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

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mockGetUnreadCount.mockReset();
  mockListNotifications.mockReset();
  mockMarkRead.mockReset();
  mockMarkAllRead.mockReset();

  // Default: count is 0, empty notifications
  mockGetUnreadCount.mockResolvedValue(0);
  mockListNotifications.mockResolvedValue([]);
  mockMarkRead.mockResolvedValue(undefined);
  mockMarkAllRead.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// TASK-111 Tests
// ---------------------------------------------------------------------------

describe("TASK-111: Notification bell with unread count badge", () => {
  it("renders bell icon with badge when unread count > 0", async () => {
    mockGetUnreadCount.mockResolvedValue(5);

    render(<NotificationBell />, { wrapper: Wrapper });

    await waitFor(() => {
      const button = screen.getByRole("button", {
        name: /notifications/i,
      });
      expect(button).toBeInTheDocument();
      expect(button).toHaveAttribute(
        "aria-label",
        "Notifications \u2014 5 unread",
      );
    });

    // Badge text should show "5"
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("renders bell icon without badge when unread count is 0", async () => {
    mockGetUnreadCount.mockResolvedValue(0);

    render(<NotificationBell />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Notifications" }),
      ).toBeInTheDocument();
    });

    // No badge text
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("shows actual count up to 999 and caps at 999+", async () => {
    mockGetUnreadCount.mockResolvedValue(15);

    const { unmount } = render(<NotificationBell />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("15")).toBeInTheDocument();
    });

    unmount();

    mockGetUnreadCount.mockResolvedValue(1000);
    render(<NotificationBell />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("999+")).toBeInTheDocument();
    });
  });

  it("renders without badge when API fails (silent degradation)", async () => {
    mockGetUnreadCount.mockRejectedValue(new Error("Network error"));

    render(<NotificationBell />, { wrapper: Wrapper });

    // Should still render the button
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Notifications" }),
      ).toBeInTheDocument();
    });

    // No error message in DOM
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("polls unread count every 60 seconds and clears on unmount", async () => {
    mockGetUnreadCount.mockResolvedValue(2);

    const { unmount } = render(<NotificationBell />, { wrapper: Wrapper });

    // Initial fetch
    await waitFor(() => {
      expect(mockGetUnreadCount).toHaveBeenCalledTimes(1);
    });

    // Advance 60 seconds — should poll again
    vi.advanceTimersByTime(60_000);
    await waitFor(() => {
      expect(mockGetUnreadCount).toHaveBeenCalledTimes(2);
    });

    // Advance another 60 seconds
    vi.advanceTimersByTime(60_000);
    await waitFor(() => {
      expect(mockGetUnreadCount).toHaveBeenCalledTimes(3);
    });

    // Unmount — no more calls after this
    unmount();
    vi.advanceTimersByTime(60_000);
    expect(mockGetUnreadCount).toHaveBeenCalledTimes(3);
  });
});

// ---------------------------------------------------------------------------
// TASK-112 Tests
// ---------------------------------------------------------------------------

describe("TASK-112: Notification dropdown with mark-read on click", () => {
  it("fetches and renders notifications when popover opens", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockGetUnreadCount.mockResolvedValue(2);
    mockListNotifications.mockResolvedValue([
      makeNotification({ id: "n-001", title: "Submitted for Review" }),
      makeNotification({
        id: "n-002",
        title: "Approved",
        is_read: true,
      }),
    ]);

    render(<NotificationBell />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /notifications/i })).toBeInTheDocument();
    });

    // Click bell to open popover
    await user.click(screen.getByRole("button", { name: /notifications/i }));

    await waitFor(() => {
      expect(mockListNotifications).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Submitted for Review")).toBeInTheDocument();
      expect(screen.getByText("Approved")).toBeInTheDocument();
    });
  });

  it("shows unread notification with blue background and read with white", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockGetUnreadCount.mockResolvedValue(1);
    mockListNotifications.mockResolvedValue([
      makeNotification({ id: "n-001", title: "Unread Item", is_read: false }),
      makeNotification({ id: "n-002", title: "Read Item", is_read: true }),
    ]);

    render(<NotificationBell />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /notifications/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /notifications/i }));

    await waitFor(() => {
      const unreadItem = screen.getByRole("button", {
        name: /unread: unread item/i,
      });
      expect(unreadItem.className).toContain("bg-primary-light/30");

      const readItem = screen.getByRole("button", { name: /^read item\./i });
      expect(readItem.className).toContain("bg-white");
    });
  });

  it("marks notification as read on click", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockGetUnreadCount.mockResolvedValue(1);
    mockListNotifications.mockResolvedValue([
      makeNotification({ id: "n-001", title: "New Notification", is_read: false }),
    ]);

    render(<NotificationBell />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /notifications/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /notifications/i }));

    await waitFor(() => {
      expect(screen.getByText("New Notification")).toBeInTheDocument();
    });

    // Click the notification item
    await user.click(
      screen.getByRole("button", { name: /unread: new notification/i }),
    );

    await waitFor(() => {
      expect(mockMarkRead).toHaveBeenCalledWith("n-001");
    });
  });

  it("clicking a notification closes the popover (TASK-283)", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockGetUnreadCount.mockResolvedValue(1);
    mockListNotifications.mockResolvedValue([
      makeNotification({
        id: "n-001",
        title: "Closes Popover",
        is_read: false,
        appraisal: null,
        related_object_type: "",
        related_object_id: null,
      }),
    ]);

    render(<NotificationBell />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /notifications/i }),
      ).toBeInTheDocument();
    });

    const bellButton = screen.getByRole("button", { name: /notifications/i });
    await user.click(bellButton);

    await waitFor(() => {
      expect(screen.getByText("Closes Popover")).toBeInTheDocument();
    });

    expect(bellButton).toHaveAttribute("aria-expanded", "true");

    // Click the row — should close the popover
    await user.click(
      screen.getByRole("button", { name: /closes popover\. press to dismiss\./i }),
    );

    await waitFor(() => {
      expect(bellButton).toHaveAttribute("aria-expanded", "false");
    });

    // Panel content should be gone
    await waitFor(() => {
      expect(screen.queryByText("Closes Popover")).not.toBeInTheDocument();
    });
  });

  it("shows empty state when no notifications", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockGetUnreadCount.mockResolvedValue(0);
    mockListNotifications.mockResolvedValue([]);

    render(<NotificationBell />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Notifications" }));

    await waitFor(() => {
      expect(
        screen.getByText("No notifications yet."),
      ).toBeInTheDocument();
    });
  });

  it("shows loading skeleton while fetching", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockGetUnreadCount.mockResolvedValue(1);

    // Never resolve to keep loading state
    mockListNotifications.mockReturnValue(new Promise(() => {}));

    render(<NotificationBell />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /notifications/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /notifications/i }));

    await waitFor(() => {
      expect(
        screen.getByLabelText("Loading notifications"),
      ).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// TASK-113 Tests
// ---------------------------------------------------------------------------

describe("TASK-113: Mark all as read footer", () => {
  it("shows 'Mark all as read' button when unread notifications exist", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockGetUnreadCount.mockResolvedValue(2);
    mockListNotifications.mockResolvedValue([
      makeNotification({ id: "n-001", is_read: false }),
      makeNotification({ id: "n-002", is_read: false }),
    ]);

    render(<NotificationBell />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /notifications/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /notifications/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: /mark all notifications as read/i,
        }),
      ).toBeInTheDocument();
    });
  });

  it("hides 'Mark all as read' button when all notifications are read", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockGetUnreadCount.mockResolvedValue(0);
    mockListNotifications.mockResolvedValue([
      makeNotification({ id: "n-001", title: "Already Read", is_read: true }),
      makeNotification({ id: "n-002", title: "Also Read", is_read: true }),
    ]);

    render(<NotificationBell />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Notifications" }));

    await waitFor(() => {
      expect(screen.getByText("Already Read")).toBeInTheDocument();
    });

    expect(
      screen.queryByRole("button", {
        name: /mark all notifications as read/i,
      }),
    ).not.toBeInTheDocument();
  });

  it("calls markAllRead and updates UI on click", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockGetUnreadCount.mockResolvedValue(2);
    mockListNotifications.mockResolvedValue([
      makeNotification({ id: "n-001", title: "First", is_read: false }),
      makeNotification({ id: "n-002", title: "Second", is_read: false }),
    ]);

    render(<NotificationBell />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /notifications/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /notifications/i }));

    await waitFor(() => {
      expect(screen.getByText("First")).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole("button", {
        name: /mark all notifications as read/i,
      }),
    );

    await waitFor(() => {
      expect(mockMarkAllRead).toHaveBeenCalledTimes(1);
    });

    // After marking all read, items should switch to white bg
    await waitFor(() => {
      const firstItem = screen.getByRole("button", { name: /^first\./i });
      expect(firstItem.className).toContain("bg-white");
    });
  });

  it("shows error toast and reverts state when markAllRead fails", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockGetUnreadCount.mockResolvedValue(1);
    mockListNotifications.mockResolvedValue([
      makeNotification({
        id: "n-001",
        title: "Pending Review",
        is_read: false,
      }),
    ]);
    mockMarkAllRead.mockRejectedValue(new Error("Server error"));

    render(<NotificationBell />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /notifications/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /notifications/i }));

    await waitFor(() => {
      expect(screen.getByText("Pending Review")).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole("button", {
        name: /mark all notifications as read/i,
      }),
    );

    // Error toast should appear
    await waitFor(() => {
      expect(
        screen.getByText("Failed to mark all notifications as read."),
      ).toBeInTheDocument();
    });

    // State should revert — item should have blue bg again
    await waitFor(() => {
      const item = screen.getByRole("button", {
        name: /unread: pending review/i,
      });
      expect(item.className).toContain("bg-primary-light/30");
    });
  });
});
