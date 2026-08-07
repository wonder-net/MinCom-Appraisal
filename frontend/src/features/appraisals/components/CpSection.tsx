/**
 * CpSection — Editable Career Plans section for the growth plan form.
 * Limited to 3 ranked entries with used-rank disabling.
 */

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { CareerPlan, CareerPlanPriority } from "@/types";
import { sortByPriority } from "@/utils/growth-plan-helpers";

interface CpSectionProps {
  entries: CareerPlan[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onUpdateField: (id: string, field: keyof CareerPlan, value: string) => void;
}

const PRIORITY_OPTIONS: { value: CareerPlanPriority; label: string }[] = [
  { value: "FIRST", label: "1st" },
  { value: "SECOND", label: "2nd" },
  { value: "THIRD", label: "3rd" },
];

export function CpSection({
  entries,
  onAdd,
  onRemove,
  onUpdateField,
}: CpSectionProps) {
  const usedPriorities = new Set(entries.map((e) => e.priority).filter(Boolean));

  return (
    <Card className="shadow-sm">
      <CardHeader className="bg-gradient-to-r from-primary-light to-white border-b border-gray-200 px-6 py-4">
        <CardTitle className="text-lg font-semibold text-gray-900">
          Career Plans
        </CardTitle>
      </CardHeader>
      <CardContent className="px-6 py-6 space-y-3">
        {sortByPriority(entries).map((entry, index) => (
          <div key={entry.id} className="flex items-start gap-3">
            <Select
              value={entry.priority}
              onChange={(e) => onUpdateField(entry.id, "priority", e.target.value)}
              aria-label={`Priority for career plan ${index + 1}`}
              className="w-28 shrink-0"
            >
              {PRIORITY_OPTIONS.map((opt) => (
                <option
                  key={opt.value}
                  value={opt.value}
                  disabled={usedPriorities.has(opt.value) && entry.priority !== opt.value}
                >
                  {opt.label}
                </option>
              ))}
            </Select>
            <Input
              value={entry.aspired_role}
              onChange={(e) => onUpdateField(entry.id, "aspired_role", e.target.value)}
              placeholder="Aspired role..."
              className="flex-1"
              aria-label={`Aspired role ${index + 1}`}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onRemove(entry.id)}
              aria-label={`Remove career plan ${index + 1}`}
              className="text-red-700 hover:bg-red-50"
            >
              &times;
            </Button>
          </div>
        ))}
        {entries.length < PRIORITY_OPTIONS.length && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onAdd}
            className="mt-2 text-primary border-primary"
          >
            + Add Career Plan
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
