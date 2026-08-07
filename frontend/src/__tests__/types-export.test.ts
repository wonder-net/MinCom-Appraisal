/**
 * Tests that core TypeScript types are properly exported from
 * the types module. Since TypeScript interfaces are erased at
 * runtime, this test verifies exports by constructing objects
 * that conform to each interface and checking their structure.
 */

import { describe, it, expect } from "vitest";
import type { ApiResponse, PaginationMeta, ApiErrorResponse } from "@/types";

describe("Type exports from @/types", () => {
  it("PaginationMeta can be used to type a valid pagination object", () => {
    const pagination: PaginationMeta = {
      count: 42,
      next: "/api/v1/appraisals/?page=3",
      previous: "/api/v1/appraisals/?page=1",
    };

    expect(pagination.count).toBe(42);
    expect(pagination.next).toBe("/api/v1/appraisals/?page=3");
    expect(pagination.previous).toBe("/api/v1/appraisals/?page=1");
  });

  it("PaginationMeta allows null values for next and previous", () => {
    const pagination: PaginationMeta = {
      count: 0,
      next: null,
      previous: null,
    };

    expect(pagination.next).toBeNull();
    expect(pagination.previous).toBeNull();
  });

  it("ApiResponse can be used to type a successful response with data", () => {
    interface Employee {
      id: string;
      name: string;
    }

    const response: ApiResponse<Employee> = {
      status: "success",
      data: { id: "abc-123", name: "Jane Doe" },
    };

    expect(response.status).toBe("success");
    expect(response.data.id).toBe("abc-123");
    expect(response.data.name).toBe("Jane Doe");
    expect(response.meta).toBeUndefined();
  });

  it("ApiResponse can include pagination metadata", () => {
    const response: ApiResponse<string[]> = {
      status: "success",
      data: ["item-1", "item-2"],
      meta: {
        pagination: {
          count: 50,
          next: "/api/v1/items/?page=2",
          previous: null,
        },
      },
    };

    expect(response.meta?.pagination?.count).toBe(50);
    expect(response.meta?.pagination?.next).toBe("/api/v1/items/?page=2");
    expect(response.meta?.pagination?.previous).toBeNull();
  });

  it("ApiErrorResponse can be used to type an error response", () => {
    const errorResponse: ApiErrorResponse = {
      status: "error",
      data: {
        message: "Validation failed",
        errors: {
          weight: ["Weights must sum to 1.0"],
          self_rating: ["Rating must be between 1 and 5"],
        },
      },
    };

    expect(errorResponse.status).toBe("error");
    expect(errorResponse.data.message).toBe("Validation failed");
    expect(errorResponse.data.errors?.weight).toEqual([
      "Weights must sum to 1.0",
    ]);
    expect(errorResponse.data.errors?.self_rating).toEqual([
      "Rating must be between 1 and 5",
    ]);
  });
});
