/**
 * Unit tests for AppraisalStatusBadge — verifies all 10 status variants
 * render with the correct CSS classes and label text.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppraisalStatusBadge } from "../components/AppraisalStatusBadge";
import type { AppraisalStatus } from "@/types";

const STATUS_EXPECTED: ReadonlyArray<{
  status: AppraisalStatus;
  label: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
}> = [
  { status: "SELF_ASSESSMENT", label: "Self Assessment", bgClass: "bg-blue-50", textClass: "text-blue-700", borderClass: "border-blue-200" },
  { status: "MANAGER_REVIEW", label: "Manager Review", bgClass: "bg-amber-50", textClass: "text-amber-700", borderClass: "border-amber-300" },
  { status: "DISCUSSION", label: "Discussion", bgClass: "bg-purple-50", textClass: "text-purple-700", borderClass: "border-purple-200" },
  { status: "GROWTH_PLANNING", label: "Growth Planning", bgClass: "bg-teal-50", textClass: "text-teal-700", borderClass: "border-teal-200" },
  { status: "PENDING_SIGNOFF", label: "Pending Signoff", bgClass: "bg-orange-50", textClass: "text-orange-700", borderClass: "border-orange-300" },
  { status: "SIGNED_OFF", label: "Signed Off", bgClass: "bg-green-50", textClass: "text-green-700", borderClass: "border-green-200" },
  { status: "FINALISED", label: "Finalised", bgClass: "bg-emerald-50", textClass: "text-emerald-800", borderClass: "border-emerald-300" },
  { status: "DISPUTED", label: "Disputed", bgClass: "bg-red-50", textClass: "text-red-700", borderClass: "border-red-200" },
  { status: "EXCLUDED", label: "Excluded", bgClass: "bg-slate-100", textClass: "text-slate-500", borderClass: "border-slate-300" },
  { status: "INCOMPLETE", label: "Incomplete", bgClass: "bg-yellow-50", textClass: "text-yellow-700", borderClass: "border-yellow-300" },
];

describe("AppraisalStatusBadge", () => {
  it.each(STATUS_EXPECTED)(
    "renders $status with label '$label' and correct CSS classes",
    ({ status, label, bgClass, textClass, borderClass }) => {
      render(<AppraisalStatusBadge status={status} />);

      const badge = screen.getByText(label);
      expect(badge).toBeInTheDocument();
      expect(badge.className).toContain(bgClass);
      expect(badge.className).toContain(textClass);
      expect(badge.className).toContain(borderClass);
    },
  );

  it("renders all 10 statuses", () => {
    expect(STATUS_EXPECTED).toHaveLength(10);
  });
});
