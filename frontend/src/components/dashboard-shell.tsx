"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  BriefcaseBusiness,
  CheckCircle2,
  FileText,
  FolderKanban,
  Gauge,
  History,
  LayoutDashboard,
  LogOut,
  MessageSquareText,
  Settings,
  ShieldCheck,
  Sparkles,
  UserCircle2,
  Users,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import {
  ApiError,
  DEMO_AUTH_MODE,
  getCurrentUser,
  isSessionAuthenticated,
  setSessionAuthenticated,
  signOut,
  useAuthenticatedSession,
  type ApiUser,
} from "@/lib/api";

const navItems = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "My Content", href: "/content", icon: FileText },
  { label: "Submit Content", href: "/content", icon: ArrowRight },
  { label: "Brand Guidelines", href: "/guidelines", icon: BookOpen },
  { label: "Facts & Claims", href: "/facts", icon: ShieldCheck },
  { label: "Brand Lexicon", href: "/lexicon", icon: MessageSquareText },
  { label: "Brand Assets", href: "/assets", icon: FolderKanban },
  { label: "Review Queue", href: "/reviews", icon: CheckCircle2 },
  { label: "Insights", href: "/insights", icon: Gauge },
  { label: "Audit History", href: "/audit", icon: History },
  { label: "Settings", href: "/settings", icon: Settings },
];

function Item({
  label,
  href,
  icon: Icon,
}: {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
}) {
  const pathname = usePathname();
  const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));

  return (
    <Link
      href={href}
      className={[
        "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
        active ? "bg-indigo-100 text-indigo-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
      ].join(" ")}
    >
      <span className="rounded-lg border border-slate-200 bg-white p-1.5 shadow-sm">
        <Icon className="h-4 w-4" />
      </span>
      <span>{label}</span>
    </Link>
  );
}

export function DashboardShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const authenticated = useAuthenticatedSession();
  const [user, setUser] = useState<ApiUser | null>(null);
  const [logoutError, setLogoutError] = useState("");
  const [authError, setAuthError] = useState("");
  const [logoutBusy, setLogoutBusy] = useState(false);

  useEffect(() => {
    if (!authenticated) {
      if (isSessionAuthenticated()) {
        setSessionAuthenticated(true);
        return;
      }
      router.replace("/login");
      return;
    }
    getCurrentUser()
      .then((currentUser) => {
        setUser(currentUser);
        setAuthError("");
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) {
          setSessionAuthenticated(false);
          router.replace("/login");
        } else {
          setAuthError(
            error instanceof ApiError ? error.message : "Could not load the account session.",
          );
        }
      });
  }, [authenticated, router]);

  async function handleLogout() {
    setLogoutError("");
    setLogoutBusy(true);
    try {
      await signOut();
      setSessionAuthenticated(false);
      router.push("/login");
    } catch (error) {
      setLogoutError(
        error instanceof ApiError ? error.message : "Could not end the server session.",
      );
    } finally {
      setLogoutBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1800px]">
        <aside className="hidden w-72 flex-col border-r border-slate-200 bg-white px-5 py-6 lg:flex">
          <div className="mb-8 flex items-center gap-3 px-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="text-lg font-semibold tracking-tight">INKLOOM AI</p>
              <p className="text-xs text-slate-500">Brand Consistency. Verified.</p>
            </div>
          </div>

          <nav className="flex flex-1 flex-col gap-1">
            {navItems.map((item) => (
              <Item key={`${item.href}-${item.label}`} label={item.label} href={item.href} icon={item.icon} />
            ))}
          </nav>

          <div className="mt-6 space-y-3 border-t border-slate-200 pt-4">
            <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
                <UserCircle2 className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{user?.name ?? "Workspace user"}</p>
                <p className="text-xs text-slate-500">{user?.email ?? "Loading profile…"}</p>
              </div>
            </div>

            <div className="space-y-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2"><BriefcaseBusiness className="h-4 w-4" /> Workspace</span>
                <span className="font-medium text-slate-900">{user?.workspace_name ?? "Workspace"}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2"><Users className="h-4 w-4" /> Role</span>
                <span className="font-medium text-slate-900">{user?.role ?? "—"}</span>
              </div>
            </div>

            <button
              onClick={handleLogout}
              disabled={logoutBusy}
              className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <span className="flex items-center gap-2"><LogOut className="h-4 w-4" /> {logoutBusy ? "Signing out…" : "Logout"}</span>
            </button>
          </div>
        </aside>

        <main className="flex-1">
          <header className="border-b border-slate-200 bg-white/90 px-4 py-4 backdrop-blur sm:px-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                  <span>Workspace</span>
                  <span>•</span>
                  <span>{user?.workspace_name ?? "Workspace"}</span>
                </div>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
                {subtitle ? <p className="text-sm text-slate-500">{subtitle}</p> : null}
                {DEMO_AUTH_MODE && (
                  <p className="mt-2 inline-block rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800">
                    DEMO MODE — Authentication temporarily disabled
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm">
                  Workspace selector
                </button>
                <button className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm">
                  Notifications
                </button>
                <button className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm">
                  Help
                </button>
                <div className="flex items-center gap-2 rounded-xl bg-slate-100 px-2 py-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white">AM</div>
                  <div className="text-sm">
                    <div className="font-semibold">{user?.name ?? "Profile"}</div>
                    <div className="text-slate-500">{user?.role ?? "Loading…"}</div>
                  </div>
                </div>
              </div>
            </div>
          </header>

          <div className="p-4 sm:p-6">{children}</div>
          {(authError || logoutError) && (
            <p role="alert" className="mx-4 mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700 sm:mx-6">
              {authError || logoutError}
            </p>
          )}
        </main>
      </div>
    </div>
  );
}
