"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, FileText, ShieldCheck, Users } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { ApiError, getInsightsSummary, useAuthenticatedSession } from "@/lib/api";

interface Insights {
  submissions: number;
  findings: number;
  pending_reviews: number;
  guidelines: number;
}

export default function InsightsPage() {
  const [summary, setSummary] = useState<Insights | null>(null);
  const [message, setMessage] = useState("");
  const authenticated = useAuthenticatedSession();

  useEffect(() => {
    if (!authenticated) return;
    getInsightsSummary()
      .then(setSummary)
      .catch((error: unknown) =>
        setMessage(error instanceof ApiError ? error.message : "Unable to load workspace insights."),
      );
  }, [authenticated]);

  const metrics = [
    { label: "Submissions", value: summary?.submissions, icon: FileText },
    { label: "Findings", value: summary?.findings, icon: AlertTriangle },
    { label: "Pending reviews", value: summary?.pending_reviews, icon: Users },
    { label: "Guidelines", value: summary?.guidelines, icon: ShieldCheck },
  ];

  return (
    <DashboardShell title="Insights" subtitle="Live counts for this workspace.">
      <div className="space-y-6">
        {message && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{message}</p>}
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map(({ label, value, icon: Icon }) => (
            <article key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">{label}</p>
                <Icon className="h-4 w-4 text-indigo-600" />
              </div>
              <p className="mt-3 text-2xl font-semibold">{value ?? "—"}</p>
            </article>
          ))}
        </section>
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          These are record counts, not an automated compliance score. Review decisions remain human-owned.
        </p>
      </div>
    </DashboardShell>
  );
}
