"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowRight, CheckCircle2, Eye, Lock, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { DEMO_AUTH_MODE, setSessionAuthenticated, signIn } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      await signIn(email, password);
      setSessionAuthenticated(true);
      router.push("/dashboard");
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to sign in"); } finally { setBusy(false); }
  }
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-6xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_25px_80px_rgba(15,23,42,0.08)] lg:grid-cols-[1.1fr_0.9fr]">
        <section className="bg-slate-950 px-6 py-8 text-white sm:px-10 sm:py-12">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-200">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-300">INKLOOM AI</p>
              <p className="text-xl font-semibold">Brand Consistency. Verified.</p>
            </div>
          </div>

          <div className="mt-10 space-y-6">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.24em] text-indigo-200">Secure review workflow</p>
              <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight">Check every claim before it reaches the market.</h1>
            </div>

            <ul className="space-y-4 text-slate-200">
              {[
                "Deterministic brand checks against approved guidelines",
                "Evidence-linked deterministic checks and human review",
                "Human review override for escalated findings",
              ].map((item) => (
                <li key={item} className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">
                    <CheckCircle2 className="h-4 w-4" />
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-12 rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="flex items-center gap-3 text-sm text-slate-300">
              <ShieldCheck className="h-4 w-4 text-indigo-300" />
              <span>Evidence-first review: cite or stay silent.</span>
            </div>
          </div>
        </section>

        <section className="px-6 py-8 sm:px-10 sm:py-12">
          <div className="mb-8 text-right">
            <Link href="/register" className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
              Need an account? Create one
            </Link>
          </div>

          <div className="mx-auto max-w-md">
            <div className="mb-8">
              <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-500">Welcome back</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">Sign in to your workspace</h2>
              {DEMO_AUTH_MODE && (
                <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
                  DEMO MODE — Authentication temporarily disabled
                </p>
              )}
            </div>

            <form className="space-y-5" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-700">Email</label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input id="email" type={DEMO_AUTH_MODE ? "text" : "email"} required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="alex@inkloom.ai" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm outline-none ring-0 transition focus:border-indigo-400 focus:bg-white" />
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label htmlFor="password" className="text-sm font-medium text-slate-700">Password</label>
                  {!DEMO_AUTH_MODE && <Link href="/forgot-password" className="text-xs font-medium text-indigo-600 hover:text-indigo-700">Forgot password?</Link>}
                </div>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input id="password" type="password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-10 text-sm outline-none transition focus:border-indigo-400 focus:bg-white" />
                  <button type="button" aria-label="Toggle password visibility" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <Eye className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-3 text-sm text-slate-600">
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                Remember me
              </label>

              <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-60">
                {busy ? "Signing in…" : "Sign in"} <ArrowRight className="h-4 w-4" />
              </button>
              {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
