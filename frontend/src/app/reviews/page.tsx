"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Check, Search, ShieldAlert } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import {
  ApiError,
  type ContentItem,
  type Decision,
  type Finding,
  type UnverifiedClaim,
  decideFinding,
  listContent,
  listFindingDecisions,
  listFindings,
  runReview,
  useAuthenticatedSession,
} from "@/lib/api";

function renderHighlightedText(body: string, findings: Finding[]): ReactNode[] {
  const codePoints = Array.from(body);
  const codePointToUtf16 = [0];
  for (const point of codePoints) {
    codePointToUtf16.push(codePointToUtf16[codePointToUtf16.length - 1] + point.length);
  }
  const spans = findings.flatMap((finding) => {
    const { start_offset: start, end_offset: end } = finding;
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      end <= start ||
      end > codePoints.length
    ) {
      return [];
    }
    const startUtf16 = codePointToUtf16[start];
    const endUtf16 = codePointToUtf16[end];
    return body.slice(startUtf16, endUtf16) === finding.quoted_span
      ? [{ finding, start: startUtf16, end: endUtf16 }]
      : [];
  });
  const boundaries = [...new Set([0, body.length, ...spans.flatMap(({ start, end }) => [start, end])])]
    .sort((left, right) => left - right);

  return boundaries.slice(0, -1).map((start, index) => {
    const end = boundaries[index + 1];
    const active = spans.filter((span) => span.start < end && span.end > start);
    if (!active.length) return <span key={start}>{body.slice(start, end)}</span>;
    const startingFindings = spans
      .filter((span) => span.start === start)
      .map((span) => span.finding);
    return (
      <mark
        key={start}
        className="bg-rose-200 text-slate-950 decoration-rose-600"
        title={active.map(({ finding }) => finding.category.replaceAll("_", " ")).join(", ")}
      >
        {startingFindings.map((finding) => (
          <span key={finding.id} id={`finding-span-${finding.id}`} className="sr-only" />
        ))}
        {body.slice(start, end)}
      </mark>
    );
  });
}

export default function ReviewsPage() {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [selected, setSelected] = useState<ContentItem | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [unverifiedClaims, setUnverifiedClaims] = useState<UnverifiedClaim[]>([]);
  const [decisionHistory, setDecisionHistory] = useState<Record<string, Decision[]>>({});
  const [overrideFindingId, setOverrideFindingId] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const authenticated = useAuthenticatedSession();

  useEffect(() => {
    if (!authenticated) return;
    listContent()
      .then(setItems)
      .catch((error: unknown) =>
        setMessage(error instanceof ApiError ? error.message : "Unable to load review queue."),
      )
      .finally(() => setLoading(false));
  }, [authenticated]);

  async function inspect(item: ContentItem) {
    setSelected(item);
    setBusy(true);
    setUnverifiedClaims([]);
    try {
      const saved = await listFindings(item.id);
      setFindings(saved);
      let histories: Array<readonly [string, Decision[]]>;
      try {
        histories = await Promise.all(
          saved.map(async (finding) => [
            finding.id,
            await listFindingDecisions(finding.id),
          ] as const),
        );
      } catch (error) {
        setDecisionHistory({});
        const detail = error instanceof ApiError ? error.message : "The history request failed.";
        setMessage(`Findings loaded, but decision history could not be loaded: ${detail}`);
        return;
      }
      setDecisionHistory(Object.fromEntries(histories));
      setMessage(saved.length ? `${saved.length} saved findings loaded.` : "No findings yet. Run review.");
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Unable to load findings.");
    } finally {
      setBusy(false);
    }
  }

  async function review(item: ContentItem) {
    setSelected(item);
    setBusy(true);
    setUnverifiedClaims([]);
    try {
      const result = await runReview(item.id);
      setFindings(result.findings);
      setUnverifiedClaims(result.ai.unverified_claims ?? []);
      setDecisionHistory({});
      setOverrideFindingId(null);
      setOverrideReason("");
      setItems((current) => current.map((entry) => (entry.id === item.id ? result.content : entry)));
      setMessage(
        result.ai.error
          ? `Deterministic review saved; AI error: ${result.ai.error}`
          : `Review complete: ${result.findings.length} findings.`,
      );
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Review request failed.");
    } finally {
      setBusy(false);
    }
  }

  async function decide(
    finding: Finding,
    action: "accept" | "reject" | "override",
    overrideReasonInput?: string,
  ) {
    let reason: string | undefined;
    if (action === "override" && ["high", "critical"].includes(finding.severity)) {
      if (overrideReasonInput === undefined) {
        setOverrideFindingId(finding.id);
        setOverrideReason("");
        return;
      }
      reason = overrideReasonInput;
      if (reason.trim().length < 3) {
        setMessage("A written reason is required for a high-severity override.");
        return;
      }
    }
    setBusy(true);
    try {
      const decision = await decideFinding(finding.id, action, reason);
      setFindings((current) =>
        current.map((item) =>
          item.id === finding.id ? { ...item, review_status: decision.new_status } : item,
        ),
      );
      setMessage(`Finding ${{ accept: "accepted", reject: "rejected", override: "overridden" }[action]} and saved.`);
      setOverrideFindingId(null);
      setOverrideReason("");
      try {
        const history = await listFindingDecisions(finding.id);
        setDecisionHistory((current) => ({ ...current, [finding.id]: history }));
      } catch (error) {
        const detail = error instanceof ApiError ? error.message : "The history request failed.";
        setMessage(`Decision saved, but its history could not be refreshed: ${detail}`);
      }
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Decision could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  const visibleItems = items.filter((item) =>
    item.title.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <DashboardShell title="Review Queue" subtitle="Review content and record decisions on evidence-backed findings.">
      <div className="space-y-6">
        {message && <p role="status" className="rounded-xl bg-indigo-50 p-3 text-sm text-indigo-900">{message}</p>}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Workspace submissions</h2>
              <p className="text-sm text-slate-500">A finding remains advisory until a reviewer decides.</p>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input aria-label="Search review queue" placeholder="Search submissions" value={search} onChange={(event) => setSearch(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm" />
            </div>
          </div>
          {loading ? <p role="status">Loading review queue…</p> : visibleItems.length === 0 ? (
            <p className="text-sm text-slate-500">No submissions are awaiting review.</p>
          ) : (
            <div className="space-y-3">
              {visibleItems.map((item) => (
                <article key={item.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-semibold">{item.title}</p>
                    <p className="text-sm text-slate-500">{item.workflow_status.replaceAll("_", " ")} · {item.finding_count ?? 0} findings</p>
                  </div>
                  <div className="flex gap-2">
                    <button className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm" onClick={() => inspect(item)} disabled={busy}>View findings</button>
                    <button className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white disabled:opacity-50" onClick={() => review(item)} disabled={busy}>Run review</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {selected && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Findings: {selected.title}</h2>
            {unverifiedClaims.length > 0 && (
              <section className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <h3 className="font-semibold text-amber-950">Claims not verified</h3>
                <p className="mt-1 text-sm text-amber-900">
                  No sufficiently relevant approved evidence was found. These claims are unverified, not necessarily false.
                </p>
                <ul className="mt-3 space-y-2">
                  {unverifiedClaims.map((claim, index) => (
                    <li key={`${claim.start_offset}-${claim.end_offset}-${index}`} className="text-sm text-amber-950">
                      <blockquote className="border-l-4 border-amber-400 pl-3">“{claim.quoted_span}”</blockquote>
                      <p className="mt-1 text-xs">{claim.reason}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {findings.length === 0 ? <p className="mt-3 text-sm text-slate-500">No findings to display.</p> : (
              <div className="mt-4 space-y-4">
                {findings.map((finding) => (
                  <article key={finding.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong>{finding.category.replaceAll("_", " ")}</strong>
                      <span className="rounded-full bg-amber-100 px-2 py-1 text-xs uppercase">{finding.severity}</span>
                    </div>
                    <blockquote className="mt-2 border-l-4 border-rose-400 pl-3">“{finding.quoted_span}”</blockquote>
                    {selected.body && (
                      <button
                        type="button"
                        className="mt-2 text-xs font-medium text-indigo-700 underline"
                        onClick={() =>
                          document
                            .getElementById(`finding-span-${finding.id}`)
                            ?.scrollIntoView({ behavior: "smooth", block: "center" })
                        }
                      >
                        Show highlighted text
                      </button>
                    )}
                    <p className="mt-2 text-sm">{finding.explanation}</p>
                    {finding.suggested_correction && <p className="mt-2 text-sm text-emerald-700">Suggested edit: {finding.suggested_correction}</p>}
                    <p className="mt-2 text-xs text-slate-500">Evidence: {finding.source_citation ?? "No citation"}</p>
                    {finding.rule_id && (
                      <Link
                        href={`/guidelines#source-rule-${finding.rule_id}`}
                        className="mt-1 inline-block text-xs font-medium text-indigo-700 underline"
                      >
                        Open cited rule
                      </Link>
                    )}
                    {finding.fact_id && (
                      <Link
                        href={`/facts#source-fact-${finding.fact_id}`}
                        className="mt-1 inline-block text-xs font-medium text-indigo-700 underline"
                      >
                        Open cited fact
                      </Link>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs text-white" onClick={() => decide(finding, "accept")} disabled={busy || finding.review_status !== "needs_human_judgment"}><Check className="h-3 w-3" /> Accept</button>
                      <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs" onClick={() => decide(finding, "reject")} disabled={busy || finding.review_status !== "needs_human_judgment"}>Reject</button>
                      <button className="inline-flex items-center gap-1 rounded-lg border border-amber-300 px-3 py-1.5 text-xs text-amber-800" onClick={() => decide(finding, "override")} disabled={busy || finding.review_status !== "needs_human_judgment"}><ShieldAlert className="h-3 w-3" /> Override</button>
                      <span className="text-xs text-slate-500">Status: {finding.review_status.replaceAll("_", " ")}</span>
                    </div>
                    {overrideFindingId === finding.id && (
                      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                        <label className="block text-sm font-medium" htmlFor={`override-reason-${finding.id}`}>
                          Reason for high-severity override
                        </label>
                        <textarea
                          id={`override-reason-${finding.id}`}
                          className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                          value={overrideReason}
                          onChange={(event) => setOverrideReason(event.target.value)}
                          minLength={3}
                          required
                        />
                        <div className="mt-2 flex gap-2">
                          <button
                            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs text-white disabled:opacity-50"
                            onClick={() => decide(finding, "override", overrideReason)}
                            disabled={busy || overrideReason.trim().length < 3}
                          >
                            Confirm override
                          </button>
                          <button
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
                            onClick={() => {
                              setOverrideFindingId(null);
                              setOverrideReason("");
                            }}
                            disabled={busy}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="mt-3 border-t border-slate-100 pt-3">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Decision history</h3>
                      {(decisionHistory[finding.id] ?? []).length === 0 ? (
                        <p className="mt-1 text-xs text-slate-500">No decisions recorded.</p>
                      ) : (
                        <ul className="mt-1 space-y-1 text-xs text-slate-600">
                          {decisionHistory[finding.id].map((entry) => (
                            <li key={entry.id}>
                              {entry.decision_type} · {new Date(entry.created_at).toLocaleString()}
                              {entry.decision_reason ? ` · ${entry.decision_reason}` : ""}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
            {selected.body && (
              <div className="mt-5">
                <h3 className="text-sm font-semibold">Submitted source</h3>
                <pre className="mt-2 max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-800">
                  {renderHighlightedText(selected.body, findings)}
                </pre>
              </div>
            )}
          </section>
        )}
      </div>
    </DashboardShell>
  );
}
