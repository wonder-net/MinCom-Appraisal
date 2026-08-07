/**
 * DepartmentTable — renders department summary rows with completion
 * rate colour coding. Rows are clickable and keyboard-navigable
 * for the TASK-084 drill-down panel.
 */

import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import type { DepartmentSummary } from "@/types";

interface DepartmentTableProps {
  departments: DepartmentSummary[];
  onSelectDepartment?: (departmentId: string) => void;
}

export function DepartmentTable({
  departments,
  onSelectDepartment,
}: DepartmentTableProps) {
  const handleRowAction = (departmentId: string) => {
    onSelectDepartment?.(departmentId);
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLTableRowElement>,
    departmentId: string,
  ) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleRowAction(departmentId);
    }
  };

  return (
    <section aria-label="Appraisals by department">
      <Card className="shadow-sm">
        <CardHeader className="bg-gradient-to-r from-primary-light to-white border-b border-gray-200 px-6 py-4">
          <CardTitle className="text-lg font-semibold text-gray-900">
            By Department
          </CardTitle>
          <p className="text-sm text-gray-500 mt-0.5">
            Click a department row to drill down into its appraisals.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {departments.length === 0 ? (
            <p className="text-center text-sm text-gray-500 py-10">
              No department data available.
            </p>
          ) : (
            <table
              className="w-full text-sm"
              aria-label="Department breakdown table"
            >
              <thead>
                <tr className="text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100 bg-gray-50">
                  <th
                    scope="col"
                    className="px-4 py-2 text-left font-semibold"
                  >
                    Department
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-2 text-right font-semibold"
                  >
                    Employees
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-2 text-right font-semibold"
                  >
                    Completion Rate
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-2 text-right font-semibold hidden md:table-cell"
                  >
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {departments.map((dept, i) => (
                  <tr
                    key={dept.department_id}
                    className={`cursor-pointer hover:bg-blue-50 transition-colors ${
                      i % 2 === 1 ? "bg-gray-50" : "bg-white"
                    }`}
                    tabIndex={0}
                    role="button"
                    aria-label={`View ${dept.department_name} appraisal drill-down`}
                    onClick={() => handleRowAction(dept.department_id)}
                    onKeyDown={(e) =>
                      handleKeyDown(e, dept.department_id)
                    }
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {dept.department_name}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500">
                      {dept.employee_count}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={
                          Number(dept.completion_rate) >= 70
                            ? "text-green-700 font-semibold"
                            : "text-amber-700 font-semibold"
                        }
                      >
                        {Number(dept.completion_rate).toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right hidden md:table-cell">
                      <span className="text-secondary text-xs hover:underline">
                        View details &rarr;
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
