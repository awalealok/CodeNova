"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Search, ShieldCheck } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { ApiError, type ApprovedFact, createFact, listFacts, useAuthenticatedSession } from "@/lib/api";

const fieldClass =
  "mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:bg-white";

export default function FactsPage() {
  const [facts, setFacts] = useState<ApprovedFact[]>([]);
  const [claimTitle, setClaimTitle] = useState("");
  const [statement, setStatement] = useState("");
  const [productName, setProductName] = useState("");
  const [source, setSource] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const authenticated = useAuthenticatedSession();

  useEffect(() => {
    if (!authenticated) return;
    listFacts()
      .then(setFacts)
      .catch((error: unknown) =>
        setMessage(error instanceof ApiError ? error.message : "Unable to load approved facts."),
      )
      .finally(() => setLoading(false));
  }, [authenticated]);

  useEffect(() => {
    if (facts.length && window.location.hash) {
      requestAnimationFrame(() =>
        document.getElementById(decodeURIComponent(window.location.hash.slice(1)))?.scrollIntoView(),
      );
    }
  }, [facts]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const saved = await createFact({
        statement,
        source_reference: source || undefined,
        valid_from: validFrom || undefined,
        valid_until: validUntil || undefined,
      });
      setFacts((current) => [saved, ...current]);
      setClaimTitle("");
      setStatement("");
      setProductName("");
      setSource("");
      setValidFrom("");
      setValidUntil("");
      setMessage(`Approved fact saved${claimTitle ? `: ${claimTitle}` : ""}.`);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Could not save fact.");
    } finally {
      setBusy(false);
    }
  }

  const visibleFacts = facts.filter((item) =>
    `${item.statement} ${item.source_reference ?? ""}`.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <DashboardShell title="Facts & Claims" subtitle="Store verified product facts and approved marketing claims. INKLOOM AI uses this information to detect unsupported statements.">
      <div className="space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <div>
              <h2 className="text-lg font-semibold">What is this?</h2>
              <p className="mt-2 text-sm text-slate-600">Use approved facts and claims to ground the review engine in evidence the brand has already accepted.</p>
              <h3 className="mt-4 text-sm font-semibold uppercase tracking-wide text-slate-500">How to use this</h3>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-600">
                <li>Add a clear claim title and product name when relevant.</li>
                <li>Record the exact factual statement and supporting source.</li>
                <li>Set date validity if the claim expires or changes.</li>
                <li>Use approved facts to validate or reject unsupported claims.</li>
              </ol>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              <p className="font-semibold text-slate-800">Required information</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>Claim title</li>
                <li>Claim statement</li>
                <li>Product or service</li>
                <li>Verified source reference</li>
              </ul>
              <p className="mt-3 font-semibold text-slate-800">Example inputs</p>
              <p className="mt-1">"Removes up to 99.9% of bacteria"; product: AquaPure Pro.</p>
            </div>
          </div>
        </section>

        <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-semibold">Add approved fact</h2>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium">
              Claim title
              <input className={fieldClass} value={claimTitle} onChange={(event) => setClaimTitle(event.target.value)} placeholder="Water filtration performance" />
            </label>
            <label className="text-sm font-medium">
              Product or service
              <input className={fieldClass} value={productName} onChange={(event) => setProductName(event.target.value)} placeholder="AquaPure" />
            </label>
            <label className="text-sm font-medium md:col-span-2">
              Factual statement
              <textarea className={fieldClass} value={statement} onChange={(event) => setStatement(event.target.value)} required minLength={3} rows={3} />
            </label>
            <label className="text-sm font-medium">
              Source reference
              <input className={fieldClass} value={source} onChange={(event) => setSource(event.target.value)} placeholder="Internal test report or approved brief" />
            </label>
            <label className="text-sm font-medium">Valid from<input className={fieldClass} type="date" value={validFrom} onChange={(event) => setValidFrom(event.target.value)} /></label>
            <label className="text-sm font-medium">Valid until<input className={fieldClass} type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} min={validFrom || undefined} /></label>
          </div>
          <button className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={busy}>
            {busy ? "Saving…" : "Save approved fact"}
          </button>
        </form>

        {message && <p role="status" className="rounded-xl bg-indigo-50 p-3 text-sm text-indigo-900">{message}</p>}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Fact register</h2>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input aria-label="Search facts" placeholder="Search facts" value={search} onChange={(event) => setSearch(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm" />
            </div>
          </div>
          {loading ? <p role="status">Loading facts…</p> : visibleFacts.length === 0 ? (
            <p className="text-sm text-slate-500">No approved facts are stored yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-slate-600"><tr><th className="px-3 py-2">Statement</th><th className="px-3 py-2">Source</th><th className="px-3 py-2">Validity</th></tr></thead>
                <tbody className="divide-y divide-slate-200">
                  {visibleFacts.map((item) => (
                    <tr key={item.id} id={`source-fact-${item.id}`} className="scroll-mt-24">
                      <td className="px-3 py-2 font-medium">{item.statement}</td>
                      <td className="px-3 py-2">{item.source_reference ?? "—"}</td>
                      <td className="px-3 py-2">{item.valid_from ?? "Any"} – {item.valid_until ?? "no expiry"}</td>
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
