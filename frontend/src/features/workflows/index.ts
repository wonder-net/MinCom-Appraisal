/**
 * Workflows feature module for the MINCOM Appraisal Platform.
 *
 * This module will contain:
 * - Appraisal status tracking and visual state indicators
 * - Workflow transition actions (submit, review, approve, sign-off)
 * - Sign-off and dispute handling (accept/reject with reason)
 * - Discussion comment threads between appraiser and appraisee
 * - In-app notification display and management
 *
 * Implements the appraisal state machine:
 * SELF_ASSESSMENT -> MANAGER_REVIEW -> DISCUSSION ->
 * GROWTH_PLANNING -> PENDING_SIGNOFF -> SIGNED_OFF -> FINALISED
 * (with DISPUTED branch from PENDING_SIGNOFF back to DISCUSSION)
 *
 * Core API endpoints:
 * - POST /api/v1/appraisals/{id}/transition/
 * - POST /api/v1/appraisals/{id}/sign/
 * - GET/POST /api/v1/appraisals/{id}/comments/
 */
