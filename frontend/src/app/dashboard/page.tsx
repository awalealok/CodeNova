"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileText,
  FolderOpen,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import {
  ApiError,
  type AuditEvent,
  type ApprovedFact,
  type ContentItem,
  type Guideline,
  type Rule,
  getInsightsSummary,
  listAuditEvents,
  listContent,
  listFacts,
  listGuidelines,
  listRules,
  useAuthenticatedSession,
} from "@/lib/api";

interface Summary {
  submissions: number;
  findings: number;
  pending_reviews: number;
  guidelines: number;
}

const initialSummary: Summary = {
  submissions: 0,
  findings: 0,
  pending_reviews: 0,
  guidelines: 0,
};

export default function DashboardPage() {
  const [summary, setSummary] = useState(initialSummary);
  const [content, setContent] = useState<ContentItem[]>([]);
  const [guidelines, setGuidelines] = useState<Guideline[]>([]);
  const [facts, setFacts] = useState<ApprovedFact[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const authenticated = useAuthenticatedSession();

  useEffect(() => {
    if (!authenticated) return;
    Promise.all([
      getInsightsSummary(),
      listContent(),
      listGuidelines(),
      listRules(),
      listFacts(),
      listAuditEvents(),
    ])
      .then(([summaryData, contentData, guidelineData, ruleData, factData, auditData]) => {
        setSummary(summaryData);
        setContent(contentData);
        setGuidelines(guidelineData);
        setRules(ruleData);
        setFacts(factData);
        setEvents(auditData);
      })
      .catch((reason: unknown) => {
        setError(
          reason instanceof ApiError
            ? reason.message
            : "Unable to load workspace dashboard.",
        );
      })
      .finally(() => setLoading(false));
  }, [authenticated]);

  const cards = [
    { label: "Submissions", value: summary.submissions, icon: FileText },
    { label: "Pending reviews", value: summary.pending_reviews, icon: Clock3 },
    { label: "Total findings", value: summary.findings, icon: AlertTriangle },
    { label: "Guidelines", value: summary.guidelines, icon: ShieldCheck },
  ];

  const onboardingSteps = [
    { label: "Upload brand guidelines", done: guidelines.length > 0 },
    { label: "Upload product evidence", done: content.some((item) => item.content_type === "evidence") || content.length > 0 },
    { label: "Add approved brand rules", done: rules.length > 0 },
    { label: "Add brand facts and claims", done: facts.length > 0 },
    { label: "Upload content for review", done: content.length > 0 },
    { label: "Run AI compliance analysis", done: content.some((item) => (item.finding_count ?? 0) > 0) },
    { label: "Review flagged findings", done: summary.findings > 0 },
    { label: "Approve or reject content", done: content.some((item) => item.workflow_status.includes("approved") || item.workflow_status.includes("rejected")) },
    { label: "Check audit history and insights", done: events.length > 0 },
  ];

  const completedOnboarding = onboardingSteps.filter((step) => step.done).length;
  const completedPercent = onboardingSteps.length
    ? Math.round((completedOnboarding / onboardingSteps.length) * 100)
    : 0;

  const recentSubmissions = content.slice(0, 5);
  const recentActivities = events.slice(0, 5);
  const approvalRate = content.length
    ? Math.round(
        (content.filter((item) => item.workflow_status.toLowerCase().includes("approved")).length /
          content.length) *
          100,
      )
    : null;

  return (
    <DashboardShell title="Overview" subtitle="Live workspace activity and review status.">
      <div className="space-y-6">
        {error && (
          <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        {loading && <p role="status" className="text-sm text-slate-500">Loading workspace…</p>}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="rounded-xl bg-slate-100 p-2 text-slate-700">
                  <Icon className="h-4 w-4" />
                </div>
                {label === "Pending reviews" && value === 0 && (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label="No pending reviews" />
                )}
              </div>
              <p className="mt-4 text-2xl font-semibold tracking-tight">{loading ? "—" : value}</p>
              <p className="mt-1 text-sm text-slate-500">{label}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Getting Started</h2>
                <p className="text-sm text-slate-500">Complete the core review workflow to activate the workspace.</p>
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium text-slate-700">Workspace readiness</span>
                <span className="text-indigo-700">{completedPercent}%</span>
              </div>
              <div className="h-2.5 rounded-full bg-slate-100">
                <div className="h-2.5 rounded-full bg-indigo-600" style={{ width: `${completedPercent}%` }} />
              </div>
            </div>

            <ul className="mt-4 space-y-2">
              {onboardingSteps.map((step) => (
                <li key={step.label} className="flex items-center gap-2 text-sm text-slate-700">
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full ${step.done ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    {step.done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                  </span>
                  {step.label}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Quick actions</h2>
            <p className="mt-1 text-sm text-slate-500">Jump into the next step in the compliance workflow.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Link href="/guidelines" className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-slate-800 hover:bg-slate-100">
                Upload guidelines <ArrowRight className="h-4 w-4 text-indigo-600" />
              </Link>
              <Link href="/content" className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-slate-800 hover:bg-slate-100">
                Submit content <ArrowRight className="h-4 w-4 text-indigo-600" />
              </Link>
              <Link href="/facts" className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-slate-800 hover:bg-slate-100">
                Add facts <ArrowRight className="h-4 w-4 text-indigo-600" />
              </Link>
              <Link href="/reviews" className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-slate-800 hover:bg-slate-100">
                Review queue <ArrowRight className="h-4 w-4 text-indigo-600" />
              </Link>
            </div>
            {approvalRate !== null && (
              <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
                Approval rate: {approvalRate}% of submissions have already been approved.
              </div>
            )}
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Recent submissions</h2>
                <p className="text-sm text-slate-500">The latest files and copy in this workspace.</p>
              </div>
              <Link href="/content" className="text-sm font-semibold text-indigo-700">
                Manage submissions
              </Link>
            </div>
            {recentSubmissions.length === 0 && !loading ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                No records exist yet. Upload a document or submit content to begin your review workflow.
              </div>
            ) : (
              <ul className="space-y-3">
                {recentSubmissions.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
                    <div>
                      <p className="font-medium text-slate-900">{item.title}</p>
                      <p className="text-xs text-slate-500">{item.channel ?? "workspace content"} · {item.workflow_status.replaceAll("_", " ")}</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                      {item.finding_count ?? 0} findings
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Recent activities</h2>
                <p className="text-sm text-slate-500">Key actions recorded in the workspace audit trail.</p>
              </div>
              <Link href="/audit" className="text-sm font-semibold text-indigo-700">
                View history
              </Link>
            </div>
            {recentActivities.length === 0 && !loading ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                No recent activity has been recorded yet. The audit log updates as you upload, review, and decide on content.
              </div>
            ) : (
              <ul className="space-y-3">
                {recentActivities.map((event) => (
                  <li key={event.id} className="rounded-xl border border-slate-200 p-3 text-sm text-slate-700">
                    <p className="font-medium text-slate-900">{event.event_type.replaceAll(".", " ")}</p>
                    <p className="mt-1">{event.action_description}</p>
                    <p className="mt-1 text-xs text-slate-500">{new Date(event.created_at).toLocaleString()}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Recent review decisions</h2>
              <p className="text-sm text-slate-500">Most recent findings and actions in the queue.</p>
            </div>
            <Link href="/reviews" className="text-sm font-semibold text-indigo-700">
              Open review queue
            </Link>
          </div>
          {content.filter((item) => item.workflow_status.toLowerCase().includes("rejected") || item.workflow_status.toLowerCase().includes("approved")).length === 0 && !loading ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              No review decisions have been recorded yet. Save a rule, submit content, and review findings to populate this section.
            </div>
          ) : (
            <div className="space-y-3">
              {content
                .filter((item) => item.workflow_status.toLowerCase().includes("rejected") || item.workflow_status.toLowerCase().includes("approved"))
                .slice(0, 4)
                .map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
                    <div>
                      <p className="font-medium text-slate-900">{item.title}</p>
                      <p className="text-xs text-slate-500">{item.workflow_status.replaceAll("_", " ")}</p>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700">
                      {item.finding_count ?? 0} findings
                    </span>
                  </div>
                ))}
            </div>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
