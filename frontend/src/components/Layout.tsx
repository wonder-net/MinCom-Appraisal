/**
 * Layout — Application shell with sidebar, top bar, and main content area.
 *
 * Sidebar: w-64 bg-primary with user footer and role-aware nav.
 * Top bar: h-14 bg-white with breadcrumb area and notification bell.
 * Main content: flex-1 overflow-y-auto px-8 py-8.
 */

import { useCallback, useState } from "react";
import { Outlet, useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/auth/useAuth";
import { SidebarNav } from "@/components/sidebar-nav";
import { BookOpen, Menu, X } from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";
import { BreadcrumbProvider, useBreadcrumbs } from "@/context/BreadcrumbContext";
import { ROLE_DISPLAY_LABELS } from "@/types";
import type { AdminRole } from "@/types";

function TopBarBreadcrumbs() {
  const { breadcrumbs } = useBreadcrumbs();
  if (breadcrumbs.length === 0) return <div className="flex-1" />;
  return (
    <nav aria-label="Breadcrumb" className="flex-1">
      <ol className="flex items-center gap-2 text-sm">
        {breadcrumbs.map((crumb, idx) => {
          const isLast = idx === breadcrumbs.length - 1;
          return (
            <li key={`${crumb.label}-${idx}`} className="flex items-center gap-2">
              {idx > 0 && <span className="text-gray-400" aria-hidden="true">/</span>}
              {crumb.href && !isLast ? (
                <Link to={crumb.href} className="text-secondary hover:underline">
                  {crumb.label}
                </Link>
              ) : (
                <span
                  className="text-gray-800 font-medium"
                  {...(isLast ? { "aria-current": "page" as const } : {})}
                >
                  {crumb.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = useCallback(async () => {
    await logout();
    void navigate("/login", { replace: true });
  }, [logout, navigate]);

  const closeMobileMenu = useCallback(() => {
    setMobileMenuOpen(false);
  }, []);

  const toggleMobileMenu = useCallback(() => {
    setMobileMenuOpen((prev) => !prev);
  }, []);

  const userInitials = user?.email
    ? user.email.slice(0, 2).toUpperCase()
    : "U";

  const displayName = user?.email ?? "User";
  const rawRole = user?.roles?.[0];
  const displayRole = rawRole
    ? (ROLE_DISPLAY_LABELS[rawRole as AdminRole] ?? rawRole.replace(/_/g, " "))
    : "—";

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Desktop sidebar */}
      <aside
        className="hidden md:flex w-64 flex-shrink-0 bg-primary flex-col"
        aria-label="Main navigation"
      >
        {/* Logo bar */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
          <div className="w-10 h-10 rounded-full bg-white border-2 border-white/30 flex items-center justify-center overflow-hidden flex-shrink-0">
            <img
              src={`${import.meta.env.BASE_URL}images/logo-sidebar.png`}
              srcSet={`${import.meta.env.BASE_URL}images/logo-sidebar@2x.png 2x`}
              alt="Minerals Commission Ghana"
              className="w-9 h-9 object-contain p-0.5"
            />
          </div>
          <span className="text-white font-semibold text-sm">
            MINCOM Appraisal
          </span>
        </div>

        {/* Nav links */}
        <div className="flex-1 py-4 px-3 overflow-y-auto">
          <SidebarNav onLinkClick={closeMobileMenu} />
        </div>

        {/* User footer */}
        <div className="px-4 py-4 border-t border-white/10">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-semibold">
              {userInitials}
            </div>
            <div className="min-w-0">
              <p className="text-white text-xs font-medium truncate">
                {displayName}
              </p>
              <p className="text-white/50 text-xs truncate">{displayRole}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 z-30 bg-black/50 md:hidden"
            onClick={closeMobileMenu}
            aria-hidden="true"
          />
          <aside
            id="mobile-sidebar"
            className="fixed inset-y-0 left-0 z-40 w-64 bg-primary flex flex-col md:hidden"
            aria-label="Mobile navigation"
          >
            <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
              <div className="w-10 h-10 rounded-full bg-white border-2 border-white/30 flex items-center justify-center overflow-hidden flex-shrink-0">
                <img
                  src={`${import.meta.env.BASE_URL}images/logo-sidebar.png`}
                  srcSet={`${import.meta.env.BASE_URL}images/logo-sidebar@2x.png 2x`}
                  alt="Minerals Commission Ghana"
                  className="w-9 h-9 object-contain p-0.5"
                />
              </div>
              <span className="text-white font-semibold text-sm">
                MINCOM Appraisal
              </span>
            </div>
            <div className="flex-1 py-4 px-3 overflow-y-auto">
              <SidebarNav onLinkClick={closeMobileMenu} />
            </div>
            <div className="px-4 py-4 border-t border-white/10">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-semibold">
                  {userInitials}
                </div>
                <div className="min-w-0">
                  <p className="text-white text-xs font-medium truncate">
                    {displayName}
                  </p>
                  <p className="text-white/50 text-xs truncate">
                    {displayRole}
                  </p>
                </div>
              </div>
            </div>
          </aside>
        </>
      )}

      {/* Main area */}
      <BreadcrumbProvider>
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top bar */}
          <header className="bg-white border-b border-gray-200 h-14 flex items-center px-6 flex-shrink-0">
            <button
              type="button"
              className="md:hidden -ml-2 p-1 rounded text-gray-600 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
              onClick={toggleMobileMenu}
              aria-label={
                mobileMenuOpen
                  ? "Close navigation menu"
                  : "Open navigation menu"
              }
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-sidebar"
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </button>

            <TopBarBreadcrumbs />

            <div className="flex items-center gap-3">
              <NotificationBell />
              <Link
                to="/help"
                aria-label="Help"
                className="inline-flex items-center gap-2 h-9 px-3 rounded-md text-sm text-gray-700 hover:bg-gray-50 hover:text-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
              >
                <BookOpen className="h-4 w-4" aria-hidden="true" />
                <span className="hidden md:inline">Help</span>
              </Link>
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="h-9 px-4 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                aria-label="Sign out"
              >
                Sign out
              </button>
            </div>
          </header>

          {/* Page content */}
          <main
            className="flex-1 overflow-y-auto px-8 py-8"
            aria-label="Main content"
          >
            <Outlet />
          </main>
        </div>
      </BreadcrumbProvider>
    </div>
  );
}
