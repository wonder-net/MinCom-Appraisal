/**
 * Unit tests for HelpSearch — verifies that typing into the input
 * propagates the query upward only after the 150 ms debounce window,
 * and that clearing the input bypasses the debounce and propagates
 * the empty query synchronously (so search results clear immediately).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { HelpSearch } from "../HelpSearch";

describe("HelpSearch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces query updates to 150 ms", () => {
    const onQueryChange = vi.fn();
    render(<HelpSearch query="" onQueryChange={onQueryChange} />);

    const input = screen.getByRole("searchbox", {
      name: /search help articles/i,
    }) as HTMLInputElement;

    fireEvent.change(input, { target: { value: "self" } });

    // Before the debounce expires, no upward call yet.
    expect(onQueryChange).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(149);
    });
    expect(onQueryChange).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onQueryChange).toHaveBeenCalledWith("self");
  });

  it("clearing the input flushes an empty query upward immediately", () => {
    const onQueryChange = vi.fn();
    render(
      <HelpSearch query="self assessment" onQueryChange={onQueryChange} />,
    );

    const input = screen.getByRole("searchbox", {
      name: /search help articles/i,
    }) as HTMLInputElement;

    expect(input.value).toBe("self assessment");

    fireEvent.change(input, { target: { value: "" } });

    // Clear bypasses the 150 ms debounce — propagated immediately.
    expect(onQueryChange).toHaveBeenCalledWith("");
    expect(onQueryChange).toHaveBeenCalledTimes(1);
  });

  it("does not fire onQueryChange when value matches the parent query", () => {
    const onQueryChange = vi.fn();
    render(<HelpSearch query="logging" onQueryChange={onQueryChange} />);

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(onQueryChange).not.toHaveBeenCalled();
  });
});
