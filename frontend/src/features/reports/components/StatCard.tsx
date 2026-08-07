/**
 * StatCard — displays a single summary metric with optional accent colour.
 */

import { Card, CardContent } from "@/components/ui/card";

type Accent = "success" | "warning" | "error";

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  accent?: Accent;
}

const ACCENT_CLASSES: Record<Accent, string> = {
  error: "text-red-700",
  warning: "text-amber-700",
  success: "text-accent",
};

export function StatCard({ label, value, sub, accent }: StatCardProps) {
  const valueClass = accent
    ? ACCENT_CLASSES[accent]
    : "text-gray-900";

  return (
    <Card className="shadow-sm hover:shadow-md transition-shadow duration-150">
      <CardContent className="px-6 py-5">
        <p className="text-sm font-medium text-gray-500 mb-1">{label}</p>
        <p className={`text-3xl font-bold ${valueClass}`}>{value}</p>
        {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}
