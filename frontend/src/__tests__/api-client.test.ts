/**
 * Tests that the centralised Axios client (apiClient) is importable
 * and configured with the correct defaults: base URL, timeout, and
 * Content-Type header.
 */

import { describe, it, expect } from "vitest";
import { apiClient } from "@/api";

describe("apiClient configuration", () => {
  it("is importable from the api module", () => {
    expect(apiClient).toBeDefined();
  });

  it('has baseURL set to "/api/v1/"', () => {
    expect(apiClient.defaults.baseURL).toBe("/api/v1/");
  });

  it("has timeout set to 30000 milliseconds", () => {
    expect(apiClient.defaults.timeout).toBe(30_000);
  });

  it('has Content-Type header set to "application/json"', () => {
    const contentType = apiClient.defaults.headers["Content-Type"];
    expect(contentType).toBe("application/json");
  });
});
