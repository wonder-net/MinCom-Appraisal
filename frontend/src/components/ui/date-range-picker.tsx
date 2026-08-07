/**
 * DateRangePicker — Popover trigger + Calendar with range selection.
 *
 * Uses an internal draft range that is only committed to the parent
 * onChange when the user clicks Apply. Clear resets and closes.
 */

import { useState, useCallback, useMemo } from "react";
import { type DateRange } from "react-day-picker";
import { format, differenceInDays } from "date-fns";
import { CalendarIcon, X } from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/utils/cn";

interface DateRangePickerProps {
  value: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  align?: "start" | "center" | "end";
}

function formatRangeLabel(range: DateRange | undefined): string | null {
  if (!range?.from) return null;
  if (range.to) {
    return `${format(range.from, "dd MMM yyyy")} \u2013 ${format(range.to, "dd MMM yyyy")}`;
  }
  return `${format(range.from, "dd MMM yyyy")} \u2013 \u2026`;
}

function buildSummaryText(draft: DateRange | undefined): string {
  if (!draft?.from) return "No dates selected";
  if (!draft.to) return `From: ${format(draft.from, "dd MMM yyyy")}`;
  return `${differenceInDays(draft.to, draft.from) + 1} days selected`;
}

export function DateRangePicker({
  value,
  onChange,
  placeholder = "Filter by date range",
  disabled = false,
  className,
  align = "start",
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [draftRange, setDraftRange] = useState<DateRange | undefined>(
    value,
  );

  const formattedLabel = useMemo(() => formatRangeLabel(value), [value]);
  const summaryText = useMemo(
    () => buildSummaryText(draftRange),
    [draftRange],
  );

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        setDraftRange(value);
      }
      setOpen(nextOpen);
    },
    [value],
  );

  const handleApply = useCallback(() => {
    onChange(draftRange);
    setOpen(false);
  }, [draftRange, onChange]);

  const handleClear = useCallback(() => {
    setDraftRange(undefined);
    onChange(undefined);
    setOpen(false);
  }, [onChange]);

  const handleClearTrigger = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      onChange(undefined);
    },
    [onChange],
  );

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={
            formattedLabel
              ? `Date range: ${formattedLabel}`
              : "Select date range"
          }
          aria-expanded={open}
          aria-haspopup="dialog"
          disabled={disabled}
          className={cn(
            "inline-flex h-10 items-center gap-2 rounded-md border border-gray-200 bg-white px-3 text-sm transition-colors hover:bg-gray-50",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "min-w-[220px]",
            open && "border-secondary ring-2 ring-secondary ring-offset-0",
            className,
          )}
        >
          <CalendarIcon
            className={cn(
              "h-4 w-4 shrink-0",
              value?.from ? "text-primary" : "text-gray-400",
            )}
            aria-hidden="true"
          />
          <span
            className={cn(
              "flex-1 truncate text-left",
              formattedLabel
                ? "text-gray-900 font-medium"
                : "text-gray-400",
            )}
          >
            {formattedLabel ?? placeholder}
          </span>
          {value?.from && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Clear date range"
              className="ml-1 rounded hover:bg-gray-100 p-0.5"
              onClick={handleClearTrigger}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleClearTrigger(
                    e as unknown as React.MouseEvent,
                  );
                }
              }}
            >
              <X className="h-3.5 w-3.5 text-gray-400 hover:text-gray-700" />
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align={align}
        sideOffset={6}
        className="p-0 w-auto shadow-lg border-gray-200"
        aria-label="Date range picker"
      >
        <Calendar
          mode="range"
          selected={draftRange}
          onSelect={setDraftRange}
          disabled={{ after: new Date() }}
        />

        <div className="border-t border-gray-100">
          <div className="flex items-center justify-between gap-2 px-3 py-2">
            <span
              aria-live="polite"
              className="text-xs text-gray-500 truncate"
            >
              {summaryText}
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                aria-label="Clear date range filter"
                onClick={handleClear}
              >
                Clear
              </Button>
              <Button
                variant="default"
                size="sm"
                aria-label="Apply date range filter"
                onClick={handleApply}
              >
                Apply
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
