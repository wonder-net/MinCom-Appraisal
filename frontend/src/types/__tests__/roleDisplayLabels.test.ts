/**
 * Regression tests for ROLE_DISPLAY_LABELS.
 *
 * Stakeholder preference: "Appraisor" with -or, "Appraisee" with -ee.
 * This test pins the exact display-label mapping for the five platform roles.
 */

import { describe, it, expect } from "vitest";
import { ALL_ROLES, ROLE_DISPLAY_LABELS } from "@/types";

describe("ROLE_DISPLAY_LABELS", () => {
  it("maps EMPLOYEE to 'Appraisee'", () => {
    expect(ROLE_DISPLAY_LABELS.EMPLOYEE).toBe("Appraisee");
  });

  it("maps MANAGER to 'Appraisor' (stakeholder spelling, -or not -er)", () => {
    expect(ROLE_DISPLAY_LABELS.MANAGER).toBe("Appraisor");
  });

  it("maps HR_OFFICER to 'HR Director'", () => {
    expect(ROLE_DISPLAY_LABELS.HR_OFFICER).toBe("HR Director");
  });

  it("maps HR_ADMIN to 'HR Admin'", () => {
    expect(ROLE_DISPLAY_LABELS.HR_ADMIN).toBe("HR Admin");
  });

  it("maps SYSTEM_ADMIN to 'System Admin' (TASK-303)", () => {
    expect(ROLE_DISPLAY_LABELS.SYSTEM_ADMIN).toBe("System Admin");
  });

  it("maps EXECUTIVE to 'Executive'", () => {
    expect(ROLE_DISPLAY_LABELS.EXECUTIVE).toBe("Executive");
  });

  it("never uses the spelling 'Appraiser' with -er", () => {
    Object.values(ROLE_DISPLAY_LABELS).forEach((label) => {
      expect(label).not.toBe("Appraiser");
    });
  });

  it("has a display label for every role in ALL_ROLES", () => {
    ALL_ROLES.forEach((role) => {
      expect(ROLE_DISPLAY_LABELS[role]).toBeDefined();
      expect(typeof ROLE_DISPLAY_LABELS[role]).toBe("string");
      expect(ROLE_DISPLAY_LABELS[role].length).toBeGreaterThan(0);
    });
  });
});
