/**
 * API service functions for notification endpoints.
 *
 * All functions use the centralised apiClient with JWT interceptors.
 * The response interceptor automatically unwraps the standard
 * { status, data, meta } envelope — callers receive the inner
 * payload directly.
 */

import { apiClient } from "./client";
import type { Notification } from "@/types";

/**
 * Fetch the current user's unread notification count.
 * GET /api/v1/notifications/unread-count/
 */
export async function getUnreadCount(): Promise<number> {
  const response = await apiClient.get<{ unread_count: number }>(
    "notifications/unread-count/",
  );
  return response.data.unread_count;
}

/**
 * List the 10 most recent notifications for the current user.
 * GET /api/v1/notifications/
 */
export async function listNotifications(): Promise<Notification[]> {
  const response = await apiClient.get<Notification[]>("notifications/");
  return response.data;
}

/**
 * Mark a single notification as read.
 * PATCH /api/v1/notifications/{id}/read/
 */
export async function markRead(id: string): Promise<void> {
  await apiClient.patch(`notifications/${id}/read/`);
}

/**
 * Mark all notifications as read.
 * POST /api/v1/notifications/mark-all-read/
 */
export async function markAllRead(): Promise<void> {
  await apiClient.post("notifications/mark-all-read/");
}
