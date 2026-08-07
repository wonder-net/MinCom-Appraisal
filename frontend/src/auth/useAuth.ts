/**
 * Custom hook to access the authentication context.
 *
 * Must be used within a component that is a descendant of <AuthProvider>.
 * Throws a descriptive error if used outside the provider tree.
 *
 * @example
 * ```tsx
 * function DashboardPage() {
 *   const { user, isAuthenticated, logout } = useAuth();
 *   // ...
 * }
 * ```
 */

import { useContext } from "react";
import { AuthContext } from "./AuthContext";
import type { AuthContextType } from "./types";

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);

  if (context === null) {
    throw new Error(
      "useAuth must be used within an <AuthProvider>. " +
        "Wrap your component tree with <AuthProvider> in main.tsx or App.tsx.",
    );
  }

  return context;
}
