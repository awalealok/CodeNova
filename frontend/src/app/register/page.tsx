"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowRight, CheckCircle2, Eye, Lock, Mail, UserRound } from "lucide-react";
import { DEMO_AUTH_MODE, setSessionAuthenticated, signUp } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [confirm, setConfirm] = useState(""); const [workspace, setWorkspace] = useState("Nexora"); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (!DEMO_AUTH_MODE && password !== confirm) { setError("Passwords do not match"); return; }
    setBusy(true);
    try {
      await signUp({ full_name: fullName, email, password, workspace_name: workspace });
      setSessionAuthenticated(true);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to register");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-xl rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_25px_80px_rgba(15,23,42,0.08)] sm:p-10">
        <div className="mb-8">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-500">Create account</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Start compliance review in minutes</h1>
          {DEMO_AUTH_MODE && (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
              DEMO MODE — Authentication temporarily disabled
            </p>
          )}
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="fullName" className="mb-2 block text-sm font-medium text-slate-700">Full name</label>
            <div className="relative">
              <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input id="fullName" required value={fullName} onChange={(event) => setFullName(event.target.value)} type="text" placeholder="Alex Morgan" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm outline-none transition focus:border-indigo-400 focus:bg-white" />
            </div>
          </div>

          <div>
            <label htmlFor="register-email" className="mb-2 block text-sm font-medium text-slate-700">Email</label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input id="register-email" required value={email} onChange={(event) => setEmail(event.target.value)} type={DEMO_AUTH_MODE ? "text" : "email"} placeholder="alex@inkloom.ai" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm outline-none transition focus:border-indigo-400 focus:bg-white" />
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="register-password" className="mb-2 block text-sm font-medium text-slate-700">Password</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input id="register-password" required minLength={DEMO_AUTH_MODE ? undefined : 10} value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder={DEMO_AUTH_MODE ? "Any password" : "At least 10 characters"} className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-10 text-sm outline-none transition focus:border-indigo-400 focus:bg-white" />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"><Eye className="h-4 w-4" /></button>
              </div>
            </div>

            <div>
              <label htmlFor="confirm-password" className="mb-2 block text-sm font-medium text-slate-700">Confirm password</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input id="confirm-password" required={!DEMO_AUTH_MODE} value={confirm} onChange={(event) => setConfirm(event.target.value)} type="password" placeholder="Confirm password" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-10 text-sm outline-none transition focus:border-indigo-400 focus:bg-white" />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"><Eye className="h-4 w-4" /></button>
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="workspace-name" className="mb-2 block text-sm font-medium text-slate-700">Workspace name</label>
            <input id="workspace-name" required value={workspace} onChange={(event) => setWorkspace(event.target.value)} type="text" placeholder="Nexora" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 px-3 text-sm outline-none transition focus:border-indigo-400 focus:bg-white" />
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
            <div className="flex items-center gap-2 font-medium"><CheckCircle2 className="h-4 w-4" /> {DEMO_AUTH_MODE ? "Demo setup" : "Secure setup"}</div>
            <p className="mt-1 text-emerald-700/80">{DEMO_AUTH_MODE ? "A shared demo account and workspace will be used." : "Passwords are hashed by the backend. Use a unique password for this workspace."}</p>
          </div>

          <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-60">
            {busy ? "Creating account…" : "Create account"} <ArrowRight className="h-4 w-4" />
          </button>
          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          Already have an account? <Link href="/login" className="font-medium text-indigo-600 hover:text-indigo-700">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
