/**
 * PublicHelpLayout — Minimal unauthenticated chrome for the small set of
 * help articles linked from the login screen.
 *
 * Intentionally does NOT use:
 *   - `<Layout>` (sidebar + topbar — auth-only)
 *   - `useAuth` (route is reachable without a session)
 *   - `useBreadcrumbs` (breadcrumb context only mounts inside `<Layout>`)
 *
 * The only nav affordance is "Back to sign in" — public users have no other
 * destination from here.
 */

import { useEffect, useRef } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";

export function PublicHelpLayout() {
  const mainRef = useRef<HTMLElement | null>(null);
  const { pathname } = useLocation();

  // Reset scroll on route change — without this, navigating between articles
  // keeps the previous page's scroll position because the SPA never reloads.
  useEffect(() => {
    mainRef.current?.scrollTo?.({ top: 0 });
  }, [pathname]);

  return (
    <div className="flex h-screen flex-col bg-gray-50">
      <header className="flex-shrink-0 border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <img
              src={`${import.meta.env.BASE_URL}images/logo-login.png`}
              srcSet={`${import.meta.env.BASE_URL}images/logo-login@2x.png 2x`}
              alt="Minerals Commission Ghana"
              className="h-10 w-10 object-contain"
            />
            <span className="text-sm font-semibold tracking-tight text-primary">
              MINCOM Appraisal
            </span>
          </div>
          <Link
            to="/login"
            className="text-sm font-medium text-secondary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2"
          >
            &larr; Back to sign in
          </Link>
        </div>
      </header>
      <main ref={mainRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
