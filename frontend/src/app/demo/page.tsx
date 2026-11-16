"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import {
  ApiError,
  type AiStatus,
  type ApiUser,
  type ContentItem,
  type Finding,
  type Guideline,
  createFact,
  createLexiconEntry,
  createRule,
  decideFinding,
  getAiStatus,
  getCurrentUser,
  runReview,
  setSessionAuthenticated,
  signOut,
  signIn,
  signUp,
  submitContent,
  uploadGuideline,
  useAuthenticatedSession,
} from "@/lib/api";

const card = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";
const input = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900";
const button =
  "rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50";

function messageFrom(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : error instanceof Error
      ? error.message
      : "The request could not be completed.";
}

export default function DemoPage() {
  const authenticated = useAuthenticatedSession();
  const [user, setUser] = useState<ApiUser | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [workspace, setWorkspace] = useState("Nexora");
  const [register, setRegister] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Create a workspace or sign in to start the review workflow.");
  const [ai, setAi] = useState<AiStatus | null>(null);
  const [guideline, setGuideline] = useState<Guideline | null>(null);
  const [rule, setRule] = useState("Banned term: best in the market");
  const [stableId, setStableId] = useState("BR-001");
  const [fact, setFact] = useState("The product serves 12 countries.");
  const [source, setSource] = useState("Approved product fact sheet");
  const [term, setTerm] = useState("revolutionary");
  const [replacement, setReplacement] = useState("innovative");
  const [title, setTitle] = useState("Spring product campaign");
  const [body, setBody] = useState(
    "We are the best in the market. Our product serves 12 countries. This revolutionary platform helps teams work faster.",
  );
  const [content, setContent] = useState<ContentItem | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [overrideFindingId, setOverrideFindingId] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState("");

  useEffect(() => {
    if (!authenticated) return;
    Promise.all([getCurrentUser(), getAiStatus()])
      .then(([currentUser, aiStatus]) => {
        setUser(currentUser);
        setAi(aiStatus);
        setMessage(`Signed in as ${currentUser.name} (${currentUser.role}).`);
      })
      .catch((error: unknown) => {
        setMessage(messageFrom(error));
        if (error instanceof ApiError && error.status === 401) {
          setSessionAuthenticated(false);
        }
      });
  }, [authenticated]);

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = register
        ? await signUp({ workspace_name: workspace, full_name: name, email, password })
        : await signIn(email, password);
      setSessionAuthenticated(true);
      setMessage(`Signed in as ${result.user.name} (${result.user.role}).`);
    } catch (error) {
      setMessage(messageFrom(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const result = await uploadGuideline(file);
      setGuideline(result);
      setMessage(`Guideline extracted: ${result.extracted_text.length} characters.`);
    } catch (error) {
      setMessage(messageFrom(error));
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  async function handleAddRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!guideline) {
      setMessage("Upload a guideline before adding a rule.");
      return;
    }
    setBusy(true);
    try {
      await createRule({
        guideline_doc_id: guideline.id,
        stable_id: stableId,
        statement: rule,
      });
      setMessage("Approved rule saved.");
    } catch (error) {
      setMessage(messageFrom(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleAddFact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await createFact({ statement: fact, source_reference: source });
      setMessage("Approved fact saved.");
    } catch (error) {
      setMessage(messageFrom(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleAddTerm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await createLexiconEntry({
        term,
        term_category: "avoid",
        preferred_replacement: replacement,
        explanation: "Avoid unsupported superlative language.",
      });
      setMessage("Terminology entry saved.");
    } catch (error) {
      setMessage(messageFrom(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmitContent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await submitContent({
        title,
        body,
        channel: "web",
        content_type: "campaign",
        provenance: "AI-assisted",
      });
      setContent(result);
      setFindings([]);
      setMessage("Content submitted. Run review to inspect it.");
    } catch (error) {
      setMessage(messageFrom(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleReview() {
    if (!content) return;
    setBusy(true);
    try {
      const result = await runReview(content.id);
      setFindings(result.findings);
      setOverrideFindingId(null);
      setOverrideReason("");
      setContent(result.content);
      setAi((current) =>
        current
          ? { ...current, enabled: result.ai.enabled, model: result.ai.model ?? current.model }
          : current,
      );
      setMessage(
        result.ai.error
          ? `Review saved with deterministic results. AI review failed: ${result.ai.error}`
          : `Review complete: ${result.findings.length} evidence-backed findings.`,
      );
    } catch (error) {
      setMessage(messageFrom(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleDecision(
    finding: Finding,
    decisionType: "accept" | "reject" | "override",
    overrideReasonInput?: string,
  ) {
    let reason: string | undefined;
    if (decisionType === "override" && ["high", "critical"].includes(finding.severity)) {
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
      const decision = await decideFinding(finding.id, decisionType, reason);
      setFindings((current) =>
        current.map((item) =>
          item.id === finding.id ? { ...item, review_status: decision.new_status } : item,
        ),
      );
      const decisionLabel = {
        accept: "accepted",
        reject: "rejected",
        override: "overridden",
      }[decisionType];
      setMessage(`Finding ${decisionLabel} and saved.`);
      setOverrideFindingId(null);
      setOverrideReason("");
    } catch (error) {
      setMessage(messageFrom(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    setBusy(true);
    try {
      await signOut();
      setSessionAuthenticated(false);
    } catch (error) {
      setMessage(messageFrom(error));
      return;
    } finally {
      setBusy(false);
    }
    setUser(null);
    setGuideline(null);
    setContent(null);
    setFindings([]);
    setOverrideFindingId(null);
    setOverrideReason("");
    setMessage("You have signed out.");
  }

  const vectorReviewReady = Boolean(
    ai?.enabled && ai.embedding_configured && ai.vector_store_available,
  );
  const aiStatusLabel = !ai
    ? "Checking AI/vector readiness…"
    : !ai.vector_store_available
      ? "Deterministic checks only · PostgreSQL pgvector unavailable"
      : !ai.embedding_configured
        ? "Deterministic checks only · Configure the embedding provider"
        : !ai.enabled
          ? "Deterministic checks only · Configure the LLM provider"
          : `LLM and vector providers configured · ${ai.model ?? "provider"} (connectivity not checked)`;

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900">
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="rounded-2xl bg-slate-950 p-6 text-white">
          <p className="text-xs font-semibold uppercase tracking-[.25em] text-indigo-300">
            Team Nexora · Round 2
          </p>
          <h1 className="mt-2 text-3xl font-bold">INKLOOM AI</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">
            Review brand content against approved workspace evidence. Findings are advisory and
            require a human decision.
          </p>
        </header>

        {!authenticated ? (
          <section className={card}>
            <h2 className="text-xl font-bold">{register ? "Create workspace" : "Sign in"}</h2>
            <form onSubmit={handleAuth} className="mt-4 grid gap-3 sm:grid-cols-2">
              {register && (
                <>
                  <label className="text-sm">
                    Workspace name
                    <input
                      className={input}
                      value={workspace}
                      onChange={(event) => setWorkspace(event.target.value)}
                      minLength={2}
                      required
                    />
                  </label>
                  <label className="text-sm">
                    Your name
                    <input
                      className={input}
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      minLength={2}
                      required
                    />
                  </label>
                </>
              )}
              <label className="text-sm">
                Email
                <input
                  className={input}
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </label>
              <label className="text-sm">
                Password
                <input
                  className={input}
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={register ? 10 : 1}
                  required
                />
              </label>
              <div className="flex items-center gap-3">
                <button className={button} disabled={busy}>
                  {busy ? "Working…" : register ? "Create workspace" : "Sign in"}
                </button>
                <button
                  type="button"
                  className="text-sm text-indigo-700 underline"
                  onClick={() => setRegister((value) => !value)}
                >
                  {register ? "Already registered? Sign in" : "Create a workspace"}
                </button>
              </div>
            </form>
          </section>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-700">
                Signed in as <strong>{user?.name ?? "Workspace user"}</strong>
                {user ? ` · ${user.role}` : ""}
              </p>
              <button
                className="text-sm text-slate-600 underline"
                onClick={handleSignOut}
                disabled={busy}
              >
                Sign out
              </button>
            </div>

            <section className={card}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-bold">1. Knowledge setup</h2>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    vectorReviewReady
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {aiStatusLabel}
                </span>
              </div>
              <label className="mt-3 block text-sm">
                Upload guideline PDF, DOCX, TXT, or Markdown
                <input
                  className={input}
                  type="file"
                  accept=".pdf,.docx,.txt,.md"
                  onChange={handleUpload}
                  disabled={busy}
                />
              </label>
              {guideline && (
                <p className="mt-2 text-sm text-emerald-700">
                  Saved: {guideline.filename} · {guideline.extracted_text.length} extracted
                  characters
                </p>
              )}
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <form onSubmit={handleAddRule} className="rounded-xl bg-slate-50 p-3">
                  <h3 className="font-semibold">Approved rule</h3>
                  <input
                    className={input}
                    value={stableId}
                    onChange={(event) => setStableId(event.target.value)}
                    aria-label="Stable rule ID"
                    required
                  />
                  <textarea
                    className={input}
                    value={rule}
                    onChange={(event) => setRule(event.target.value)}
                    aria-label="Rule statement"
                    required
                  />
                  <button className={`${button} mt-3`} disabled={busy || !guideline}>
                    Save rule
                  </button>
                </form>
                <form onSubmit={handleAddFact} className="rounded-xl bg-slate-50 p-3">
                  <h3 className="font-semibold">Approved fact</h3>
                  <textarea
                    className={input}
                    value={fact}
                    onChange={(event) => setFact(event.target.value)}
                    aria-label="Fact statement"
                    required
                  />
                  <input
                    className={input}
                    value={source}
                    onChange={(event) => setSource(event.target.value)}
                    aria-label="Fact source reference"
                    placeholder="Source reference"
                  />
                  <button className={`${button} mt-3`} disabled={busy}>
                    Save fact
                  </button>
                </form>
                <form onSubmit={handleAddTerm} className="rounded-xl bg-slate-50 p-3">
                  <h3 className="font-semibold">Terminology to avoid</h3>
                  <input
                    className={input}
                    value={term}
                    onChange={(event) => setTerm(event.target.value)}
                    aria-label="Term to avoid"
                    required
                  />
                  <input
                    className={input}
                    value={replacement}
                    onChange={(event) => setReplacement(event.target.value)}
                    aria-label="Preferred replacement"
                  />
                  <button className={`${button} mt-3`} disabled={busy}>
                    Save term
                  </button>
                </form>
              </div>
            </section>

            <section className={card}>
              <h2 className="text-lg font-bold">2. Submit content</h2>
              <form onSubmit={handleSubmitContent} className="mt-3 space-y-3">
                <label className="block text-sm">
                  Title
                  <input
                    className={input}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    required
                  />
                </label>
                <label className="block text-sm">
                  Content
                  <textarea
                    className={`${input} min-h-36`}
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    required
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button className={button} disabled={busy}>
                    Submit content
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-indigo-200 px-4 py-2 text-sm font-semibold text-indigo-700"
                    onClick={() =>
                      setBody(
                        "We are the best in the market. Our product serves 12 countries. This revolutionary platform helps teams work faster.",
                      )
                    }
                    disabled={busy}
                  >
                    Load sample copy
                  </button>
                </div>
              </form>
              {content && (
                <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 p-3 text-sm">
                  <span>
                    Submitted: <strong>{content.title}</strong>
                  </span>
                  <button className={button} onClick={handleReview} disabled={busy}>
                    {busy ? "Reviewing…" : "Run brand review"}
                  </button>
                </div>
              )}
            </section>

            <section className={card}>
              <h2 className="text-lg font-bold">3. Findings and reviewer decisions</h2>
              {findings.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">
                  No findings yet. Submit content and run a review.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {findings.map((finding) => (
                    <article
                      key={finding.id}
                      className="rounded-xl border border-slate-200 p-4"
                    >
                      <div className="flex flex-wrap justify-between gap-2">
                        <strong>{finding.category.replaceAll("_", " ")}</strong>
                        <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold uppercase text-amber-800">
                          {finding.severity}
                        </span>
                      </div>
                      <blockquote className="mt-2 border-l-4 border-rose-400 pl-3 text-sm font-medium">
                        “{finding.quoted_span}”
                      </blockquote>
                      <p className="mt-2 text-sm">{finding.explanation}</p>
                      {finding.suggested_correction && (
                        <p className="mt-2 text-sm text-emerald-700">
                          Suggested edit: {finding.suggested_correction}
                        </p>
                      )}
                      <p className="mt-2 text-xs text-slate-500">
                        Evidence: {finding.source_citation ?? "No citation supplied"} · Confidence:{" "}
                        {(finding.confidence_score * 100).toFixed(0)}%
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {(["accept", "reject", "override"] as const).map((decision) => (
                          <button
                            key={decision}
                            className={button}
                            onClick={() => handleDecision(finding, decision)}
                            disabled={busy || finding.review_status !== "needs_human_judgment"}
                          >
                            {decision[0].toUpperCase() + decision.slice(1)}
                          </button>
                        ))}
                        <span className="text-xs text-slate-500">
                          Status: {finding.review_status.replaceAll("_", " ")}
                        </span>
                      </div>
                      {overrideFindingId === finding.id && (
                        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                          <label className="block text-sm font-medium" htmlFor={`override-reason-${finding.id}`}>
                            Reason for high-severity override
                          </label>
                          <textarea
                            id={`override-reason-${finding.id}`}
                            className={`${input} mt-2 bg-white`}
                            value={overrideReason}
                            onChange={(event) => setOverrideReason(event.target.value)}
                            minLength={3}
                            required
                          />
                          <div className="mt-2 flex gap-2">
                            <button
                              className={button}
                              onClick={() => handleDecision(finding, "override", overrideReason)}
                              disabled={busy || overrideReason.trim().length < 3}
                            >
                              Confirm override
                            </button>
                            <button
                              className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
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
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        <p role="status" className="rounded-xl bg-indigo-50 p-3 text-sm text-indigo-900">
          {message}
        </p>
        <footer className="text-center text-xs text-slate-500">
          INKLOOM AI · Findings are advisory; human approval remains required.
        </footer>
      </div>
    </main>
  );
}
