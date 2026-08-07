/**
 * EmployeeProfileFields — Shared fieldset for employee profile data.
 *
 * Used by both AddUserDialog and EditUserDialog. Renders employee
 * number, job title, department (Combobox), location (Combobox),
 * classification (native Select), and manager (Combobox) fields.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Select } from "@/components/ui/select";
import { listEmployeesForManager, type Employee } from "@/api/employees";
import type { DepartmentLookup } from "@/api/employees";
import type { EmployeeClassification } from "@/types";
import type { FormErrors } from "../utils/validate-user-form";

interface EmployeeProfileFieldsProps {
  employeeNumber: string;
  jobTitle: string;
  jobFamily: string;
  departmentId: string;
  location: string;
  classification: EmployeeClassification | "";
  managerId: string;
  /** Pre-existing manager display name for edit mode pre-population */
  managerName?: string;
  /** Optional second reporting line (HR change request #3). */
  matrixAppraiserId: string;
  /** Pre-existing matrix appraiser display name for edit mode pre-population */
  matrixAppraiserName?: string;
  departments: DepartmentLookup[];
  locations: string[];
  jobFamilies: string[];
  isLookupsLoading: boolean;
  /** When true, renders a fallback message instead of the department Combobox */
  isDepartmentsError?: boolean;
  errors: FormErrors;
  employeeNumberReadOnly?: boolean;
  onFieldChange: (field: string, value: string) => void;
}

function useManagerSearch() {
  const [managerSearch, setManagerSearch] = useState("");
  const [managers, setManagers] = useState<Employee[]>([]);
  const [managerLabel, setManagerLabel] = useState("");

  useEffect(() => {
    if (!managerSearch || managerSearch.length < 2) {
      setManagers([]);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const results = await listEmployeesForManager(managerSearch);
        if (!cancelled) setManagers(results);
      } catch {
        if (!cancelled) setManagers([]);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [managerSearch]);

  return {
    managers,
    managerSearch,
    setManagerSearch,
    managerLabel,
    setManagerLabel,
  };
}

function FieldError({ id, message }: { id: string; message: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-sm text-red-700 mt-1">
      {message}
    </p>
  );
}

export function EmployeeProfileFields({
  employeeNumber,
  jobTitle,
  jobFamily,
  departmentId,
  location,
  classification,
  managerId,
  managerName,
  matrixAppraiserId,
  matrixAppraiserName,
  departments,
  locations,
  jobFamilies,
  isLookupsLoading,
  isDepartmentsError = false,
  errors,
  employeeNumberReadOnly = false,
  onFieldChange,
}: EmployeeProfileFieldsProps) {
  const { managers, setManagerSearch, managerLabel, setManagerLabel } =
    useManagerSearch();
  // Same hook, independent instance — HR change request #3's second
  // reporting line uses the exact same debounced-search pattern as
  // Manager above, just against its own field.
  const {
    managers: matrixAppraiserCandidates,
    setManagerSearch: setMatrixAppraiserSearch,
    managerLabel: matrixAppraiserLabel,
    setManagerLabel: setMatrixAppraiserLabel,
  } = useManagerSearch();

  // Sync manager label from prop when it changes (edit mode switching users)
  useEffect(() => {
    setManagerLabel(managerName ?? "");
  }, [managerName, setManagerLabel]);

  useEffect(() => {
    setMatrixAppraiserLabel(matrixAppraiserName ?? "");
  }, [matrixAppraiserName, setMatrixAppraiserLabel]);

  const departmentOptions: ComboboxOption[] = useMemo(
    () => departments.map((d) => ({ value: d.id, label: d.name })),
    [departments],
  );

  const locationOptions: ComboboxOption[] = useMemo(
    () => locations.map((l) => ({ value: l, label: l })),
    [locations],
  );

  const jobFamilyOptions: ComboboxOption[] = useMemo(
    () => jobFamilies.map((jf) => ({ value: jf, label: jf })),
    [jobFamilies],
  );

  const managerOptions: ComboboxOption[] = useMemo(
    () =>
      managers.map((m) => ({
        value: m.id,
        label: `${m.name}${m.department_name ? ` (${m.department_name}` : ""}${m.employee_number ? `, ${m.employee_number})` : m.department_name ? ")" : ""}`,
      })),
    [managers],
  );

  const handleManagerChange = useCallback(
    (value: string) => {
      onFieldChange("managerId", value);
      const matched = managerOptions.find((m) => m.value === value);
      setManagerLabel(matched ? matched.label : value);
    },
    [managerOptions, onFieldChange, setManagerLabel],
  );

  const matrixAppraiserOptions: ComboboxOption[] = useMemo(
    () =>
      matrixAppraiserCandidates.map((m) => ({
        value: m.id,
        label: `${m.name}${m.department_name ? ` (${m.department_name}` : ""}${m.employee_number ? `, ${m.employee_number})` : m.department_name ? ")" : ""}`,
      })),
    [matrixAppraiserCandidates],
  );

  const handleMatrixAppraiserChange = useCallback(
    (value: string) => {
      onFieldChange("matrixAppraiserId", value);
      const matched = matrixAppraiserOptions.find((m) => m.value === value);
      setMatrixAppraiserLabel(matched ? matched.label : value);
    },
    [matrixAppraiserOptions, onFieldChange, setMatrixAppraiserLabel],
  );

  return (
    <fieldset className="space-y-4">
      <legend className="text-sm font-semibold text-primary uppercase tracking-wide pb-2 border-b border-gray-200 w-full">
        Employee Profile
        <span className="ml-2 text-xs font-normal text-gray-500 normal-case tracking-normal">
          Fill in Employee Number to activate required fields
        </span>
      </legend>

      {/* Employee Number + Job Title */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="employee-number"
            className="block text-sm font-medium text-gray-900 mb-1"
          >
            Employee number{" "}
            <span className="text-red-700" aria-hidden="true">
              *
            </span>
          </label>
          <Input
            id="employee-number"
            placeholder="e.g. EMP-00147"
            value={employeeNumber}
            onChange={(e) => onFieldChange("employeeNumber", e.target.value)}
            readOnly={employeeNumberReadOnly}
            aria-required="true"
            aria-describedby={
              errors.employeeNumber ? "employee-number-error" : undefined
            }
            className={
              employeeNumberReadOnly
                ? "bg-gray-50 text-gray-500 cursor-default"
                : errors.employeeNumber
                  ? "border-red-300"
                  : ""
            }
          />
          <FieldError
            id="employee-number-error"
            message={errors.employeeNumber}
          />
        </div>

        <div>
          <label
            htmlFor="job-title"
            className="block text-sm font-medium text-gray-900 mb-1"
          >
            Job title{" "}
            <span className="text-red-700" aria-hidden="true">
              *
            </span>
          </label>
          <Input
            id="job-title"
            placeholder="e.g. Senior Credit Analyst"
            value={jobTitle}
            onChange={(e) => onFieldChange("jobTitle", e.target.value)}
            aria-required="true"
            aria-describedby={errors.jobTitle ? "job-title-error" : undefined}
            className={errors.jobTitle ? "border-red-300" : ""}
          />
          <FieldError id="job-title-error" message={errors.jobTitle} />
        </div>
      </div>

      {/* Job Family */}
      <div>
        <label
          htmlFor="job-family"
          className="block text-sm font-medium text-gray-900 mb-1"
        >
          Job Family
        </label>
        {isLookupsLoading ? (
          <div className="h-10 rounded-md bg-gray-200 animate-pulse" aria-busy="true" />
        ) : (
          <Combobox
            id="job-family"
            placeholder="Select or type job family…"
            options={jobFamilyOptions}
            value={jobFamily}
            onChange={(v) => onFieldChange("jobFamily", v)}
          />
        )}
      </div>

      {/* Department + Location */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="department"
            className="block text-sm font-medium text-gray-900 mb-1"
          >
            Department{" "}
            <span className="text-red-700" aria-hidden="true">
              *
            </span>
          </label>
          {isLookupsLoading ? (
            <div
              className="h-10 rounded-md bg-gray-200 animate-pulse"
              aria-busy="true"
            />
          ) : isDepartmentsError ? (
            <p role="alert" className="text-sm text-red-700 mt-1">
              Could not load departments. Please try again.
            </p>
          ) : (
            <Combobox
              id="department"
              placeholder="Select or type department&#8230;"
              options={departmentOptions}
              value={departmentId}
              onChange={(v) => onFieldChange("departmentId", v)}
              className={
                errors.departmentId ? "[&_input]:border-red-300" : ""
              }
            />
          )}
          <FieldError id="department-error" message={errors.departmentId} />
        </div>

        <div>
          <label
            htmlFor="location"
            className="block text-sm font-medium text-gray-900 mb-1"
          >
            Location
          </label>
          {isLookupsLoading ? (
            <div
              className="h-10 rounded-md bg-gray-200 animate-pulse"
              aria-busy="true"
            />
          ) : (
            <Combobox
              id="location"
              placeholder="Select or type location&#8230;"
              options={locationOptions}
              value={location}
              onChange={(v) => onFieldChange("location", v)}
            />
          )}
          <FieldError id="location-error" message={errors.location} />
        </div>
      </div>

      {/* Classification + Manager */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="classification"
            className="block text-sm font-medium text-gray-900 mb-1"
          >
            Classification{" "}
            <span className="text-red-700" aria-hidden="true">
              *
            </span>
          </label>
          <Select
            id="classification"
            aria-label="Select classification"
            placeholder="Select classification&#8230;"
            value={classification}
            onChange={(e) => onFieldChange("classification", e.target.value)}
            className={
              errors.classification
                ? "border-red-300 focus:ring-2 focus:ring-secondary"
                : "focus:ring-2 focus:ring-secondary"
            }
          >
            <option value="MANAGERIAL">Managerial</option>
            <option value="NON_MANAGERIAL">Non-Managerial</option>
          </Select>
          <FieldError
            id="classification-error"
            message={errors.classification}
          />
        </div>

        <div>
          <label
            htmlFor="manager"
            className="block text-sm font-medium text-gray-900 mb-1"
          >
            Manager
          </label>
          <Combobox
            id="manager"
            placeholder="Search by employee number or email&#8230;"
            options={managerOptions}
            value={managerId}
            displayValue={managerName}
            onChange={handleManagerChange}
            onInputChange={setManagerSearch}
          />
          {managerLabel && managerId && (
            <p className="text-xs text-gray-500 mt-1">
              Selected: {managerLabel}
            </p>
          )}
          {!managerId && (
            <p className="text-xs text-gray-500 mt-1">
              Type to search employees. Leave blank if no direct manager.
            </p>
          )}
          <FieldError id="manager-error" message={errors.managerId} />
        </div>
      </div>

      {/* Matrix Appraiser (HR change request #3: optional second reporting line) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="matrix-appraiser"
            className="block text-sm font-medium text-gray-900 mb-1"
          >
            Matrix Appraiser
          </label>
          <Combobox
            id="matrix-appraiser"
            placeholder="Search by employee number or email&#8230;"
            options={matrixAppraiserOptions}
            value={matrixAppraiserId}
            displayValue={matrixAppraiserName}
            onChange={handleMatrixAppraiserChange}
            onInputChange={setMatrixAppraiserSearch}
          />
          {matrixAppraiserLabel && matrixAppraiserId && (
            <p className="text-xs text-gray-500 mt-1">
              Selected: {matrixAppraiserLabel}
            </p>
          )}
          {!matrixAppraiserId && (
            <p className="text-xs text-gray-500 mt-1">
              Optional second appraiser — the appraisal isn&rsquo;t finalized until
              both this employee&rsquo;s manager and matrix appraiser sign off.
            </p>
          )}
          <FieldError id="matrix-appraiser-error" message={errors.matrixAppraiserId} />
        </div>
      </div>
    </fieldset>
  );
}
