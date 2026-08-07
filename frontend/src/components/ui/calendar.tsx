/**
 * Calendar — styled wrapper around react-day-picker v9 DayPicker.
 *
 * Used inside DateRangePicker. Applies project design-system
 * colors via the classNames prop (no CSS imports needed).
 */

import * as React from "react";
import { DayPicker } from "react-day-picker";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/utils/cn";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

export function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3 w-full", className)}
      classNames={{
        months: "flex flex-col",
        month: "space-y-3",
        month_caption:
          "flex items-center justify-between px-1 mb-1",
        caption_label: "text-sm font-semibold text-gray-900",
        nav: "flex items-center gap-1",
        button_previous:
          "h-7 w-7 rounded-md border border-gray-200 bg-white flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-1 disabled:opacity-40 disabled:cursor-not-allowed",
        button_next:
          "h-7 w-7 rounded-md border border-gray-200 bg-white flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-1 disabled:opacity-40 disabled:cursor-not-allowed",
        month_grid: "w-full border-collapse",
        weekdays: "grid grid-cols-7",
        weekday:
          "text-xs font-medium text-gray-400 text-center pb-1",
        week: "grid grid-cols-7",
        day: "h-8 w-8 mx-auto rounded-md text-sm text-gray-700 flex items-center justify-center cursor-pointer hover:bg-primary-light hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary",
        day_button: "w-full h-full",
        selected:
          "bg-primary text-white rounded-md hover:bg-primary",
        range_start:
          "bg-primary text-white rounded-l-md rounded-r-none hover:bg-primary",
        range_end:
          "bg-primary text-white rounded-r-md rounded-l-none hover:bg-primary",
        range_middle: "bg-primary-light text-primary rounded-none",
        today:
          "font-semibold text-secondary underline underline-offset-2",
        outside: "text-gray-300",
        disabled:
          "text-gray-300 cursor-not-allowed pointer-events-none",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === "left" ? (
            <ChevronLeft className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          ),
      }}
      {...props}
    />
  );
}
