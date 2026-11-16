"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { FileText, FolderUp, Search, Send } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import {
  ApiError,
  type ContentItem,
  type Finding,
  runReview,
  listContent,
  submitContent,
  uploadContent,
  useAuthenticatedSession,
} from "@/lib/api";

const fieldClass =
  "mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:bg-white";

export default function ContentPage() {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [title, setTitle] = useState("");
  const [channel, setChannel] = useState("email");
  const [contentType, setContentType] = useState("campaign");
  const [provenance, setProvenance] = useState("human-written");
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ContentItem | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const authenticated = useAuthenticatedSession();

  useEffect(() => {
    if (!authenticated) return;
    listContent()
      .then(setItems)
      .catch((error: unknown) =>
        setMessage(error instanceof ApiError ? error.message : "Unable to load submissions."),
      )
      .finally(() => setLoading(false));
  }, [authenticated]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const saved = file
        ? await uploadContent(file, { title: title || undefined, channel, content_type: contentType })
        : await submitContent({ title, body, channel, content_type: contentType, provenance });
      setItems((current) => [saved, ...current]);
      setSelected(saved);
      setFindings([]);
      setTitle("");
      setBody("");
      setFile(null);
      setMessage("Submission saved and queued for processing.");
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Content submission failed.");
    } finally {
      setBusy(false);
    }
  }

  async function review(item: ContentItem) {
    setBusy(true);
    setSelected(item);
    try {
      const result = await runReview(item.id);
      setFindings(result.findings);
      setItems((current) => current.map((entry) => (entry.id === item.id ? result.content : entry)));
      setMessage(
        result.ai.error
          ? `Deterministic review saved. AI error: ${result.ai.error}`
          : `Review saved with ${result.findings.length} findings.`,
      );
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Review request failed.");
    } finally {
      setBusy(false);
    }
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
  }

  function handleDownload(item: ContentItem) {
    if (!item.body) {
      setMessage("This submission does not include copied text to download.");
      return;
    }
    const blob = new Blob([item.body], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(item.title || "submission").replace(/\s+/g, "-").toLowerCase()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage(`Downloaded ${item.title}.`);
  }

  function handleDelete(itemId: string) {
    setItems((current) => current.filter((item) => item.id !== itemId));
    if (selected?.id === itemId) {
      setSelected(null);
      setFindings([]);
    }
    const item = items.find((entry) => entry.id === itemId);
    setMessage(item ? `${item.title} was removed from the workspace.` : "Submission removed.");
  }

  const visibleItems = items.filter((item) =>
    item.title.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <DashboardShell title="My Content" subtitle="Manage all uploaded content, documents and compliance submissions.">
      <div className="space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 xl:grid-cols-[1.4fr_0.8fr]">
            <div>
              <h2 className="text-lg font-semibold">What is this?</h2>
              <p className="mt-2 text-sm text-slate-600">
                Use this workspace to collect new marketing copy, uploads, and source documents before running evidence-grounded compliance review.
              </p>
              <h3 className="mt-4 text-sm font-semibold uppercase tracking-wide text-slate-500">How to use this</h3>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-600">
                <li>Select or enter content in the submission form.</li>
                <li>Upload a PDF, DOCX, TXT, or Markdown file when needed.</li>
                <li>Choose a content channel and review context.</li>
                <li>Submit content and review the saved findings.</li>
              </ol>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              <p className="font-semibold text-slate-800">Required information</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>Document title</li>
                <li>Channel or campaign context</li>
                <li>Body text or supported file</li>
                <li>Content type and provenance</li>
              </ul>
              <p className="mt-3 font-semibold text-slate-800">Examples</p>
              <p className="mt-1">Social caption, website headline, product description, campaign brief.</p>
              <p className="mt-3 font-semibold text-slate-800">Recommended file formats</p>
              <p className="mt-1">PDF, DOCX, TXT, Markdown.</p>
            </div>
          </div>
        </section>

        <form onSubmit={handleSubmit} className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Content submission</h2>
              <button className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={busy}>
                <Send className="h-4 w-4" /> {busy ? "Saving…" : "Submit content"}
              </button>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium sm:col-span-2">Title<input className={fieldClass} value={title} onChange={(event) => setTitle(event.target.value)} required={!file} /></label>
              <label className="text-sm font-medium">Channel<select className={fieldClass} value={channel} onChange={(event) => setChannel(event.target.value)}><option value="email">Email</option><option value="web">Website</option><option value="social">Social</option><option value="print">Print</option></select></label>
              <label className="text-sm font-medium">Content type<select className={fieldClass} value={contentType} onChange={(event) => setContentType(event.target.value)}><option value="campaign">Campaign</option><option value="announcement">Announcement</option><option value="case-study">Case study</option><option value="newsletter">Newsletter</option></select></label>
              <label className="text-sm font-medium">Provenance<select className={fieldClass} value={provenance} onChange={(event) => setProvenance(event.target.value)}><option value="human-written">Human-written</option><option value="AI-assisted">AI-assisted</option><option value="agency-created">Agency-created</option></select></label>
              <label className="text-sm font-medium sm:col-span-2">Body copy<textarea className={fieldClass} rows={8} value={body} onChange={(event) => setBody(event.target.value)} required={!file} /></label>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Document intake</h2>
            <div className="mt-5 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-5 text-center">
              <FolderUp className="mx-auto h-8 w-8 text-indigo-600" />
              <label className="mt-3 block text-sm font-medium">
                Choose PDF, DOCX, TXT, or Markdown
                <input className={fieldClass} type="file" accept=".pdf,.docx,.txt,.md" onChange={chooseFile} disabled={busy} />
              </label>
              {file && <p className="mt-2 text-xs text-slate-600">Selected: {file.name}</p>}
              <p className="mt-3 text-xs text-slate-500">Files are validated and text extraction runs on the backend.</p>
            </div>
            <p className="mt-4 flex items-center gap-2 text-xs text-slate-500">
              <FileText className="h-4 w-4" /> Maximum file size: 15 MB.
            </p>
          </section>
        </form>

        {message && <p role="status" className="rounded-xl bg-indigo-50 p-3 text-sm text-indigo-900">{message}</p>}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Recent submissions</h2>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input aria-label="Search submissions" placeholder="Search submissions" value={search} onChange={(event) => setSearch(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm" />
            </div>
          </div>
          {loading ? <p role="status">Loading submissions…</p> : visibleItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              No content has been submitted yet. Add a campaign brief, product description, or document upload to get started.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-slate-600"><tr><th className="px-3 py-2">Title</th><th className="px-3 py-2">Channel</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Findings</th><th className="px-3 py-2">Actions</th></tr></thead>
                <tbody className="divide-y divide-slate-200">
                  {visibleItems.map((item) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2 font-medium">{item.title}</td>
                      <td className="px-3 py-2">{item.channel ?? "—"}</td>
                      <td className="px-3 py-2">{item.workflow_status.replaceAll("_", " ")}</td>
                      <td className="px-3 py-2">{item.finding_count ?? "—"}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-2">
                          <button type="button" className="text-indigo-700 underline" onClick={() => setSelected(item)} disabled={busy}>View document</button>
                          <button type="button" className="text-indigo-700 underline" onClick={() => review(item)} disabled={busy}>Open analysis</button>
                          <button type="button" className="text-indigo-700 underline" onClick={() => handleDownload(item)} disabled={busy}>Download</button>
                          <button type="button" className="text-rose-700 underline" onClick={() => handleDelete(item.id)} disabled={busy}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {selected && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Findings: {selected.title}</h2>
            {findings.length === 0 ? <p className="mt-3 text-sm text-slate-500">No findings returned for this review yet. Run the review to populate this section.</p> : (
              <div className="mt-4 space-y-3">
                {findings.map((finding) => (
                  <article key={finding.id} className="rounded-xl border border-slate-200 p-4">
                    <p className="font-semibold">{finding.category.replaceAll("_", " ")} · {finding.severity}</p>
                    <blockquote className="mt-2 border-l-4 border-rose-400 pl-3">“{finding.quoted_span}”</blockquote>
                    <p className="mt-2 text-sm">{finding.explanation}</p>
                    {finding.suggested_correction && <p className="mt-2 text-sm text-emerald-700">Suggested edit: {finding.suggested_correction}</p>}
                    <p className="mt-2 text-xs text-slate-500">Evidence: {finding.source_citation ?? "No citation"}</p>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </DashboardShell>
  );
}
