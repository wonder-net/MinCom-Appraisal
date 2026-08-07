/**
 * SidebarNav — Role-aware navigation links for the application sidebar.
 *
 * Renders navigation items based on the authenticated user's roles.
 * Supports flat NavItem links and collapsible NavGroup sections.
 * Active item: bg-primary-dark border-l-4 border-white font-medium text-white.
 * Inactive: text-white/70 hover:bg-white/10.
 */

import { useState, useMemo, useCallback, useEffect } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import {
  FileText,
  BarChart3,
  BookOpen,
  Users,
  Users2,
  RefreshCcw,
  ClipboardList,
  Settings2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/auth/useAuth";
import type { UserRole } from "@/auth/types";
import type { ComponentType } from "react";

interface NavItem {
  kind: "item";
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  allowedRoles: readonly UserRole[] | null;
}

interface NavGroupItem {
  label: string;
  href: string;
  allowedRoles: readonly UserRole[] | null;
}

interface NavGroup {
  kind: "group";
  label: string;
  icon: ComponentType<{ className?: string }>;
  allowedRoles: readonly UserRole[] | null;
  children: readonly NavGroupItem[];
}

type NavEntry = NavItem | NavGroup;

const REPORTS_CHILDREN: readonly NavGroupItem[] = [
  { label: "Dashboard", href: "/reports", allowedRoles: ["HR_ADMIN", "SYSTEM_ADMIN", "HR_OFFICER", "EXECUTIVE"] },
  { label: "Unapprised", href: "/reports/unapprised", allowedRoles: ["HR_ADMIN", "SYSTEM_ADMIN", "HR_OFFICER"] },
  { label: "Distribution", href: "/reports/score-distribution", allowedRoles: ["HR_ADMIN", "SYSTEM_ADMIN", "HR_OFFICER", "EXECUTIVE"] },
  { label: "Competency Gaps", href: "/reports/competency-gaps", allowedRoles: ["HR_ADMIN", "SYSTEM_ADMIN", "HR_OFFICER"] },
  { label: "Manager Effectiveness", href: "/reports/manager-effectiveness", allowedRoles: ["HR_ADMIN", "SYSTEM_ADMIN", "HR_OFFICER", "EXECUTIVE"] },
  { label: "Disputes", href: "/reports/disputes", allowedRoles: ["HR_ADMIN", "SYSTEM_ADMIN", "HR_OFFICER"] },
  { label: "BSC Perspectives", href: "/reports/bsc-perspectives", allowedRoles: ["HR_ADMIN", "SYSTEM_ADMIN", "HR_OFFICER", "EXECUTIVE"] },
  { label: "Identified Training Needs", href: "/reports/training-needs", allowedRoles: ["HR_ADMIN", "SYSTEM_ADMIN", "HR_OFFICER"] },
  { label: "Career Pipeline", href: "/reports/career-pipeline", allowedRoles: ["HR_ADMIN", "SYSTEM_ADMIN", "HR_OFFICER", "EXECUTIVE"] },
  { label: "Audit Compliance", href: "/reports/audit-compliance", allowedRoles: ["HR_ADMIN", "SYSTEM_ADMIN", "HR_OFFICER"] },
  // { label: "Descriptor Config", href: "/reports/descriptor-config", allowedRoles: ["HR_ADMIN"] },
  { label: "Trend", href: "/reports/trend", allowedRoles: ["HR_ADMIN", "SYSTEM_ADMIN", "HR_OFFICER", "EXECUTIVE"] },
  { label: "Rating Variance", href: "/reports/variance", allowedRoles: ["HR_ADMIN", "SYSTEM_ADMIN", "HR_OFFICER", "EXECUTIVE"] },
  { label: "9-Box Talent Grid", href: "/reports/nine-box", allowedRoles: ["HR_ADMIN", "SYSTEM_ADMIN", "HR_OFFICER", "EXECUTIVE"] },
  { label: "Calibration", href: "/reports/calibration", allowedRoles: ["HR_ADMIN", "SYSTEM_ADMIN", "HR_OFFICER"] },
] as const;

const NAV_ENTRIES: readonly NavEntry[] = [
  {
    kind: "item",
    label: "Appraisals",
    href: "/appraisals",
    icon: FileText,
    allowedRoles: null,
  },
  {
    kind: "item",
    label: "Employees",
    href: "/employees",
    icon: Users2,
    allowedRoles: ["HR_ADMIN", "SYSTEM_ADMIN", "HR_OFFICER", "EXECUTIVE", "MANAGER"],
  },
  {
    kind: "item",
    label: "Cycles",
    href: "/admin/cycles",
    icon: RefreshCcw,
    allowedRoles: ["HR_ADMIN", "SYSTEM_ADMIN"],
  },
  {
    kind: "item",
    label: "Competencies",
    href: "/admin/competencies",
    icon: BookOpen,
    allowedRoles: ["HR_ADMIN", "SYSTEM_ADMIN"],
  },
  {
    kind: "group",
    label: "Reports",
    icon: BarChart3,
    allowedRoles: ["HR_ADMIN", "SYSTEM_ADMIN", "HR_OFFICER", "EXECUTIVE"],
    children: REPORTS_CHILDREN,
  },
  {
    kind: "item",
    label: "Users",
    href: "/admin/users",
    icon: Users,
    allowedRoles: ["HR_ADMIN", "SYSTEM_ADMIN"],
  },
  {
    kind: "item",
    label: "Audit Log",
    href: "/audit/logs",
    icon: ClipboardList,
    allowedRoles: ["HR_ADMIN", "SYSTEM_ADMIN", "HR_OFFICER"],
  },
  {
    kind: "item",
    label: "Settings",
    href: "/settings/account",
    icon: Settings2,
    allowedRoles: null,
  },
] as const;

function hasAccess(
  userRoles: readonly UserRole[],
  allowedRoles: readonly UserRole[] | null,
): boolean {
  if (allowedRoles === null) return true;
  return userRoles.some((role) =>
    (allowedRoles as readonly UserRole[]).includes(role),
  );
}

const LINK_BASE =
  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white " +
  "focus-visible:ring-offset-1 focus-visible:ring-offset-primary";

const ACTIVE_CLASSES = "bg-primary-dark border-l-4 border-white font-medium text-white";
const INACTIVE_CLASSES = "text-white/70 hover:bg-white/10";

function isSubLinkActive(pathname: string, href: string): boolean {
  if (href === "/reports") return pathname === "/reports";
  return pathname === href || pathname.startsWith(`${href}/`);
}

interface SidebarNavProps {
  onLinkClick?: () => void;
}

export function SidebarNav({ onLinkClick }: SidebarNavProps) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const isOnReportsPath = pathname.startsWith("/reports");
  const [manualToggle, setManualToggle] = useState<boolean | null>(null);

  // Reset manual override when navigating into/out of reports
  useEffect(() => {
    setManualToggle(null);
  }, [isOnReportsPath]);

  const toggleGroup = useCallback(() => {
    setManualToggle((prev) => prev === null ? !isOnReportsPath : !prev);
  }, [isOnReportsPath]);

  const visibleEntries = useMemo(() => {
    if (!user) return [];
    return NAV_ENTRIES.filter((entry) => hasAccess(user.roles, entry.allowedRoles));
  }, [user]);

  if (visibleEntries.length === 0) return null;

  const isExpanded = manualToggle ?? isOnReportsPath;

  return (
    <nav aria-label="Main navigation">
      <ul className="space-y-1" role="list">
        {visibleEntries.map((entry) => {
          if (entry.kind === "item") {
            return (
              <NavItemLink
                key={entry.href}
                item={entry}
                pathname={pathname}
                onLinkClick={onLinkClick}
              />
            );
          }

          return (
            <NavGroupSection
              key={entry.label}
              group={entry}
              pathname={pathname}
              isExpanded={isExpanded}
              onToggle={toggleGroup}
              onLinkClick={onLinkClick}
              userRoles={user?.roles ?? []}
            />
          );
        })}
      </ul>
    </nav>
  );
}

interface NavItemLinkProps {
  item: NavItem;
  pathname: string;
  onLinkClick?: () => void;
}

function NavItemLink({ item, pathname, onLinkClick }: NavItemLinkProps) {
  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon;

  return (
    <li>
      <Link
        to={item.href}
        onClick={onLinkClick}
        aria-current={isActive ? "page" : undefined}
        className={`${LINK_BASE} ${isActive ? ACTIVE_CLASSES : INACTIVE_CLASSES}`}
      >
        <Icon
          className={`h-4 w-4 shrink-0 ${isActive ? "text-white" : "text-white/50"}`}
          aria-hidden="true"
        />
        {item.label}
      </Link>
    </li>
  );
}

interface NavGroupSectionProps {
  group: NavGroup;
  pathname: string;
  isExpanded: boolean;
  onToggle: () => void;
  onLinkClick?: () => void;
  userRoles: readonly UserRole[];
}

function NavGroupSection({
  group,
  pathname,
  isExpanded,
  onToggle,
  onLinkClick,
  userRoles,
}: NavGroupSectionProps) {
  const [searchParams] = useSearchParams();
  const Icon = group.icon;
  const ChevronIcon = isExpanded ? ChevronDown : ChevronRight;

  const visibleChildren = useMemo(
    () => group.children.filter((child) => hasAccess(userRoles, child.allowedRoles)),
    [group.children, userRoles],
  );

  if (visibleChildren.length === 0) return null;

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        className={[
          "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
          "focus-visible:ring-offset-1 focus-visible:ring-offset-primary",
          isExpanded
            ? "text-white font-medium"
            : "text-white/70 hover:bg-white/10",
        ].join(" ")}
      >
        <Icon
          className={`h-4 w-4 shrink-0 ${isExpanded ? "text-white" : "text-white/50"}`}
          aria-hidden="true"
        />
        <span className="flex-1 text-left">{group.label}</span>
        <ChevronIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
      </button>
      {isExpanded && (
        <ul className="mt-1 space-y-1" role="list">
          {visibleChildren.map((child) => {
            const isActive = isSubLinkActive(pathname, child.href);
            return (
              <li key={child.href}>
                <Link
                  to={{ pathname: child.href, search: searchParams.toString() }}
                  onClick={onLinkClick}
                  aria-current={isActive ? "page" : undefined}
                  className={`${LINK_BASE} pl-8 ${isActive ? ACTIVE_CLASSES : INACTIVE_CLASSES}`}
                >
                  {child.label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}
