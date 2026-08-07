/**
 * Core TypeScript type definitions for the MINCOM Appraisal Platform.
 *
 * This module contains shared interfaces used across the application,
 * including API response envelopes, pagination metadata, and base
 * entity types.
 *
 * Auth-related types are defined in @/auth/types.ts and re-exported
 * from @/auth/index.ts. They are NOT re-exported here to avoid
 * circular dependencies (the auth module imports ApiResponse from here).
 *
 * NOTE: Interface properties use snake_case (e.g., `cycle_period_name`,
 * `employee_name`) to match the API response shapes returned by the
 * Django REST Framework backend. This avoids an unnecessary mapping
 * layer between API responses and TypeScript types.
 */

/**
 * Pagination metadata returned by list endpoints.
 * Used with offset-based pagination (cursor-based pagination
 * for audit logs will be defined separately).
 */
export interface PaginationMeta {
  count: number;
  next: string | null;
  previous: string | null;
}

/**
 * Standard API response envelope.
 *
 * All backend endpoints return responses in this shape:
 * ```json
 * {
 *   "status": "success" | "error",
 *   "data": { ... },
 *   "meta": { "pagination": { ... } }
 * }
 * ```
 */
export interface ApiResponse<T> {
  status: "success" | "error";
  data: T;
  meta?: {
    pagination?: PaginationMeta;
  };
}

/**
 * Return type for paginated API service functions after the
 * response interceptor has unwrapped the standard envelope.
 *
 * Mirrors the envelope shape minus the `status` field, so hooks
 * that consume paginated data can still access `.data` and
 * `.meta.pagination` without changes.
 */
export interface PaginatedResponse<T> {
  data: T;
  meta?: {
    pagination?: PaginationMeta;
  };
}

/**
 * Standard API error response body returned by the backend
 * when a request fails validation or encounters an error.
 */
export interface ApiErrorResponse {
  status: "error";
  data: {
    message: string;
    errors?: Record<string, string[]>;
  };
}

/**
 * All possible appraisal workflow statuses.
 */
export type AppraisalStatus =
  | "SELF_ASSESSMENT"
  | "MANAGER_REVIEW"
  | "DISCUSSION"
  | "GROWTH_PLANNING"
  | "PENDING_SIGNOFF"
  | "SIGNED_OFF"
  | "FINALISED"
  | "DISPUTED"
  | "EXCLUDED"
  | "INCOMPLETE";

/**
 * Form type discriminator: managerial vs non-managerial.
 */
export type FormType = "FORM_A" | "FORM_B";

/**
 * BSC perspective identifiers for key deliverables.
 */
export type BscPerspective =
  | "FINANCIAL"
  | "CUSTOMER"
  | "INTERNAL_BUSINESS_PROCESSES"
  | "LEARNING_AND_GROWTH";

/**
 * Appraisal cycle status discriminator.
 */
export type CycleStatus = "DRAFT" | "ACTIVE" | "CLOSED";

/**
 * Appraisal cycle returned by list/detail endpoints.
 */
export interface AppraisalCycle {
  id: string;
  period_name: string;
  start_date: string;
  end_date: string;
  status: CycleStatus;
  self_rating_enabled: boolean;
  is_active: boolean;
  created_by: string | null;
  config_snapshot: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

/**
 * Payload for creating a new appraisal cycle.
 */
export interface CreateCyclePayload {
  period_name: string;
  start_date: string;
  end_date: string;
  self_rating_enabled?: boolean;
}

/**
 * Payload for updating an existing appraisal cycle (partial).
 */
export type UpdateCyclePayload = Partial<CreateCyclePayload>;

/**
 * Appraisal list item returned by GET /api/v1/appraisals/.
 */
export interface Appraisal {
  id: string;
  cycle_id: string;
  cycle_period_name: string;
  employee_id: string;
  employee_name: string;
  employee_job_title: string;
  department: string;
  /**
   * "Directorate / Department" display label — falls back to `department`
   * alone when the department has no parent directorate configured.
   */
  department_full_label?: string;
  /** Absolute URL to the employee's profile picture, or null if unset. */
  employee_photo_url?: string | null;
  form_type: FormType;
  status: AppraisalStatus;
  total_score: string | null;
  performance_descriptor: string | null;
  kd_average_score: string | null;
  kd_descriptor: string | null;
  bc_average_score: string | null;
  bc_descriptor: string | null;
  self_rating_enabled: boolean;
  status_changed_at: string | null;
  version: number;
  updated_at: string;
  appraiser_id: string | null;
  /**
   * UUID of the User assigned as the escalated executive appraisor, or null
   * when the appraisal has not been escalated. Set by HR Admin via the
   * escalate / re-assign endpoints. See TASK-268.
   */
  escalated_executive: string | null;
  /**
   * Verbatim reason text entered by HR Admin at first escalation, or null
   * when the appraisal has not been escalated. Immutable after first set —
   * not overwritten on re-assignment.
   */
  escalation_reason: string | null;
  /**
   * Monotonic counter incremented each time the appraisal enters
   * PENDING_SIGNOFF. Starts at 0; becomes 1 on first PENDING_SIGNOFF
   * entry. Paired with `Signature.signing_round` so the UI can detect
   * which signatures belong to the current sign-off session without
   * relying on timestamp comparisons. See TASK-276b.
   */
  signing_round: number;
  signatures?: Signature[];
}

/**
 * Key Deliverable nested in the appraisal detail response.
 */
export interface KeyDeliverable {
  id: string;
  appraisal: string;
  perspective: BscPerspective;
  perspective_name: string;
  perspective_weight_cap: string | null;
  perspective_max_kd_count: number | null;
  description: string;
  weight: number;
  self_rating: number | null;
  manager_rating: number | null;
  weighted_score: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/**
 * Competency Rating nested in the appraisal detail response.
 */
export interface CompetencyRating {
  id: string;
  appraisal: string;
  competency: string;
  competency_name: string;
  competency_applicable_to: string;
  competency_is_core: boolean;
  competency_sort_order: number;
  /**
   * Descriptive sub-competencies shown under this core value's name —
   * informational only, not separately rated (the rating applies to the
   * whole core value).
   */
  sub_competencies?: string[] | null;
  self_rating: number | null;
  manager_rating: number | null;
  created_at: string;
  updated_at: string;
}

/**
 * Parameters for the appraisal list endpoint.
 */
export interface AppraisalListParams {
  cycle_id?: string;
  status?: AppraisalStatus;
  search?: string;
  page?: number;
  page_size?: number;
  ordering?: string;
}

/**
 * Paginated list response for appraisals.
 */
export interface PaginatedAppraisalList {
  count: number;
  next: string | null;
  previous: string | null;
  results: Appraisal[];
}

/**
 * Body for POST /api/v1/appraisals/:id/transition/.
 */
export interface TransitionRequest {
  to_status: AppraisalStatus;
  version: number;
}

/**
 * Body for creating a key deliverable.
 */
export interface CreateKeyDeliverableRequest {
  perspective: BscPerspective;
  description: string;
  weight: number;
  self_rating?: number | null;
  manager_rating?: number | null;
}

/**
 * Body for updating a key deliverable.
 */
export interface UpdateKeyDeliverableRequest {
  description?: string;
  weight?: number;
  self_rating?: number | null;
  manager_rating?: number | null;
}

/**
 * Body for updating a competency rating.
 */
export interface UpdateCompetencyRatingRequest {
  self_rating?: number | null;
  manager_rating?: number | null;
}

/**
 * Author role for appraisal comments.
 */
export type CommentAuthorRole = "APPRAISER" | "APPRAISEE";

/**
 * Comment on an appraisal, returned by the comments endpoint.
 */
export interface Comment {
  id: string;
  appraisal_id: string;
  author_id: string;
  author_name: string;
  author_role: CommentAuthorRole;
  content: string;
  created_at: string;
}

/**
 * Request body for creating a comment.
 */
export interface CreateCommentRequest {
  content: string;
}

/**
 * Action type for appraisal sign-off signatures.
 */
export type SignatureAction = "ACCEPT" | "REJECT" | "COMMENTS_ATTACHED";

/**
 * A signature record on an appraisal, returned by the sign-off endpoint.
 */
export interface Signature {
  id: string;
  signer_id: string;
  signer_name: string;
  signer_role: string;
  action: SignatureAction;
  reason: string | null;
  signed_at: string;
  /**
   * The appraisal's `signing_round` at the moment this signature was
   * created. Used to scope `hasUserSigned` to the current sign-off
   * session; signatures from prior rounds remain in the audit trail
   * but do not block re-signing. See TASK-276b.
   */
  signing_round: number;
}

/**
 * Request body for POST /api/v1/appraisals/:id/sign/.
 */
export interface SubmitSignatureRequest {
  action: "ACCEPT" | "REJECT";
  reason?: string;
}

/**
 * Response from POST /api/v1/appraisals/:id/sign/.
 */
export interface SubmitSignatureResponse {
  appraisal_status: AppraisalStatus;
  signature: Signature;
}

/**
 * Terminal appraisal statuses where comments are read-only.
 */
export const TERMINAL_STATUSES: ReadonlySet<AppraisalStatus> = new Set([
  "SIGNED_OFF",
  "FINALISED",
  "EXCLUDED",
  "INCOMPLETE",
]);

/**
 * Strength/Weakness type discriminator.
 */
export type StrengthWeaknessType = "STRENGTH" | "WEAKNESS";

/**
 * Training need priority levels.
 */
export type TrainingNeedPriority = "FIRST" | "SECOND" | "THIRD" | "FOURTH";
export type TrainingNeedType = "ON_THE_JOB" | "RECOMMENDED_COURSE";

/**
 * Single strength or weakness entry within a growth plan.
 */
export interface StrengthWeakness {
  id: string;
  type: StrengthWeaknessType;
  description: string;
}

/**
 * Single training need entry within a growth plan.
 */
export interface TrainingNeed {
  id: string;
  type: TrainingNeedType;
  priority: TrainingNeedPriority;
  description: string;
  institution?: string;
}

/**
 * Single career plan entry within a growth plan.
 */
export type CareerPlanPriority = "FIRST" | "SECOND" | "THIRD";

export interface CareerPlan {
  id: string;
  aspired_role: string;
  priority: CareerPlanPriority;
}

/**
 * Single career plan development need entry within a growth plan.
 */
export type DevelopmentNeedPriority = "FIRST" | "SECOND" | "THIRD";

export interface DevelopmentNeed {
  id: string;
  description: string;
  priority: DevelopmentNeedPriority;
}

/**
 * Full growth plan returned by the API.
 */
export interface GrowthPlan {
  id: string;
  appraisal_id: string;
  overall_assessment: string;
  /** Shown on the appraisal report just before the Signatures section. */
  promotion_recommendation: string;
  strengths_weaknesses: StrengthWeakness[];
  training_needs: TrainingNeed[];
  career_plans: CareerPlan[];
  development_needs: DevelopmentNeed[];
  created_at: string;
  updated_at: string;
}

/**
 * Write payload for creating or updating a growth plan.
 * Omits server-generated fields (id, timestamps).
 * Nested entries omit their id for creation.
 */
export interface GrowthPlanPayload {
  overall_assessment: string;
  promotion_recommendation: string;
  strengths_weaknesses: Omit<StrengthWeakness, "id">[];
  training_needs: Omit<TrainingNeed, "id">[];
  career_plans: Omit<CareerPlan, "id">[];
  development_needs: Omit<DevelopmentNeed, "id">[];
}

/**
 * Statuses at which the growth plan is visible.
 */
export const GROWTH_PLAN_VISIBLE_STATUSES: ReadonlySet<AppraisalStatus> = new Set([
  "GROWTH_PLANNING",
  "PENDING_SIGNOFF",
  "SIGNED_OFF",
  "FINALISED",
  "DISPUTED",
]);

/**
 * All available user roles in the platform.
 *
 * Order is meaningful for UI rendering (e.g. the role dropdown). HR-tier
 * roles are grouped: HR_OFFICER → HR_ADMIN → SYSTEM_ADMIN → EXECUTIVE.
 * SYSTEM_ADMIN sits adjacent to HR_ADMIN because it carries identical
 * admin-tier access (TASK-303).
 */
export const ALL_ROLES = [
  "EMPLOYEE",
  "MANAGER",
  "HR_OFFICER",
  "HR_ADMIN",
  "SYSTEM_ADMIN",
  "EXECUTIVE",
] as const;

/**
 * A role value as used in admin user management.
 */
export type AdminRole = (typeof ALL_ROLES)[number];

/**
 * Human-readable display labels for each user role.
 *
 * Use this wherever a role value is rendered to a user. Internal enum values
 * ("EMPLOYEE", "MANAGER", ...) are NOT changed — this is a display-only mapping.
 *
 * Note: the stakeholder spelling is "Appraisor" with -or (not "Appraiser" with -er).
 */
export const ROLE_DISPLAY_LABELS: Record<AdminRole, string> = {
  EMPLOYEE: "Appraisee",
  MANAGER: "Appraisor",
  HR_OFFICER: "HR Director",
  HR_ADMIN: "HR Admin",
  SYSTEM_ADMIN: "System Admin",
  EXECUTIVE: "Executive",
};

/**
 * Employee classification discriminator for admin user management.
 */
export type EmployeeClassification = "MANAGERIAL" | "NON_MANAGERIAL";

/**
 * Admin user record returned by the admin users endpoint.
 */
export interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  roles: AdminRole[];
  is_active: boolean;
  mfa_enabled: boolean;
  last_login: string | null;
  employee_id: string | null;
  employee_name: string | null;
  employee_number: string | null;
  job_title: string | null;
  job_family: string | null;
  department_id: string | null;
  department_name: string | null;
  location: string | null;
  classification: EmployeeClassification | null;
  manager_id: string | null;
  manager_name: string | null;
  /** Optional second reporting line (HR change request #3). */
  matrix_appraiser_id: string | null;
  matrix_appraiser_name: string | null;
  must_change_password: boolean;
  is_locked: boolean;
}

/**
 * Paginated list response for admin users.
 */
export interface PaginatedAdminUserList {
  count: number;
  next: string | null;
  previous: string | null;
  results: AdminUser[];
}

/**
 * Request body for POST /api/v1/admin/users/.
 *
 * For departments: send `department_id` (UUID) to reference an existing
 * department, or `department_name` (string) to auto-create a new one.
 * If both are provided, `department_id` takes precedence on the backend.
 */
export interface CreateUserPayload {
  email: string;
  full_name: string;
  roles: AdminRole[];
  employee_number?: string;
  job_title?: string;
  job_family?: string;
  department_id?: string;
  department_name?: string;
  location?: string;
  classification?: EmployeeClassification;
  manager_id?: string | null;
  /** Optional second reporting line (HR change request #3). */
  matrix_appraiser_id?: string | null;
}

/**
 * Request body for PATCH /api/v1/admin/users/{id}/.
 *
 * For departments: send `department_id` (UUID) to reference an existing
 * department, or `department_name` (string) to auto-create a new one.
 * If both are provided, `department_id` takes precedence on the backend.
 */
export interface UpdateUserPayload {
  full_name?: string;
  roles?: AdminRole[];
  is_active?: boolean;
  employee_number?: string;
  job_title?: string;
  job_family?: string;
  department_id?: string;
  department_name?: string;
  location?: string;
  classification?: EmployeeClassification;
  manager_id?: string | null;
  /** Optional second reporting line (HR change request #3). */
  matrix_appraiser_id?: string | null;
}

/**
 * Dashboard report data returned by GET /api/v1/reports/dashboard/.
 */
export interface DashboardReport {
  cycle_id: string | null;
  cycle_name: string | null;
  total_employees: number;
  completion_rate: number;
  overdue_count: number;
  appraisals_by_status: Record<string, number>;
  departments: DepartmentSummary[];
}

/**
 * Department summary row within the dashboard report.
 */
export interface DepartmentSummary {
  department_id: string;
  department_name: string;
  employee_count: number;
  completion_rate: number;
}

/**
 * Detailed department report returned by GET /api/v1/reports/department/{dept_id}/.
 */
export interface DepartmentReport {
  department_id: string;
  department_name: string;
  employee_count: number;
  appraisals_by_status: Record<string, number>;
  avg_total_score: number | null;
  completion_rate: number;
}

/**
 * A single performance band row within the score distribution report.
 */
export interface BandRow {
  label: string;
  sort_order: number;
  count: number;
  percentage: number;
}

/**
 * Score distribution report returned by GET /api/v1/reports/score-distribution/.
 */
export interface ScoreDistributionReport {
  cycle_id: string | null;
  total: number;
  bands: BandRow[];
}

/**
 * In-app notification returned by the notifications API.
 */
export interface Notification {
  id: string;
  event_type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  appraisal: string | null;
  related_object_type: string;
  related_object_id: string | null;
}
