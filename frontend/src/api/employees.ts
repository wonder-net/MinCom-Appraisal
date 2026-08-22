/**
 * API service functions for employee endpoints.
 *
 * All functions use the centralised apiClient with JWT interceptors.
 * The response interceptor automatically unwraps the standard
 * { status, data, meta } envelope.
 */

import { apiClient } from "./client";
import type { PaginatedResponse } from "@/types";

/**
 * Nested user account detail returned on employee detail responses.
 */
export interface EmployeeUserDetail {
  email: string;
  is_active: boolean;
  roles: string[];
  is_mfa_enabled: boolean;
}

/**
 * Employee record returned by the employees API.
 */
export interface Employee {
  id: string;
  employee_number: string;
  name: string;
  job_title: string;
  department: string;
  department_name?: string;
  department_detail?: {
    id: string;
    name: string;
    code: string;
    /** Parent department id (the "Directorate"), if configured. */
    parent?: string | null;
    /** "Directorate / Department", or just the department name if no parent. */
    full_label?: string;
  };
  /** Same "Directorate / Department" label, top-level for convenience. */
  department_full_label?: string;
  job_family: string;
  location: string;
  classification: string;
  classification_display: string;
  manager?: string | null;
  manager_name?: string | null;
  /** Optional second reporting line ("matrix" appraiser). */
  matrix_appraiser?: string | null;
  matrix_appraiser_name?: string | null;
  /** Absolute URL to the employee's profile picture, or null if unset. */
  photo_url?: string | null;
  user_detail?: EmployeeUserDetail;
}

/**
 * Parameters for the employee list endpoint.
 */
export interface EmployeeListParams {
  search?: string;
  page?: number;
  page_size?: number;
}

/**
 * List employees with optional search and pagination.
 * GET /api/v1/employees/
 */
export async function listEmployees(
  params?: EmployeeListParams,
): Promise<PaginatedResponse<Employee[]>> {
  const cleanParams: Record<string, string | number> = {};
  if (params?.search && params.search.length > 0) {
    cleanParams.search = params.search;
  }
  if (params?.page !== undefined) {
    cleanParams.page = params.page;
  }
  if (params?.page_size !== undefined) {
    cleanParams.page_size = params.page_size;
  }

  const response = await apiClient.get<Employee[]>("employees/", {
    params: cleanParams,
  });
  return { data: response.data, meta: response.meta };
}

/**
 * Fetch a single employee by ID.
 * GET /api/v1/employees/{id}/
 */
export async function getEmployee(id: string): Promise<Employee> {
  const response = await apiClient.get<Employee>(`employees/${id}/`);
  return response.data;
}

/**
 * Fetch direct reports for an employee.
 * GET /api/v1/employees/{id}/direct-reports/
 */
export async function getDirectReports(id: string): Promise<Employee[]> {
  const response = await apiClient.get<Employee[]>(
    `employees/${id}/direct-reports/`,
  );
  return response.data;
}

/**
 * Upload (or replace) the current user's own profile picture.
 * POST /api/v1/employees/me/photo/ (multipart/form-data)
 */
export async function uploadMyPhoto(file: File): Promise<Employee> {
  const formData = new FormData();
  formData.append("photo", file);
  const response = await apiClient.post<Employee>(
    "employees/me/photo/",
    formData,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return response.data;
}

/**
 * Remove the current user's own profile picture, if one is set.
 * DELETE /api/v1/employees/me/photo/
 */
export async function deleteMyPhoto(): Promise<Employee> {
  const response = await apiClient.delete<Employee>("employees/me/photo/");
  return response.data;
}

/**
 * Department lookup item from the departments endpoint.
 */
export interface DepartmentLookup {
  id: string;
  name: string;
}

/**
 * List all departments for lookup/combobox usage.
 * GET /api/v1/employees/departments/
 */
export async function listDepartments(): Promise<DepartmentLookup[]> {
  const response = await apiClient.get<DepartmentLookup[]>(
    "employees/departments/",
  );
  return response.data;
}

/**
 * List all locations for lookup/combobox usage.
 * GET /api/v1/employees/locations/
 */
export async function listLocations(): Promise<string[]> {
  const response = await apiClient.get<string[]>("employees/locations/");
  return response.data;
}

/**
 * List all job families for lookup/combobox usage.
 * GET /api/v1/employees/job-families/
 */
export async function listJobFamilies(): Promise<string[]> {
  const response = await apiClient.get<string[]>("employees/job-families/");
  return response.data;
}

/**
 * List employees for the manager search combobox.
 * GET /api/v1/employees/?search=...&page_size=50
 */
export async function listEmployeesForManager(
  search?: string,
): Promise<Employee[]> {
  const response = await listEmployees({
    search,
    page_size: 50,
  });
  return response.data;
}
