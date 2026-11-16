"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { KeyRound, Save, UserCircle2 } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { ApiError, getCurrentUser, updateProfile, useAuthenticatedSession, type ApiUser } from "@/lib/api";

export default function SettingsPage() {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const authenticated = useAuthenticatedSession();

  useEffect(() => {
    if (!authenticated) return;
    getCurrentUser()
      .then((currentUser) => {
        setUser(currentUser);
        setName(currentUser.name);
        setEmail(currentUser.email);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof ApiError ? cause.message : "Could not load workspace profile.");
      })
      .finally(() => setLoading(false));
  }, [authenticated]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const updated = await updateProfile({
        full_name: name.trim(),
        email: email.trim(),
      });
      setUser(updated);
      setName(updated.name);
      setEmail(updated.email);
      setMessage("Profile changes saved.");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not save profile changes.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DashboardShell title="Workspace Settings" subtitle="Manage your account profile and password.">
      <div className="grid gap-6 xl:grid-cols-2">
        <form onSubmit={handleSave} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <UserCircle2 className="h-6 w-6 text-indigo-600" />
            <h2 className="text-lg font-semibold">Profile</h2>
          </div>
          <div className="mt-5 grid gap-4">
            <label htmlFor="profile-name" className="text-sm font-medium text-slate-700">
              Full name
              <input
                id="profile-name"
                required
                minLength={2}
                maxLength={150}
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={loading || saving}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label htmlFor="profile-email" className="text-sm font-medium text-slate-700">
              Email address
              <input
                id="profile-email"
                required
                type="email"
                maxLength={255}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={loading || saving}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <p><span className="text-slate-500">Workspace</span><br />{user?.workspace_name ?? "Loading…"}</p>
              <p><span className="text-slate-500">Role</span><br />{user?.role ?? "Loading…"}</p>
            </div>
            <button
              type="submit"
              disabled={loading || saving || !user}
              className="inline-flex w-fit items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save profile"}
            </button>
          </div>
        </form>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <KeyRound className="h-6 w-6 text-indigo-600" />
            <h2 className="text-lg font-semibold">Password</h2>
          </div>
          <p className="mt-3 text-sm text-slate-600">
            Request a single-use password reset link sent to your account email.
          </p>
          <Link
            href="/forgot-password"
            className="mt-4 inline-flex rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50"
          >
            Reset password
          </Link>
        </section>
      </div>
      {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {message && <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
    </DashboardShell>
  );
}
