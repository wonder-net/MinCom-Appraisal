/**
 * TrainingNeedsSection — Displays training needs grouped by priority
 * with an accordion UI and a recommended courses table.
 */

import { useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { GraduationCap } from "lucide-react";
import { useTrainingNeeds } from "../hooks/useTrainingNeeds";
import type { TrainingNeedGroup, RecommendedCourse } from "@/api/reports";

type PriorityKey = "FIRST" | "SECOND" | "THIRD";

const PRIORITY_LABELS: Record<PriorityKey, string> = {
  FIRST: "Priority 1",
  SECOND: "Priority 2",
  THIRD: "Priority 3",
};

interface PriorityGroup {
  key: PriorityKey;
  label: string;
  count: number;
  descriptions: string[];
}

function toPriorityGroups(groups: TrainingNeedGroup[]): PriorityGroup[] {
  return groups.map((g) => ({
    key: g.priority,
    label: PRIORITY_LABELS[g.priority],
    count: g.count,
    descriptions: g.descriptions,
  }));
}

function TrainingNeedsSkeleton() {
  return (
    <div className="animate-pulse space-y-3 p-6" aria-busy="true" aria-label="Loading training needs">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

interface CoursesTableProps {
  courses: RecommendedCourse[];
}

function CoursesTable({ courses }: CoursesTableProps) {
  if (courses.length === 0) {
    return (
      <p className="text-sm text-gray-500 text-center py-6">
        No recommended courses.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" aria-label="Recommended courses">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left">
            <th className="px-6 py-3 font-semibold text-gray-900">Title</th>
            <th className="px-6 py-3 font-semibold text-gray-900">Institution</th>
            <th className="px-6 py-3 font-semibold text-gray-900">Priority</th>
          </tr>
        </thead>
        <tbody>
          {courses.map((course, i) => (
            <tr
              key={`${course.title}-${course.institution}-${i}`}
              className={`border-b border-gray-200 last:border-0 ${i % 2 === 1 ? "bg-gray-50" : "bg-white"}`}
            >
              <td className="px-6 py-3 text-gray-900">{course.title}</td>
              <td className="px-6 py-3 text-gray-500">{course.institution}</td>
              <td className="px-6 py-3 text-gray-500">{course.priority}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface TrainingNeedsSectionProps {
  cycleId?: string;
}

export function TrainingNeedsSection({ cycleId }: TrainingNeedsSectionProps) {
  const { data, isLoading, error, retry } = useTrainingNeeds(cycleId);

  const groups = useMemo(
    () => (data ? toPriorityGroups(data.training_needs) : []),
    [data],
  );

  const isEmpty = data !== null && groups.every((g) => g.count === 0);

  return (
    <section aria-label="Identified training needs">
      <Card className="shadow-sm">
        <CardHeader className="bg-gradient-to-r from-primary-light to-white border-b border-gray-200 px-6 py-4">
          <CardTitle className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-secondary" aria-hidden="true" />
            Identified Training Needs
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {/* Error state */}
          {error && (
            <div className="m-6 rounded-md border border-red-200 bg-red-50 px-6 py-4" role="alert">
              <p className="text-sm text-red-800">{error}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={retry}>
                Retry
              </Button>
            </div>
          )}

          {/* Loading state */}
          {isLoading && <TrainingNeedsSkeleton />}

          {/* Empty state */}
          {!isLoading && isEmpty && (
            <div
              className="flex flex-col items-center justify-center py-16 text-center"
              aria-live="polite"
            >
              <GraduationCap className="h-12 w-12 text-gray-400 mb-3" aria-hidden="true" />
              <p className="text-base font-medium text-gray-500">
                No training needs recorded for the active cycle.
              </p>
            </div>
          )}

          {/* Priority groups accordion */}
          {!isLoading && !isEmpty && data && (
            <div className="px-6 py-4">
              <Accordion type="multiple">
                {groups.map((group) => (
                  <AccordionItem key={group.key} value={group.key}>
                    <AccordionTrigger className="text-sm font-medium text-gray-900">
                      {group.label} &mdash; {group.count} {group.count === 1 ? "need" : "needs"}
                    </AccordionTrigger>
                    <AccordionContent>
                      {group.count === 0 ? (
                        <p className="text-sm text-gray-500">No needs in this priority.</p>
                      ) : (
                        <ul className="space-y-2 pl-4" role="list">
                          {group.descriptions.map((desc, i) => (
                            <li key={i} className="text-sm text-gray-900 list-disc">
                              {desc}
                            </li>
                          ))}
                        </ul>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          )}

          {/* Recommended Courses */}
          {!isLoading && !isEmpty && data && (
            <div className="border-t border-gray-200">
              <div className="px-6 py-4">
                <h3 className="text-base font-semibold text-gray-900 mb-4">
                  Recommended Courses
                </h3>
              </div>
              <CoursesTable courses={data.recommended_courses} />
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
