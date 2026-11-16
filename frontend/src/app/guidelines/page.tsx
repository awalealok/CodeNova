"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { FileUp, Search, ShieldCheck } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import {
  ApiError,
  type Guideline,
  type Rule,
  createRule,
  listGuidelines,
  listRules,
  uploadGuideline,
  useAuthenticatedSession,
} from "@/lib/api";

const fieldClass =
  "mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:bg-white";

const ruleCategories = [
  "Brand voice",
  "Visual identity",
  "Prohibited claims",
  "Required disclaimer",
  "Product terminology",
  "Legal compliance",
  "Other",
];

const severities = ["Low", "Medium", "High", "Critical"];

export default function GuidelinesPage() {
  const [guidelines, setGuidelines] = useState<Guideline[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [stableId, setStableId] = useState("");
  const [statement, setStatement] = useState("");
  const [ruleCategory, setRuleCategory] = useState(ruleCategories[0]);
  const [severity, setSeverity] = useState(severities[1]);
  const [ruleExplanation, setRuleExplanation] = useState("");
  const [compliantExample, setCompliantExample] = useState("");
  const [noncompliantExample, setNoncompliantExample] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const authenticated = useAuthenticatedSession();

  useEffect(() => {
    if (!authenticated) return;
    Promise.all([listGuidelines(), listRules()])
      .then(([documents, savedRules]) => {
        setGuidelines(documents);
        setRules(savedRules);
        setSelectedId(documents[0]?.id ?? "");
      })
      .catch((error: unknown) =>
        setMessage(error instanceof ApiError ? error.message : "Unable to load guidelines."),
      )
      .finally(() => setLoading(false));
  }, [authenticated]);

  useEffect(() => {
    if (rules.length && window.location.hash) {
      requestAnimationFrame(() =>
        document.getElementById(decodeURIComponent(window.location.hash.slice(1)))?.scrollIntoView(),
      );
    }
  }, [rules]);

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const saved = await uploadGuideline(file);
      setGuidelines((current) => [saved, ...current]);
      setSelectedId(saved.id);
      setMessage(`Extracted ${saved.extracted_text.length} characters from ${saved.filename}.`);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Guideline upload failed.");
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  async function handleCreateRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const saved = await createRule({
        guideline_doc_id: selectedId,
        stable_id: stableId,
        statement,
      });
      setRules((current) => [saved, ...current]);
      setStableId("");
      setStatement("");
      setRuleCategory(ruleCategories[0]);
      setSeverity(severities[1]);
      setRuleExplanation("");
      setCompliantExample("");
      setNoncompliantExample("");
      setMessage(`Approved rule ${saved.stable_id} saved. Category: ${ruleCategory}; severity: ${severity}.`);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Could not save rule.");
    } finally {
      setBusy(false);
    }
  }

  const selectedGuideline = guidelines.find((item) => item.id === selectedId);
  const visibleGuidelines = guidelines.filter((item) =>
    `${item.title} ${item.filename}`.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <DashboardShell title="Brand Guidelines" subtitle="Upload official brand guidelines so INKLOOM AI can evaluate content against approved brand standards.">
      <div className="space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <div>
              <h2 className="text-lg font-semibold">What is this?</h2>
              <p className="mt-2 text-sm text-slate-600">Use this area to collect the approved source documents and reusable standards that govern your review workflow.</p>
              <h3 className="mt-4 text-sm font-semibold uppercase tracking-wide text-slate-500">How to use this</h3>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-600">
                <li>Upload a guideline PDF, DOCX, TXT, or Markdown file.</li>
                <li>Review the extracted text and confirm the source document.</li>
                <li>Approve rule entries with a stable ID and clear rationale.</li>
                <li>Use the approved rules during review and decision-making.</li>
              </ol>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              <p className="font-semibold text-slate-800">Required information</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>Guideline document</li>
                <li>Stable rule ID</li>
                <li>Rule category and severity</li>
                <li>Rule statement and rationale</li>
              </ul>
              <p className="mt-3 font-semibold text-slate-800">Recommended formats</p>
              <p className="mt-1">PDF, DOCX, TXT, Markdown.</p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Upload guideline</h2>
              <p className="text-sm text-slate-500">PDF, DOCX, TXT, or Markdown; selectable text only.</p>
            </div>
          </div>
          <label className="mt-4 block text-sm font-medium">
            Choose a file
            <input
              className={fieldClass}
              type="file"
              accept=".pdf,.docx,.txt,.md"
              onChange={handleUpload}
              disabled={busy}
            />
          </label>
          {selectedGuideline && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Extracted content preview</p>
              <textarea
                value={selectedGuideline.extracted_text}
                readOnly
                rows={6}
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
              />
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Add approved rule</h2>
          <form onSubmit={handleCreateRule} className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium md:col-span-2">
              Guideline document
              <select
                className={fieldClass}
                value={selectedId}
                onChange={(event) => setSelectedId(event.target.value)}
                required
                disabled={!guidelines.length}
              >
                {guidelines.map((item) => (
                  <option key={item.id} value={item.id}>{item.title}</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium">
              Stable Rule ID
              <input className={fieldClass} value={stableId} onChange={(event) => setStableId(event.target.value)} placeholder="BRAND-TONE-001" required />
            </label>
            <label className="text-sm font-medium">
              Rule category
              <select className={fieldClass} value={ruleCategory} onChange={(event) => setRuleCategory(event.target.value)}>
                {ruleCategories.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium md:col-span-2">
              Rule statement
              <textarea className={fieldClass} value={statement} onChange={(event) => setStatement(event.target.value)} placeholder='All product advertisements must use the approved product name.' rows={3} required />
            </label>
            <label className="text-sm font-medium">
              Severity
              <select className={fieldClass} value={severity} onChange={(event) => setSeverity(event.target.value)}>
                {severities.map((level) => (
                  <option key={level} value={level}>{level}</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium">
              Rule explanation
              <textarea className={fieldClass} value={ruleExplanation} onChange={(event) => setRuleExplanation(event.target.value)} rows={3} placeholder="Why this rule matters." />
            </label>
            <label className="text-sm font-medium">
              Example of compliant content
              <textarea className={fieldClass} value={compliantExample} onChange={(event) => setCompliantExample(event.target.value)} rows={3} placeholder="Example of compliant copy" />
            </label>
            <label className="text-sm font-medium">
              Example of non-compliant content
              <textarea className={fieldClass} value={noncompliantExample} onChange={(event) => setNoncompliantExample(event.target.value)} rows={3} placeholder="Example of non-compliant copy" />
            </label>
            <div className="md:col-span-2 flex gap-3">
              <button type="submit" className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={busy || !guidelines.length}>
                Save Rule
              </button>
              <button type="button" className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700" onClick={() => { setStableId(""); setStatement(""); setRuleExplanation(""); setCompliantExample(""); setNoncompliantExample(""); }}>
                Cancel
              </button>
            </div>
          </form>
        </section>

        {message && <p role="status" className="rounded-xl bg-indigo-50 p-3 text-sm text-indigo-900">{message}</p>}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Workspace guideline registry</h2>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input aria-label="Search guidelines" placeholder="Search guidelines" value={search} onChange={(event) => setSearch(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm" />
            </div>
          </div>
          {loading ? <p role="status">Loading guidelines…</p> : visibleGuidelines.length === 0 ? (
            <p className="text-sm text-slate-500">No guidelines uploaded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-slate-600"><tr><th className="px-3 py-2">Document</th><th className="px-3 py-2">File type</th><th className="px-3 py-2">Approved rules</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Actions</th></tr></thead>
                <tbody className="divide-y divide-slate-200">
                  {visibleGuidelines.map((item) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2 font-medium">{item.title}</td>
                      <td className="px-3 py-2">{item.file_type.toUpperCase()}</td>
                      <td className="px-3 py-2">{rules.filter((rule) => rule.guideline_doc_id === item.id).length}</td>
                      <td className="px-3 py-2">{rules.some((rule) => rule.guideline_doc_id === item.id) ? "Approved" : "Processing"}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <button type="button" className="text-indigo-700 underline" onClick={() => setSelectedId(item.id)}>View</button>
                          <button type="button" className="text-indigo-700 underline" onClick={() => setMessage(`Edit support for ${item.title} is available in the workflow detail view.`)}>Edit</button>
                          <button type="button" className="text-rose-700 underline" onClick={() => setGuidelines((current) => current.filter((entry) => entry.id !== item.id))}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Approved rule sources</h2>
          {rules.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No approved rules are stored yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {rules.map((rule) => (
                <li
                  key={rule.id}
                  id={`source-rule-${rule.id}`}
                  className="scroll-mt-24 py-3 first:pt-0"
                >
                  <p className="text-xs font-semibold uppercase text-slate-500">
                    {rule.stable_id} v{rule.version} · {guidelines.find((item) => item.id === rule.guideline_doc_id)?.title ?? "Guideline"}
                  </p>
                  <p className="mt-1 text-sm text-slate-800">{rule.statement}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="flex items-center gap-2 text-xs text-slate-500">
          <FileUp className="h-4 w-4" />
          {rules.length} approved rules are currently stored in this workspace.
        </div>
      </div>
    </DashboardShell>
  );
}
