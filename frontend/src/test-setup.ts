/**
 * Vitest global test setup.
 * Extends matchers with jest-dom for DOM assertions.
 */
import "@testing-library/jest-dom/vitest";

/**
 * Polyfill ResizeObserver for Radix UI components (e.g. Checkbox)
 * that rely on it in their internal size tracking hooks.
 */
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe(): void { /* noop */ }
    unobserve(): void { /* noop */ }
    disconnect(): void { /* noop */ }
  };
}
