/**
 * Unit tests for the admin-tier role helpers (TASK-303).
 *
 * `isAdminUser` is the single source of truth for "does this user have
 * platform-admin privileges?" — both HR_ADMIN and SYSTEM_ADMIN qualify.
 */

import { describe, it, expect } from "vitest";
import { isAdminUser } from "../role-helpers";
import type { User, UserRole } from "../types";

const buildUser = (roles: UserRole[]): User => ({
  id: "u-1",
  email: "user@mincom.com",
  roles,
  is_mfa_enabled: false,
  employee_id: null,
  must_change_password: false,
});

describe("isAdminUser", () => {
  it("returns false when the user is null", () => {
    expect(isAdminUser(null)).toBe(false);
  });

  it("returns true for HR_ADMIN", () => {
    expect(isAdminUser(buildUser(["HR_ADMIN"]))).toBe(true);
  });

  it("returns true for SYSTEM_ADMIN", () => {
    expect(isAdminUser(buildUser(["SYSTEM_ADMIN"]))).toBe(true);
  });

  it("returns true when both admin-tier roles are assigned", () => {
    expect(isAdminUser(buildUser(["HR_ADMIN", "SYSTEM_ADMIN"]))).toBe(true);
  });

  it("returns true when an admin-tier role is mixed with non-admin roles", () => {
    expect(
      isAdminUser(buildUser(["EMPLOYEE", "MANAGER", "SYSTEM_ADMIN"])),
    ).toBe(true);
  });

  it("returns false for non-admin role combinations", () => {
    expect(isAdminUser(buildUser(["EMPLOYEE"]))).toBe(false);
    expect(isAdminUser(buildUser(["MANAGER"]))).toBe(false);
    expect(isAdminUser(buildUser(["HR_OFFICER"]))).toBe(false);
    expect(isAdminUser(buildUser(["EXECUTIVE"]))).toBe(false);
    expect(isAdminUser(buildUser(["MANAGER", "HR_OFFICER", "EXECUTIVE"])))
      .toBe(false);
  });

  it("returns false for an empty roles array", () => {
    expect(isAdminUser(buildUser([]))).toBe(false);
  });
});
