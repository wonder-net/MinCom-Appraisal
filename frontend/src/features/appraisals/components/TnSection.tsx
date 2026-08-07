/**
 * TnSection — Editable Training Needs section for the growth plan form.
 *
 * Split into two sub-sections matching the appraisal spreadsheet:
 * 1. "Training Needs on the Job" — up to 4 ranked entries (ON_THE_JOB)
 * 2. "Recommended Training (next 12 months)" — up to 3 ranked entries
 *    (RECOMMENDED_COURSE) with an institution/location field.
 */

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { TrainingNeed, TrainingNeedPriority, TrainingNeedType } from "@/types";
import { sortByPriority } from "@/utils/growth-plan-helpers";

interface TnSectionProps {
  entries: TrainingNeed[];
  onAdd: (type: TrainingNeedType) => void;
  onRemove: (id: string) => void;
  onUpdateField: (id: string, field: keyof TrainingNeed, value: string) => void;
}

const OTJ_PRIORITIES: { value: TrainingNeedPriority; label: string }[] = [
  { value: "FIRST", label: "1st" },
  { value: "SECOND", label: "2nd" },
  { value: "THIRD", label: "3rd" },
  { value: "FOURTH", label: "4th" },
];

const REC_PRIORITIES: { value: TrainingNeedPriority; label: string }[] = [
  { value: "FIRST", label: "1st" },
  { value: "SECOND", label: "2nd" },
  { value: "THIRD", label: "3rd" },
];

export function TnSection({
  entries,
  onAdd,
  onRemove,
  onUpdateField,
}: TnSectionProps) {
  const otjEntries = sortByPriority(entries.filter((e) => e.type === "ON_THE_JOB"));
  const recEntries = sortByPriority(entries.filter((e) => e.type === "RECOMMENDED_COURSE"));

  const otjUsed = new Set(otjEntries.map((e) => e.priority).filter(Boolean));
  const recUsed = new Set(recEntries.map((e) => e.priority).filter(Boolean));

  return (
    <div className="space-y-4">
      {/* On the Job Training */}
      <Card className="shadow-sm">
        <CardHeader className="bg-gradient-to-r from-primary-light to-white border-b border-gray-200 px-6 py-4">
          <CardTitle className="text-lg font-semibold text-gray-900">
            Training Needs on the Job
          </CardTitle>
        </CardHeader>
        <CardContent className="px-6 py-6 space-y-3">
          {otjEntries.map((entry, index) => (
            <div key={entry.id} className="flex items-start gap-3">
              <Select
                value={entry.priority}
                onChange={(e) => onUpdateField(entry.id, "priority", e.target.value)}
                aria-label={`Priority for on-the-job training ${index + 1}`}
                className="w-28 shrink-0"
              >
                {OTJ_PRIORITIES.map((opt) => (
                  <option
                    key={opt.value}
                    value={opt.value}
                    disabled={otjUsed.has(opt.value) && entry.priority !== opt.value}
                  >
                    {opt.label}
                  </option>
                ))}
              </Select>
              <Input
                value={entry.description}
                onChange={(e) => onUpdateField(entry.id, "description", e.target.value)}
                placeholder="Training need description..."
                className="flex-1"
                aria-label={`On-the-job training description ${index + 1}`}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onRemove(entry.id)}
                aria-label={`Remove on-the-job training ${index + 1}`}
                className="text-red-700 hover:bg-red-50"
              >
                &times;
              </Button>
            </div>
          ))}
          {otjEntries.length < OTJ_PRIORITIES.length && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onAdd("ON_THE_JOB")}
              className="mt-2 text-primary border-primary"
            >
              + Add On-the-Job Training
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Recommended Courses */}
      <Card className="shadow-sm">
        <CardHeader className="bg-gradient-to-r from-primary-light to-white border-b border-gray-200 px-6 py-4">
          <CardTitle className="text-lg font-semibold text-gray-900">
            Recommended Training (Next 12 Months)
          </CardTitle>
        </CardHeader>
        <CardContent className="px-6 py-6 space-y-3">
          {recEntries.map((entry, index) => (
            <div key={entry.id} className="flex items-start gap-3">
              <Select
                value={entry.priority}
                onChange={(e) => onUpdateField(entry.id, "priority", e.target.value)}
                aria-label={`Priority for recommended training ${index + 1}`}
                className="w-28 shrink-0"
              >
                {REC_PRIORITIES.map((opt) => (
                  <option
                    key={opt.value}
                    value={opt.value}
                    disabled={recUsed.has(opt.value) && entry.priority !== opt.value}
                  >
                    {opt.label}
                  </option>
                ))}
              </Select>
              <Input
                value={entry.description}
                onChange={(e) => onUpdateField(entry.id, "description", e.target.value)}
                placeholder="Course title / description..."
                className="flex-1"
                aria-label={`Recommended training description ${index + 1}`}
              />
              <Input
                value={entry.institution ?? ""}
                onChange={(e) => onUpdateField(entry.id, "institution", e.target.value)}
                placeholder="Institution / Location"
                className="w-48 shrink-0"
                aria-label={`Institution for recommended training ${index + 1}`}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onRemove(entry.id)}
                aria-label={`Remove recommended training ${index + 1}`}
                className="text-red-700 hover:bg-red-50"
              >
                &times;
              </Button>
            </div>
          ))}
          {recEntries.length < REC_PRIORITIES.length && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onAdd("RECOMMENDED_COURSE")}
              className="mt-2 text-primary border-primary"
            >
              + Add Recommended Training
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
