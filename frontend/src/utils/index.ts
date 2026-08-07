/**
 * Utility functions for the MINCOM Appraisal Platform.
 *
 * This module re-exports shared helper functions used across
 * the application, including:
 * - cn() — Tailwind CSS class name merging (clsx + twMerge)
 * - Date/time formatting (UTC to local timezone conversion)
 * - Score computation helpers
 * - Form validation utilities
 * - Number and string formatters
 */

export { cn } from "./cn";
export { formatScore, scoreColour, formatCompletionRate } from "./format";
export { EMAIL_REGEX } from "./validation";
