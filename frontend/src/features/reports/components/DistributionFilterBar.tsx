/**
 * DistributionFilterBar — Filter controls for the score distribution section.
 * Provides department, form type, and job family filter dropdowns.
 */

import { Select } from "@/components/ui/select";

interface DistributionFilterBarProps {
  departmentId: string;
  formType: string;
  jobFamily: string;
  departments: ReadonlyArray<{ id: string; name: string }>;
  onDepartmentChange: (value: string) => void;
  onFormTypeChange: (value: string) => void;
  onJobFamilyChange: (value: string) => void;
}

export function DistributionFilterBar({
  departmentId,
  formType,
  jobFamily,
  departments,
  onDepartmentChange,
  onFormTypeChange,
  onJobFamilyChange,
}: DistributionFilterBarProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <div className="w-full sm:w-48">
        <label htmlFor="dist-dept-filter" className="sr-only">
          Filter by department
        </label>
        <Select
          id="dist-dept-filter"
          data-testid="dist-department-filter"
          value={departmentId}
          onChange={(e) => onDepartmentChange(e.target.value)}
          aria-label="Filter by department"
        >
          <option value="">All Departments</option>
          {departments.map((dept) => (
            <option key={dept.id} value={dept.id}>
              {dept.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="w-full sm:w-40">
        <label htmlFor="dist-form-filter" className="sr-only">
          Filter by form type
        </label>
        <Select
          id="dist-form-filter"
          data-testid="dist-form-type-filter"
          value={formType}
          onChange={(e) => onFormTypeChange(e.target.value)}
          aria-label="Filter by form type"
        >
          <option value="">All Forms</option>
          <option value="FORM_A">Form A (Managerial)</option>
          <option value="FORM_B">Form B (Non-Managerial)</option>
        </Select>
      </div>
      <div className="w-full sm:w-48">
        <label htmlFor="dist-job-family-filter" className="sr-only">
          Filter by job family
        </label>
        <Select
          id="dist-job-family-filter"
          data-testid="dist-job-family-filter"
          value={jobFamily}
          onChange={(e) => onJobFamilyChange(e.target.value)}
          aria-label="Filter by job family"
        >
          <option value="">All Job Families</option>
        </Select>
      </div>
    </div>
  );
}
