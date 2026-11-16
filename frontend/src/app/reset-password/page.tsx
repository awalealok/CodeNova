"use client";

import Link from "next/link";
import { useState, useSyncExternalStore, type FormEvent } from "react";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { ApiError, confirmPasswordReset } from "@/lib/api";

function getResetToken() {
  return typeof window === "undefined"
    ? ""
    : new URLSearchParams(window.location.search).get("token") ?? "";
}

function subscribeToResetToken(listener: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener("popstate", listener);
  return () => window.removeEventListener("popstate", listener);
}

export default function ResetPasswordPage() {
  const token = useSyncExternalStore(subscribeToResetToken, getResetToken, () => "");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!token) {
      setError("The password reset link is missing its token.");
      return;
    }
    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const result = await confirmPasswordReset(token, password);
      setMessage(result.status);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not reset the password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10 text-slate-900">
      <section className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_25px_80px_rgba(15,23,42,0.08)] sm:p-8">
        <Link href="/login" className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600">
          <ArrowLeft className="h-4 w-4" /> Back to login
        </Link>
        <div className="mt-8">
          <AlertCircle className="h-6 w-6 text-indigo-600" />
          <h1 className="mt-3 text-xl font-semibold">Choose a new password</h1>
          <p className="mt-2 text-sm text-slate-600">Use at least 10 characters.</p>
        </div>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label htmlFor="new-password" className="block text-sm font-medium text-slate-700">
            New password
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              maxLength={128}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label htmlFor="confirm-password" className="block text-sm font-medium text-slate-700">
            Confirm password
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              maxLength={128}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <button
            type="submit"
            disabled={busy || !token}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy ? "Updating…" : "Update password"}
          </button>
        </form>
        {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        {message && (
          <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
            {message} <Link href="/login" className="font-semibold underline">Sign in</Link>
          </p>
        )}
      </section>
    </main>
  );
}
