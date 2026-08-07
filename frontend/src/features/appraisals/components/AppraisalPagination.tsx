/**
 * AppraisalPagination — Page size selector, prev/next navigation,
 * and "Showing X-Y of Z" display for the appraisal list.
 */

import { useMemo } from "react";
import { Button } from "@/components/ui/button";

interface AppraisalPaginationProps {
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

const PAGE_SIZES = [10, 25, 50] as const;

export function AppraisalPagination({
  page,
  pageSize,
  totalCount,
  onPageChange,
  onPageSizeChange,
}: AppraisalPaginationProps) {
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(totalCount / pageSize)),
    [totalCount, pageSize],
  );

  const showingStart = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingEnd = Math.min(page * pageSize, totalCount);

  return (
    <nav
      aria-label="Appraisals pagination"
      className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50 text-sm text-gray-600"
    >
      <span>
        Showing {showingStart}&ndash;{showingEnd} of {totalCount} appraisals
      </span>
      <div className="flex items-center gap-2">
        <select
          aria-label="Rows per page"
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="h-8 rounded border border-gray-300 px-2 text-sm"
        >
          {PAGE_SIZES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
          aria-label="Previous page"
        >
          &#8249;
        </Button>
        <span className="text-xs text-gray-500" aria-current="page">
          {page} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          &#8250;
        </Button>
      </div>
    </nav>
  );
}
