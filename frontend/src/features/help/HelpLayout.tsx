/**
 * HelpLayout — two-panel wrapper for the Help Center.
 *
 * Layout: a sticky `<aside>` (w-64, hidden < md) holding the search input +
 * accordion TOC, plus a flex-grow main column rendering the matched child
 * route via `<Outlet />`. On mobile (< 768 px) the aside is hidden and a
 * "Contents" button toggles a focus-trapped drawer overlay containing the
 * same TOC.
 *
 * Data flow:
 *  - `getAllPages()` is synchronous (Vite `import.meta.glob` with `eager`),
 *    so no loading skeleton is needed.
 *  - Role filtering goes through `filterPagesByRoles` — the single source
 *    of truth for which pages a given user can see.
 *  - `HelpLayout` owns the debounced search query in state and passes it
 *    to both `HelpSearch` (controlled input) and `HelpToc` (which switches
 *    to a flat result list when the query is non-empty). This avoids drilling
 *    state below the layout and keeps debounce isolated inside `HelpSearch`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useLocation, useParams } from "react-router-dom";
import { ChevronRight, X } from "lucide-react";
import { FocusScope } from "@radix-ui/react-focus-scope";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth/useAuth";
import { filterPagesByRoles, getAllPages } from "./loader";
import { HelpToc } from "./HelpToc";
import { HelpSearch } from "./HelpSearch";

const DRAWER_ID = "help-mobile-drawer";

export function HelpLayout() {
  const { user } = useAuth();
  const { section: currentSection, slug: currentSlug } = useParams<{
    section: string;
    slug: string;
  }>();

  const [query, setQuery] = useState<string>("");
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);

  const contentsButtonRef = useRef<HTMLButtonElement | null>(null);
  const drawerPanelRef = useRef<HTMLDivElement | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const { pathname } = useLocation();

  // Reset scroll on route change — without this, navigating between articles
  // (e.g. clicking a cross-link) keeps the previous page's scroll position.
  useEffect(() => {
    mainRef.current?.scrollTo?.({ top: 0 });
  }, [pathname]);
  // Tracks whether the drawer has ever been opened. The focus-restore effect
  // is a no-op until the user has actually opened the drawer at least once,
  // so the initial mount cannot steal focus from the rest of the page.
  const hasEverOpenedRef = useRef<boolean>(false);

  const visiblePages = useMemo(
    () => filterPagesByRoles(getAllPages(), user?.roles ?? []),
    [user],
  );

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
  }, []);

  const openDrawer = useCallback(() => {
    hasEverOpenedRef.current = true;
    setDrawerOpen(true);
  }, []);

  // ESC closes the drawer; focus is restored by the close-effect below.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeDrawer();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen, closeDrawer]);

  // Move focus into the drawer when it opens; restore to the trigger on close.
  // Skip the initial-mount run (when `drawerOpen` starts false and the drawer
  // has never been opened) so we don't steal focus from whatever the user
  // had focused before navigating to /help.
  useEffect(() => {
    if (drawerOpen) {
      drawerPanelRef.current?.focus();
    } else if (hasEverOpenedRef.current) {
      contentsButtonRef.current?.focus();
    }
  }, [drawerOpen]);

  return (
    <div className="-mx-8 -my-8 flex h-[calc(100vh-3.5rem)] overflow-hidden bg-[#F8F9FA]">
      <a
        href="#help-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-white focus:px-4 focus:py-2 focus:rounded focus:shadow text-sm"
      >
        Skip to help content
      </a>

      {/* Desktop aside (md+) */}
      <aside
        className="hidden md:flex w-64 flex-shrink-0 flex-col bg-white border-r border-[#DEE2E6] h-full overflow-hidden"
        aria-label="Help center navigation"
      >
        <div className="px-4 py-3 border-b border-[#DEE2E6] bg-gradient-to-r from-primary-light to-white flex-shrink-0">
          <p className="text-sm font-semibold text-[#1B4F72]">Help Center</p>
        </div>
        <HelpSearch query={query} onQueryChange={setQuery} />
        <HelpToc
          pages={visiblePages}
          currentSection={currentSection}
          currentSlug={currentSlug}
          query={query}
        />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 flex md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Help center contents"
          id={DRAWER_ID}
        >
          <div
            className="fixed inset-0 bg-black/50 transition-opacity"
            aria-hidden="true"
            onClick={closeDrawer}
          />
          <FocusScope
            asChild
            trapped
            loop
            onMountAutoFocus={(event) => {
              // We focus the panel ourselves in the open-effect; suppress
              // FocusScope's auto-focus so it doesn't fight us.
              event.preventDefault();
            }}
          >
            <div
              ref={drawerPanelRef}
              tabIndex={-1}
              className="relative flex w-72 flex-col bg-white shadow-xl z-50 outline-none"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#DEE2E6]">
                <span className="text-sm font-semibold text-[#212529]">
                  Contents
                </span>
                <button
                  type="button"
                  onClick={closeDrawer}
                  aria-label="Close help contents drawer"
                  className="rounded p-1 text-[#6C757D] hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <HelpSearch query={query} onQueryChange={setQuery} />
              <HelpToc
                pages={visiblePages}
                currentSection={currentSection}
                currentSlug={currentSlug}
                query={query}
                onNavigate={closeDrawer}
              />
            </div>
          </FocusScope>
        </div>
      )}

      {/* Right content area */}
      <main
        ref={mainRef}
        id="help-content"
        className="flex-1 overflow-y-auto px-6 md:px-10 py-8"
        aria-label="Help content"
      >
        <div className="mb-4 md:hidden">
          <Button
            ref={contentsButtonRef}
            variant="outline"
            size="sm"
            aria-expanded={drawerOpen}
            aria-controls={DRAWER_ID}
            onClick={openDrawer}
          >
            <ChevronRight className="mr-1 h-4 w-4" aria-hidden="true" />
            Contents
          </Button>
        </div>

        <Outlet />
      </main>
    </div>
  );
}
