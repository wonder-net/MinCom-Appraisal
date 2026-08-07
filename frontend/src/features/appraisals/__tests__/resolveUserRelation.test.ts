import { describe, it, expect } from "vitest";
import { resolveUserRelation } from "../utils/resolveUserRelation";

const APPRAISAL = {
  employee_id: "emp-1",
  appraiser_id: "mgr-1",
  escalated_executive: null,
};

const ESCALATED_APPRAISAL = {
  employee_id: "emp-1",
  appraiser_id: "mgr-1",
  escalated_executive: "u-exec",
};

describe("resolveUserRelation", () => {
  it("returns NONE when user is null", () => {
    expect(resolveUserRelation(null, APPRAISAL)).toBe("NONE");
  });

  it("returns NONE when appraisal is null", () => {
    expect(
      resolveUserRelation(
        { id: "u-1", employee_id: "emp-1", roles: ["EMPLOYEE"] },
        null,
      ),
    ).toBe("NONE");
  });

  it("returns APPRAISEE when user is the employee", () => {
    expect(
      resolveUserRelation(
        { id: "u-1", employee_id: "emp-1", roles: ["EMPLOYEE"] },
        APPRAISAL,
      ),
    ).toBe("APPRAISEE");
  });

  it("returns APPRAISER when user is FK manager with MANAGER role", () => {
    expect(
      resolveUserRelation(
        { id: "u-mgr", employee_id: "mgr-1", roles: ["MANAGER"] },
        APPRAISAL,
      ),
    ).toBe("APPRAISER");
  });

  it("returns APPRAISER when user is FK manager with HR_ADMIN role", () => {
    expect(
      resolveUserRelation(
        { id: "u-mgr", employee_id: "mgr-1", roles: ["HR_ADMIN"] },
        APPRAISAL,
      ),
    ).toBe("APPRAISER");
  });

  it("returns APPRAISER when user is FK manager with EXECUTIVE+MANAGER roles", () => {
    expect(
      resolveUserRelation(
        { id: "u-mgr", employee_id: "mgr-1", roles: ["EXECUTIVE", "MANAGER"] },
        APPRAISAL,
      ),
    ).toBe("APPRAISER");
  });

  it("returns NONE for EXECUTIVE-only user who is FK manager", () => {
    expect(
      resolveUserRelation(
        { id: "u-mgr", employee_id: "mgr-1", roles: ["EXECUTIVE"] },
        APPRAISAL,
      ),
    ).toBe("NONE");
  });

  it("returns HR_ADMIN when user has HR_ADMIN role but is not the FK manager", () => {
    expect(
      resolveUserRelation(
        { id: "u-hr", employee_id: "other-1", roles: ["HR_ADMIN"] },
        APPRAISAL,
      ),
    ).toBe("HR_ADMIN");
  });

  it("returns NONE for unrelated user with no matching role", () => {
    expect(
      resolveUserRelation(
        { id: "u-x", employee_id: "other-1", roles: ["EMPLOYEE"] },
        APPRAISAL,
      ),
    ).toBe("NONE");
  });

  it("returns NONE for EXECUTIVE-only user who is not the FK manager", () => {
    expect(
      resolveUserRelation(
        { id: "u-x", employee_id: "other-1", roles: ["EXECUTIVE"] },
        APPRAISAL,
      ),
    ).toBe("NONE");
  });

  // --- Escalation cases (TASK-273) ---

  it("returns APPRAISER for escalated executive with EXECUTIVE role", () => {
    expect(
      resolveUserRelation(
        { id: "u-exec", employee_id: "exec-emp", roles: ["EXECUTIVE"] },
        ESCALATED_APPRAISAL,
      ),
    ).toBe("APPRAISER");
  });

  it("returns APPRAISER for escalated executive who also has MANAGER role", () => {
    expect(
      resolveUserRelation(
        { id: "u-exec", employee_id: "exec-emp", roles: ["MANAGER"] },
        ESCALATED_APPRAISAL,
      ),
    ).toBe("APPRAISER");
  });

  it("returns NONE for escalated executive user lacking EXECUTIVE/MANAGER/HR_ADMIN role", () => {
    // Defence-in-depth: even if the User PK matches escalated_executive, an
    // EMPLOYEE-only user should never be granted write rights.
    expect(
      resolveUserRelation(
        { id: "u-exec", employee_id: "exec-emp", roles: ["EMPLOYEE"] },
        ESCALATED_APPRAISAL,
      ),
    ).toBe("NONE");
  });

  it("returns NONE for the ORIGINAL manager when the appraisal is escalated", () => {
    // Key regression case — original manager must not see editable controls
    // after escalation, because the backend will 403 their writes.
    expect(
      resolveUserRelation(
        { id: "u-mgr", employee_id: "mgr-1", roles: ["MANAGER"] },
        ESCALATED_APPRAISAL,
      ),
    ).toBe("NONE");
  });

  it("returns APPRAISEE for the appraisee even on an escalated appraisal", () => {
    expect(
      resolveUserRelation(
        { id: "u-emp", employee_id: "emp-1", roles: ["EMPLOYEE"] },
        ESCALATED_APPRAISAL,
      ),
    ).toBe("APPRAISEE");
  });

  it("returns HR_ADMIN for HR_ADMIN user who is not the escalated executive", () => {
    expect(
      resolveUserRelation(
        { id: "u-hr", employee_id: "hr-emp", roles: ["HR_ADMIN"] },
        ESCALATED_APPRAISAL,
      ),
    ).toBe("HR_ADMIN");
  });
});
