/**
 * StatusBadge — Unit tests for status-to-colour class mapping.
 *
 * Verifies all 14+ known status strings render the correct colour
 * classes and that unknown statuses render neutral grey.
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StatusBadge } from "../StatusBadge";

describe("StatusBadge", () => {
  const KNOWN_STATUSES: Array<{
    status: string;
    label: string;
    expectedClass: string;
  }> = [
    { status: "SELF_ASSESSMENT", label: "Self Assessment", expectedClass: "bg-blue-50" },
    { status: "MANAGER_REVIEW", label: "Manager Review", expectedClass: "bg-amber-50" },
    { status: "DISCUSSION", label: "Discussion", expectedClass: "bg-purple-50" },
    { status: "GROWTH_PLAN", label: "Growth Plan", expectedClass: "bg-teal-50" },
    { status: "PENDING_SIGNOFF", label: "Pending Signoff", expectedClass: "bg-orange-50" },
    { status: "FINALISED", label: "Finalised", expectedClass: "bg-emerald-50" },
    { status: "DISPUTED", label: "Disputed", expectedClass: "bg-red-50" },
    { status: "Active", label: "Active", expectedClass: "bg-green-50" },
    { status: "Inactive", label: "Inactive", expectedClass: "bg-gray-100" },
    { status: "CLOSED", label: "Closed", expectedClass: "bg-primary-light" },
    { status: "UPDATE", label: "UPDATE", expectedClass: "bg-primary-light" },
    { status: "CREATE", label: "CREATE", expectedClass: "bg-green-50" },
    { status: "LOGIN", label: "LOGIN", expectedClass: "bg-gray-100" },
    { status: "Enabled", label: "Enabled", expectedClass: "bg-green-50" },
    { status: "Disabled", label: "Disabled", expectedClass: "bg-gray-100" },
  ];

  it.each(KNOWN_STATUSES)(
    "renders $status with correct label and colour class",
    ({ status, label, expectedClass }) => {
      render(<StatusBadge status={status} />);
      const badge = screen.getByText(label);
      expect(badge).toBeInTheDocument();
      expect(badge.className).toContain(expectedClass);
      expect(badge.className).toContain("rounded-full");
      expect(badge.className).toContain("text-xs");
      expect(badge.className).toContain("font-medium");
    },
  );

  it("renders unknown status with neutral grey classes", () => {
    render(<StatusBadge status="UNKNOWN_STATUS_XYZ" />);
    const badge = screen.getByText("UNKNOWN_STATUS_XYZ");
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain("bg-gray-100");
    expect(badge.className).toContain("text-gray-600");
    expect(badge.className).toContain("border-gray-300");
  });

  it("applies additional className when provided", () => {
    render(<StatusBadge status="SELF_ASSESSMENT" className="ml-2" />);
    const badge = screen.getByText("Self Assessment");
    expect(badge.className).toContain("ml-2");
  });

  it("has no raw hex colour values in any known status", () => {
    const { container } = render(
      <div>
        {KNOWN_STATUSES.map(({ status }) => (
          <StatusBadge key={status} status={status} />
        ))}
      </div>,
    );
    const allClassNames = Array.from(container.querySelectorAll("span"))
      .map((el) => el.className)
      .join(" ");
    expect(allClassNames).not.toMatch(/#[0-9A-Fa-f]{6}/);
  });
});
