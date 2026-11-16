"use client";

import { useSyncExternalStore } from "react";

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
).replace(/\/$/, "");
const SESSION_KEY = "inkloom_session_present";
const SESSION_EVENT = "inkloom-session-change";
export const DEMO_AUTH_MODE = process.env.NEXT_PUBLIC_DEMO_AUTH_MODE === "true";

export type UserRole = "creator" | "reviewer" | "brand_manager" | "admin";

export interface ApiUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  workspace_id: string;
  workspace_name: string;
}

export interface Guideline {
  id: string;
  title: string;
  filename: string;
  file_type: string;
  version: number;
  extracted_text: string;
  created_at: string;
}

export interface Rule {
  id: string;
  guideline_doc_id: string;
  stable_id: string;
  statement: string;
  version: number;
  created_at: string;
}

export interface ApprovedFact {
  id: string;
  statement: string;
  source_reference: string | null;
  valid_from: string | null;
  valid_until: string | null;
  created_at: string;
}

export interface LexiconEntry {
  id: string;
  term: string;
  term_category: "banned" | "avoid" | "preferred";
  preferred_replacement: string | null;
  explanation: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ContentItem {
  id: string;
  title: string;
  channel: string | null;
  content_type: string;
  provenance: string | null;
  workflow_status: string;
  body: string | null;
  revision_number: number | null;
  finding_count?: number;
  created_at: string;
  updated_at: string;
}

export interface Finding {
  id: string;
  content_id: string;
  revision_id: string;
  rule_id: string | null;
  fact_id: string | null;
  category: string;
  finding_category: string;
  severity: string;
  quoted_span: string;
  start_offset: number;
  end_offset: number;
  explanation: string;
  suggested_correction: string | null;
  confidence_score: number;
  source_citation: string | null;
  review_status: string;
  created_at: string;
}

export interface Decision {
  id: string;
  finding_id: string;
  decision_type: "accept" | "reject" | "override";
  decision_reason: string | null;
  previous_status: string | null;
  new_status: string;
  decided_by: string;
  created_at: string;
}

export interface AuditEvent {
  id: string;
  event_type: string;
  entity_type: string;
  entity_id: string;
  action_description: string;
  metadata: Record<string, unknown>;
  actor_id: string | null;
  created_at: string;
}

export interface BrandAsset {
  id: string;
  name: string;
  asset_type: string;
  description: string | null;
  version: number;
  is_active: boolean;
  file_url: string;
  created_at: string;
}

export interface AiStatus {
  enabled: boolean;
  provider: string;
  model: string | null;
  embedding_configured: boolean;
  vector_store_available: boolean;
  note: string;
}

export interface UnverifiedClaim {
  quoted_span: string;
  start_offset: number;
  end_offset: number;
  reason: string;
}

export interface ReviewResponse {
  content: ContentItem;
  findings: Finding[];
  ai: {
    enabled: boolean;
    provider?: string;
    model?: string | null;
    error?: string;
    message?: string;
    retrieved_evidence_count?: number;
    rejected_uncited_findings?: number;
    unverified_claims?: UnverifiedClaim[];
  };
}

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function isSessionAuthenticated(): boolean {
  return typeof window !== "undefined" && window.sessionStorage.getItem(SESSION_KEY) === "true";
}

export function setSessionAuthenticated(authenticated: boolean): void {
  if (typeof window === "undefined") return;
  if (authenticated) window.sessionStorage.setItem(SESSION_KEY, "true");
  else window.sessionStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new Event(SESSION_EVENT));
}

function subscribeToSession(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener("storage", listener);
  window.addEventListener(SESSION_EVENT, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(SESSION_EVENT, listener);
  };
}

export function useAuthenticatedSession(): boolean {
  return useSyncExternalStore(subscribeToSession, isSessionAuthenticated, () => false);
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (
    init.body &&
    !(typeof FormData !== "undefined" && init.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
      credentials: "include",
    });
  } catch {
    throw new ApiError("Could not reach the INKLOOM AI backend.", 0);
  }

  const responseText = await response.text();
  let body: unknown;
  try {
    body = responseText ? JSON.parse(responseText) : null;
  } catch {
    if (response.ok) {
      throw new ApiError("The backend returned an invalid response.", response.status);
    }
    body = responseText;
  }

  if (!response.ok) {
    const detail =
      typeof body === "object" && body !== null && "detail" in body
        ? (body as { detail: unknown }).detail
        : body;
    throw new ApiError(
      typeof detail === "string" ? detail : `Request failed (${response.status}).`,
      response.status,
    );
  }
  return body as T;
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  body: JSON.stringify(body),
});

export function signIn(email: string, password: string) {
  return apiRequest<{ user: ApiUser }>(
    "/api/auth/login",
    json({ email, password }),
  );
}

export function signUp(input: {
  full_name: string;
  email: string;
  password: string;
  workspace_name: string;
}) {
  return apiRequest<{ user: ApiUser }>(
    "/api/auth/register",
    json(input),
  );
}

export const signOut = () =>
  apiRequest<{ status: string }>("/api/auth/logout", { method: "POST" });

export const getCurrentUser = () => apiRequest<ApiUser>("/api/auth/me");
export const updateProfile = (input: { full_name?: string; email?: string }) =>
  apiRequest<ApiUser>("/api/auth/me", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
export const requestPasswordReset = (email: string) =>
  apiRequest<{ status: string }>(
    "/api/auth/password-reset/request",
    json({ email }),
  );
export const confirmPasswordReset = (token: string, new_password: string) =>
  apiRequest<{ status: string }>(
    "/api/auth/password-reset/confirm",
    json({ token, new_password }),
  );
export const getAiStatus = () => apiRequest<AiStatus>("/api/ai/status");
export const listGuidelines = () => apiRequest<Guideline[]>("/api/guidelines");
export const listAssets = () => apiRequest<BrandAsset[]>("/api/assets");
export const assetFileUrl = (asset: BrandAsset) => `${API_BASE_URL}${asset.file_url}`;
export const listRules = () => apiRequest<Rule[]>("/api/rules");
export const listFacts = () => apiRequest<ApprovedFact[]>("/api/facts");
export const listLexicon = () => apiRequest<LexiconEntry[]>("/api/lexicon");
export const listContent = () => apiRequest<ContentItem[]>("/api/content");
export const listAuditEvents = () => apiRequest<AuditEvent[]>("/api/audit");

export function uploadGuideline(file: File) {
  const form = new FormData();
  form.append("file", file);
  return apiRequest<Guideline>("/api/guidelines/upload", {
    method: "POST",
    body: form,
  });
}

export function uploadAsset(file: File, name: string, description?: string) {
  const form = new FormData();
  form.append("file", file);
  form.append("name", name);
  if (description) form.append("description", description);
  return apiRequest<BrandAsset>("/api/assets/upload", {
    method: "POST",
    body: form,
  });
}

export const archiveAsset = (assetId: string) =>
  apiRequest<BrandAsset>(`/api/assets/${assetId}/archive`, { method: "POST" });

export function createRule(input: {
  guideline_doc_id: string;
  stable_id: string;
  statement: string;
  version?: number;
}) {
  return apiRequest<Rule>("/api/rules", json(input));
}

export function createFact(input: {
  statement: string;
  source_reference?: string;
  valid_from?: string;
  valid_until?: string;
}) {
  return apiRequest<ApprovedFact>("/api/facts", json(input));
}

export function createLexiconEntry(input: {
  term: string;
  term_category: LexiconEntry["term_category"];
  preferred_replacement?: string;
  explanation?: string;
}) {
  return apiRequest<LexiconEntry>("/api/lexicon", json(input));
}

export function submitContent(input: {
  title: string;
  body: string;
  channel?: string;
  content_type?: string;
  provenance?: string;
}) {
  return apiRequest<ContentItem>("/api/content", json(input));
}

export function uploadContent(
  file: File,
  input: { title?: string; channel?: string; content_type?: string },
) {
  const form = new FormData();
  form.append("file", file);
  if (input.title) form.append("title", input.title);
  if (input.channel) form.append("channel", input.channel);
  if (input.content_type) form.append("content_type", input.content_type);
  return apiRequest<ContentItem>("/api/content/upload", {
    method: "POST",
    body: form,
  });
}

export const runReview = (contentId: string) =>
  apiRequest<ReviewResponse>(`/api/content/${contentId}/review`, { method: "POST" });

export const listFindings = (contentId: string) =>
  apiRequest<Finding[]>(`/api/content/${contentId}/findings`);

export function decideFinding(
  findingId: string,
  decision_type: Decision["decision_type"],
  decision_reason?: string,
) {
  return apiRequest<Decision>(
    `/api/findings/${findingId}/decision`,
    json({ decision_type, decision_reason }),
  );
}

export const listFindingDecisions = (findingId: string) =>
  apiRequest<Decision[]>(`/api/findings/${findingId}/decisions`);

export const getInsightsSummary = () =>
  apiRequest<{
    submissions: number;
    findings: number;
    pending_reviews: number;
    guidelines: number;
  }>("/api/insights/summary");
