/**
 * Admin feature module for the MINCOM Appraisal Platform.
 *
 * This module contains:
 * - User management (create, update, activate/deactivate)
 * - Appraisal cycle management (create, activate, close, archive)
 * - Competency template configuration
 * - System settings and configuration
 * - Audit log viewer (append-only, HR Admin access only)
 *
 * Role requirements: HR Admin for full access, HR Director for
 * cycle management within assigned departments.
 *
 * Core API endpoints:
 * - CRUD /api/v1/admin/users/
 * - CRUD /api/v1/appraisals/cycles/
 * - CRUD /api/v1/admin/competencies/
 * - GET /api/v1/audit/logs/
 */

export { AdminUsers } from "./pages/AdminUsers";
export { AdminCycles } from "./pages/AdminCycles";
export { AdminCompetencies } from "./pages/AdminCompetencies";
export { BulkImportResultsPage } from "./pages/BulkImportResultsPage";
