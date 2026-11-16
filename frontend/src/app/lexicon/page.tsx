"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Search, Sparkles } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import {
  ApiError,
  type LexiconEntry,
  createLexiconEntry,
  listLexicon,
  useAuthenticatedSession,
} from "@/lib/api";

const fieldClass =
  "mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:bg-white";

export default function LexiconPage() {
  const [entries, setEntries] = useState<LexiconEntry[]>([]);
  const [term, setTerm] = useState("");
  const [replacement, setReplacement] = useState("");
  const [explanation, setExplanation] = useState("");
  const [category, setCategory] = useState<LexiconEntry["term_category"]>("avoid");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const authenticated = useAuthenticatedSession();

  useEffect(() => {
    if (!authenticated) return;
    listLexicon()
      .then(setEntries)
      .catch((error: unknown) =>
        setMessage(error instanceof ApiError ? error.message : "Unable to load terminology."),
      )
      .finally(() => setLoading(false));
  }, [authenticated]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const saved = await createLexiconEntry({
        term,
        term_category: category,
        preferred_replacement: replacement || undefined,
        explanation: explanation || undefined,
      });
      setEntries((current) => [...current, saved]);
      setTerm("");
      setReplacement("");
      setExplanation("");
      setMessage("Terminology entry saved.");
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Could not save term.");
    } finally {
      setBusy(false);
    }
  }

  const visibleEntries = entries.filter((entry) =>
    `${entry.term} ${entry.preferred_replacement ?? ""}`.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <DashboardShell title="Brand Lexicon" subtitle="Record terminology to avoid and preferred replacements.">
      <div className="space-y-6">
        <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-semibold">Add terminology</h2>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium">Term<input className={fieldClass} value={term} onChange={(event) => setTerm(event.target.value)} required /></label>
            <label className="text-sm font-medium">Category<select className={fieldClass} value={category} onChange={(event) => setCategory(event.target.value as LexiconEntry["term_category"])}><option value="avoid">Avoid</option><option value="banned">Banned</option><option value="preferred">Preferred</option></select></label>
            <label className="text-sm font-medium">Preferred replacement<input className={fieldClass} value={replacement} onChange={(event) => setReplacement(event.target.value)} /></label>
            <label className="text-sm font-medium">Explanation<input className={fieldClass} value={explanation} onChange={(event) => setExplanation(event.target.value)} /></label>
          </div>
          <button className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={busy}>{busy ? "Saving…" : "Save terminology"}</button>
        </form>

        {message && <p role="status" className="rounded-xl bg-indigo-50 p-3 text-sm text-indigo-900">{message}</p>}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Workspace lexicon</h2>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input aria-label="Search lexicon" placeholder="Search terminology" value={search} onChange={(event) => setSearch(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm" />
            </div>
          </div>
          {loading ? <p role="status">Loading terminology…</p> : visibleEntries.length === 0 ? (
            <p className="text-sm text-slate-500">No terminology entries yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-slate-600"><tr><th className="px-3 py-2">Term</th><th className="px-3 py-2">Category</th><th className="px-3 py-2">Replacement</th><th className="px-3 py-2">Explanation</th></tr></thead>
                <tbody className="divide-y divide-slate-200">
                  {visibleEntries.map((entry) => (
                    <tr key={entry.id}>
                      <td className="px-3 py-2 font-medium">{entry.term}</td>
                      <td className="px-3 py-2">{entry.term_category}</td>
                      <td className="px-3 py-2">{entry.preferred_replacement ?? "—"}</td>
                      <td className="px-3 py-2">{entry.explanation ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
