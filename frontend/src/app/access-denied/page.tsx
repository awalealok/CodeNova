import Link from "next/link";
import { AlertTriangle, ArrowLeft } from "lucide-react";

export default function AccessDeniedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10 text-slate-900">
      <div className="w-full max-w-lg rounded-[28px] border border-slate-200 bg-white p-8 shadow-[0_25px_80px_rgba(15,23,42,0.08)]">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-100 text-red-600">
          <AlertTriangle className="h-8 w-8" />
        </div>

        <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-500">Access denied</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">You do not have permission to view this workspace.</h1>
        <p className="mt-4 text-slate-600">This restriction is enforced by backend RBAC and role-based permissions. Contact your workspace administrator if you need access.</p>

        <div className="mt-8 flex gap-3">
          <Link href="/login" className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800">
            <ArrowLeft className="h-4 w-4" /> Return to login
          </Link>
          <Link href="/dashboard" className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            View dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
