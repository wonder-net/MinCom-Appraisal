/**
 * Combobox — Searchable dropdown with free-text entry.
 *
 * Built on the existing Popover component. Supports keyboard
 * navigation (ArrowDown/Up, Enter, Escape) and WCAG 2.1 AA ARIA
 * attributes (role="combobox", aria-expanded, aria-activedescendant).
 *
 * When the typed text does not match any option, the user can press
 * Enter or blur to use the typed value as-is (free-text mode).
 */

import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { ChevronDown } from "lucide-react";
import { cn } from "@/utils/cn";

export interface ComboboxOption {
  value: string;
  label: string;
}

export interface ComboboxProps {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  /** Fires with the raw input text as the user types (not the committed value). */
  onInputChange?: (text: string) => void;
  /** Display label when value is not in options (e.g. pre-populated manager name on edit). */
  displayValue?: string;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
}

function filterOptions(
  options: readonly ComboboxOption[],
  query: string,
): ComboboxOption[] {
  const lower = query.toLowerCase();
  return options.filter((opt) => opt.label.toLowerCase().includes(lower));
}

function findLabelByValue(
  options: readonly ComboboxOption[],
  value: string,
): string {
  const match = options.find((opt) => opt.value === value);
  return match ? match.label : (value ?? "");
}

export function Combobox({
  options,
  value,
  onChange,
  onInputChange,
  displayValue,
  placeholder = "Select or type\u2026",
  id,
  disabled = false,
  className,
}: ComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const resolveLabel = useCallback(
    (v: string) => {
      if (!v) return "";
      const fromOptions = findLabelByValue(options, v);
      // If findLabelByValue returns the raw value (no match), use displayValue instead
      return fromOptions !== v ? fromOptions : (displayValue ?? v);
    },
    [options, displayValue],
  );

  const [inputText, setInputText] = useState(() => resolveLabel(value ?? ""));
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = id ? `${id}-listbox` : "combobox-listbox";

  // Sync inputText when the controlled value changes externally
  // (e.g. EditUserDialog pre-populating fields). Skip while the
  // dropdown is open so we don't clobber the user's typing.
  useEffect(() => {
    if (!isOpen) {
      setInputText(resolveLabel(value ?? ""));
    }
  }, [value, options, displayValue, isOpen, resolveLabel]);

  const filtered = useMemo(
    () => (inputText ? filterOptions(options, inputText) : options),
    [options, inputText],
  );

  const noMatch = (inputText ?? "").length > 0 && filtered.length === 0;

  const selectOption = useCallback(
    (opt: ComboboxOption) => {
      onChange(opt.value);
      setInputText(opt.label);
      setIsOpen(false);
      setHighlightedIndex(-1);
    },
    [onChange],
  );

  const commitFreeText = useCallback(() => {
    const trimmed = (inputText ?? "").trim();
    // If typed text matches an option label, commit the option's value (e.g. UUID)
    const match = options.find(
      (opt) => opt.label.toLowerCase() === trimmed.toLowerCase(),
    );
    onChange(match ? match.value : trimmed);
    setIsOpen(false);
    setHighlightedIndex(-1);
  }, [inputText, onChange, options]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const text = e.target.value;
      setInputText(text);
      setHighlightedIndex(-1);
      if (!isOpen) setIsOpen(true);
      onInputChange?.(text);
    },
    [isOpen, onInputChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
          return;
        }
        setHighlightedIndex((prev) =>
          prev < filtered.length - 1 ? prev + 1 : 0,
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (!isOpen) return;
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : filtered.length - 1,
        );
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < filtered.length) {
          selectOption(filtered[highlightedIndex]);
        } else {
          commitFreeText();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    },
    [isOpen, filtered, highlightedIndex, selectOption, commitFreeText],
  );

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      // Delay to allow click on option to register first
      const relatedTarget = e.relatedTarget as HTMLElement | null;
      if (relatedTarget?.closest("[data-combobox-list]")) return;
      setTimeout(() => {
        if (!inputRef.current?.matches(":focus")) {
          commitFreeText();
        }
      }, 150);
    },
    [commitFreeText],
  );

  const handleFocus = useCallback(() => {
    if (!disabled) setIsOpen(true);
  }, [disabled]);

  const highlightedOptionId =
    highlightedIndex >= 0 ? `${id ?? "combobox"}-option-${highlightedIndex}` : undefined;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <div className={cn("relative", className)}>
          <Input
            ref={inputRef}
            id={id}
            role="combobox"
            aria-expanded={isOpen}
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-activedescendant={highlightedOptionId}
            placeholder={placeholder}
            disabled={disabled}
            value={inputText}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            onFocus={handleFocus}
            className={cn(
              "pr-8 transition-all duration-150",
              disabled && "bg-gray-50 text-gray-400 cursor-not-allowed",
            )}
          />
          <ChevronDown
            className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none"
            aria-hidden="true"
          />
        </div>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={4}
        className="p-0 w-[var(--radix-popover-trigger-width)] max-h-56 overflow-y-auto"
        onOpenAutoFocus={(e) => e.preventDefault()}
        data-combobox-list
      >
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Options"
          className="py-1"
        >
          {filtered.map((opt, idx) => (
            <li
              key={opt.value}
              id={`${id ?? "combobox"}-option-${idx}`}
              role="option"
              aria-selected={opt.value === value}
              className={cn(
                "px-3 py-2 text-sm cursor-pointer select-none transition-colors duration-150",
                idx === highlightedIndex
                  ? "bg-primary-light text-primary font-medium"
                  : "text-gray-900 hover:bg-gray-50",
                opt.value === value && "font-semibold",
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                selectOption(opt);
              }}
              onMouseEnter={() => setHighlightedIndex(idx)}
            >
              {opt.label}
            </li>
          ))}

          {noMatch && (
            <li
              role="option"
              aria-selected={false}
              className="px-3 py-2 text-sm text-gray-500 italic select-none cursor-pointer"
              onMouseDown={(e) => {
                e.preventDefault();
                commitFreeText();
              }}
            >
              No matches &mdash; press Enter to use &ldquo;{inputText}&rdquo;
            </li>
          )}

          {options.length === 0 && !inputText && (
            <li className="px-3 py-2 text-sm text-gray-400 select-none">
              Start typing to search&hellip;
            </li>
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
