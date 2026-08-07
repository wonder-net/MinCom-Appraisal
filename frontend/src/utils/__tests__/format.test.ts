/**
 * Unit tests for formatScore, scoreColour, and formatCompletionRate.
 *
 * Covers DRF DecimalField string coercion, null/undefined handling,
 * and divide-by-zero guards.
 */

import { describe, it, expect } from "vitest";
import { formatScore, scoreColour, formatCompletionRate } from "../format";

describe("formatScore", () => {
  it('returns em-dash for null', () => {
    expect(formatScore(null)).toBe("\u2014");
  });

  it('returns em-dash for undefined', () => {
    expect(formatScore(undefined)).toBe("\u2014");
  });

  it('formats string "3.50" as "3.50"', () => {
    expect(formatScore("3.50")).toBe("3.50");
  });

  it('formats number 4 as "4.00"', () => {
    expect(formatScore(4)).toBe("4.00");
  });

  it('formats string "2" as "2.00"', () => {
    expect(formatScore("2")).toBe("2.00");
  });

  it('formats number 3.456 as "3.46" (rounds)', () => {
    expect(formatScore(3.456)).toBe("3.46");
  });

  it('formats string "0" as "0.00"', () => {
    expect(formatScore("0")).toBe("0.00");
  });
});

describe("scoreColour", () => {
  it('returns "text-gray-400" for null', () => {
    expect(scoreColour(null)).toBe("text-gray-400");
  });

  it('returns "text-gray-400" for undefined', () => {
    expect(scoreColour(undefined)).toBe("text-gray-400");
  });

  it('returns "text-red-600" for score <= 2', () => {
    expect(scoreColour(2)).toBe("text-red-600");
    expect(scoreColour("1")).toBe("text-red-600");
    expect(scoreColour(0)).toBe("text-red-600");
  });

  it('returns "text-amber-600" for score === 3', () => {
    expect(scoreColour(3)).toBe("text-amber-600");
    expect(scoreColour("3")).toBe("text-amber-600");
  });

  it('returns "text-green-600" for score >= 4', () => {
    expect(scoreColour(4)).toBe("text-green-600");
    expect(scoreColour("5")).toBe("text-green-600");
    expect(scoreColour(4.5)).toBe("text-green-600");
  });

  it('returns "text-amber-600" for scores between 2 and 4 exclusive', () => {
    expect(scoreColour(2.5)).toBe("text-amber-600");
    expect(scoreColour("3.99")).toBe("text-amber-600");
  });
});

describe("formatCompletionRate", () => {
  it('returns "0.0%" when total is 0 (divide-by-zero guard)', () => {
    expect(formatCompletionRate(0, 0)).toBe("0.0%");
  });

  it("computes correct percentage", () => {
    expect(formatCompletionRate(7, 10)).toBe("70.0%");
  });

  it("rounds to 1 decimal place", () => {
    expect(formatCompletionRate(1, 3)).toBe("33.3%");
  });

  it("handles 100% completion", () => {
    expect(formatCompletionRate(10, 10)).toBe("100.0%");
  });
});
