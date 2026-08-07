/**
 * HelpSearch — debounced search input for the Help Center sidebar.
 *
 * Owns its own immediate input value (`raw`) so typing feels responsive,
 * and propagates changes to the parent's debounced query via `onQueryChange`
 * after a 150 ms idle window. Clearing the input (`raw === ""`) bypasses the
 * debounce and propagates immediately so the accordion restores without delay.
 *
 * The flat search-result list is rendered by `HelpToc` (which already knows
 * how to render both the accordion and the result list); this component is
 * the input only. That keeps debounce + result-rendering responsibilities
 * separated.
 */

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

const DEBOUNCE_MS = 150;

export interface HelpSearchProps {
  /** Current debounced query (controlled — kept in parent so HelpToc can read it). */
  query: string;
  /** Called with the debounced query string after the user stops typing. */
  onQueryChange: (next: string) => void;
}

export function HelpSearch({ query, onQueryChange }: HelpSearchProps) {
  const [raw, setRaw] = useState<string>(query);

  // Keep the local input in sync if the parent resets the query (e.g. after
  // a navigation that should clear search). One-way reconciliation only.
  useEffect(() => {
    setRaw((prev) => (prev === query ? prev : query));
  }, [query]);

  // Debounce propagation of `raw` upward — but flush immediately on clear.
  useEffect(() => {
    if (raw === query) return;
    if (raw === "") {
      onQueryChange("");
      return;
    }
    const id = window.setTimeout(() => onQueryChange(raw), DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [raw, query, onQueryChange]);

  return (
    <div className="px-4 pt-4 pb-3 border-b border-[#DEE2E6]">
      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#ADB5BD] pointer-events-none"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="Search help articles..."
          aria-label="Search help articles"
          className="h-9 pl-9 pr-3 text-sm placeholder:text-[#ADB5BD]"
        />
      </div>
    </div>
  );
}
