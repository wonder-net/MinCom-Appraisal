/**
 * Shared validation utilities for the MINCOM Appraisal Platform.
 *
 * Centralises common validation patterns (email, etc.) so they are
 * defined once and imported wherever needed.
 */

/**
 * Basic email format regex — checks for `local@domain.tld` structure.
 * Server-side validation is the authoritative check; this is UX only.
 */
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * UUID v4 format regex (case-insensitive).
 * Used to distinguish existing-entity IDs from free-text names
 * entered via Combobox free-text mode.
 */
export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Returns true when the given string is a valid UUID v4 format.
 * Pure function — no side effects.
 */
export const isUUID = (value: string): boolean => UUID_REGEX.test(value);
