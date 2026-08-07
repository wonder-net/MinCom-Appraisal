/**
 * SwSection — Editable Strengths & Weaknesses section for the growth plan form.
 */

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { StrengthWeakness, StrengthWeaknessType } from "@/types";

interface SwSectionProps {
  entries: StrengthWeakness[];
  onAdd: (type: StrengthWeaknessType) => void;
  onRemove: (id: string) => void;
  onUpdateType: (id: string, type: StrengthWeaknessType) => void;
  onUpdateDesc: (id: string, description: string) => void;
}

const MAX_PER_TYPE = 4;

export function SwSection({
  entries,
  onAdd,
  onRemove,
  onUpdateType,
  onUpdateDesc,
}: SwSectionProps) {
  const strengthCount = entries.filter((e) => e.type === "STRENGTH").length;
  const weaknessCount = entries.filter((e) => e.type === "WEAKNESS").length;

  return (
    <Card className="shadow-sm">
      <CardHeader className="bg-gradient-to-r from-primary-light to-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-gray-900">
            Strengths & Weaknesses
          </CardTitle>
          <span className="text-xs text-gray-500">
            Strengths: {strengthCount}/{MAX_PER_TYPE} &middot; Weaknesses: {weaknessCount}/{MAX_PER_TYPE}
          </span>
        </div>
      </CardHeader>
      <CardContent className="px-6 py-6 space-y-3">
        {entries.map((entry, index) => {
          // Disable switching to a type that's already at max
          const strengthFull = strengthCount >= MAX_PER_TYPE && entry.type !== "STRENGTH";
          const weaknessFull = weaknessCount >= MAX_PER_TYPE && entry.type !== "WEAKNESS";

          return (
            <div key={entry.id} className="flex items-start gap-3">
              <Select
                value={entry.type}
                onChange={(e) =>
                  onUpdateType(entry.id, e.target.value as StrengthWeaknessType)
                }
                aria-label={`Entry type for item ${index + 1}`}
                className="w-36 shrink-0"
              >
                <option value="STRENGTH" disabled={strengthFull}>Strength</option>
                <option value="WEAKNESS" disabled={weaknessFull}>Weakness</option>
              </Select>
              <Input
                value={entry.description}
                onChange={(e) => onUpdateDesc(entry.id, e.target.value)}
                placeholder="Describe this strength or weakness..."
                className="flex-1"
                aria-label={`Strength / Weakness description ${index + 1}`}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onRemove(entry.id)}
                aria-label={`Remove entry ${index + 1}`}
                className="text-red-700 hover:bg-red-50"
              >
                &times;
              </Button>
            </div>
          );
        })}
        <div className="flex gap-2 mt-2">
          {strengthCount < MAX_PER_TYPE && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onAdd("STRENGTH")}
              className="text-primary border-primary"
            >
              + Add Strength
            </Button>
          )}
          {weaknessCount < MAX_PER_TYPE && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onAdd("WEAKNESS")}
              className="text-primary border-primary"
            >
              + Add Weakness
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
