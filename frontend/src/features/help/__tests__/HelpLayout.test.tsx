/**
 * Integration test for HelpLayout — verifies that the layout renders both
 * the sidebar TOC and the matched route's `<Outlet />`, and that the active
 * link in the TOC reflects the current route.
 */

import { describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { BreadcrumbProvider } from "@/context/BreadcrumbContext";
import { HelpLayout } from "../HelpLayout";
import { HelpIndexPage } from "../HelpIndexPage";
import { HelpPage } from "../HelpPage";

vi.mock("@/auth/useAuth", () => ({
  useAuth: () => ({
    user: {
      id: "u-emp",
      email: "emp@mincom.com",
      roles: ["EMPLOYEE"],
      is_mfa_enabled: false,
      employee_id: "e-1",
      must_change_password: false,
    },
    isAuthenticated: true,
    isLoading: false,
  }),
}));

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <BreadcrumbProvider>
        <Routes>
          <Route path="/help" element={<HelpLayout />}>
            <Route index element={<HelpIndexPage />} />
            <Route path=":section/:slug" element={<HelpPage />} />
          </Route>
        </Routes>
      </BreadcrumbProvider>
    </MemoryRouter>,
  );

describe("HelpLayout", () => {
  it("renders the sidebar nav and the index page outlet at /help", () => {
    renderAt("/help");

    // Sidebar
    const aside = screen.getByRole("complementary", {
      name: /help center navigation/i,
    });
    expect(aside).toBeInTheDocument();
    expect(within(aside).getByText(/help center/i)).toBeInTheDocument();

    // Outlet — index page heading
    expect(
      screen.getByRole("heading", { level: 1, name: /help center/i }),
    ).toBeInTheDocument();
  });

  it("highlights the active link when on an article route", () => {
    renderAt("/help/employee-guide/completing-self-assessment");

    // Outlet renders the article heading
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /completing your self-assessment/i,
      }),
    ).toBeInTheDocument();

    // The TOC link to the active article carries aria-current="page"
    const aside = screen.getByRole("complementary", {
      name: /help center navigation/i,
    });
    const activeLink = within(aside).getByRole("link", {
      name: /completing your self-assessment/i,
    });
    expect(activeLink).toHaveAttribute("aria-current", "page");
  });

  it("renders the mobile Contents button (only visible at < md)", () => {
    renderAt("/help");
    expect(
      screen.getByRole("button", { name: /contents/i }),
    ).toBeInTheDocument();
  });

  it("does not steal focus to the Contents button on initial mount", () => {
    // Place a sentinel element with autofocus before mounting HelpLayout —
    // it would lose focus if the focus-restore effect ran on mount.
    const sentinel = document.createElement("button");
    sentinel.id = "pre-mount-sentinel";
    sentinel.textContent = "Sentinel";
    document.body.appendChild(sentinel);
    sentinel.focus();
    expect(document.activeElement).toBe(sentinel);

    renderAt("/help");

    const contentsButton = screen.getByRole("button", { name: /contents/i });
    expect(document.activeElement).not.toBe(contentsButton);

    document.body.removeChild(sentinel);
  });

  it("traps focus inside the mobile drawer when opened", () => {
    renderAt("/help");

    // Open the drawer.
    const contentsButton = screen.getByRole("button", { name: /contents/i });
    act(() => {
      fireEvent.click(contentsButton);
    });

    // Drawer is rendered as a dialog with aria-modal="true".
    const drawer = screen.getByRole("dialog", { name: /help center contents/i });
    expect(drawer).toHaveAttribute("aria-modal", "true");

    // Focus has moved into the drawer panel (the panel itself is focusable
    // via tabIndex={-1} and our open-effect calls .focus() on it).
    const drawerPanel = drawer.querySelector<HTMLElement>(
      'div[tabindex="-1"]',
    );
    expect(drawerPanel).not.toBeNull();
    expect(document.activeElement).toBe(drawerPanel);

    // ESC closes the drawer and restores focus to the Contents button.
    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(
      screen.queryByRole("dialog", { name: /help center contents/i }),
    ).toBeNull();
    expect(document.activeElement).toBe(contentsButton);
  });
});
