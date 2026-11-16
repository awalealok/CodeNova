"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Archive, ExternalLink, ImagePlus } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import {
  ApiError,
  archiveAsset,
  assetFileUrl,
  listAssets,
  uploadAsset,
  useAuthenticatedSession,
  type BrandAsset,
} from "@/lib/api";

export default function AssetsPage() {
  const formRef = useRef<HTMLFormElement>(null);
  const [assets, setAssets] = useState<BrandAsset[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const authenticated = useAuthenticatedSession();

  useEffect(() => {
    if (!authenticated) return;
    listAssets()
      .then(setAssets)
      .catch((cause: unknown) => {
        setError(cause instanceof ApiError ? cause.message : "Could not load brand assets.");
      });
  }, [authenticated]);

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("Choose a PNG, JPEG or WebP image to upload.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const created = await uploadAsset(file, name, description);
      setAssets((current) => [created, ...current]);
      setName("");
      setDescription("");
      setFile(null);
      formRef.current?.reset();
      setMessage("Brand asset uploaded.");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not upload the brand asset.");
    } finally {
      setBusy(false);
    }
  }

  async function handleArchive(asset: BrandAsset) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await archiveAsset(asset.id);
      setAssets((current) => current.filter((item) => item.id !== asset.id));
      setMessage(`${asset.name} was archived.`);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not archive this asset.");
    } finally {
      setBusy(false);
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setFile(selected);
    if (selected && !name) {
      setName(selected.name.replace(/\.[^.]+$/, ""));
    }
  }

  return (
    <DashboardShell title="Brand Assets" subtitle="Manage approved images for this workspace.">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <form ref={formRef} onSubmit={handleUpload} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <ImagePlus className="h-6 w-6 text-indigo-600" />
            <h2 className="text-lg font-semibold">Upload an asset</h2>
          </div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="asset-name">
            Asset name
            <input
              id="asset-name"
              required
              maxLength={200}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700" htmlFor="asset-description">
            Description <span className="font-normal text-slate-500">(optional)</span>
            <textarea
              id="asset-description"
              maxLength={5000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700" htmlFor="asset-file">
            Image file
            <input
              id="asset-file"
              required
              type="file"
              accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
              onChange={handleFileChange}
              className="mt-1 block w-full text-sm"
            />
            <span className="mt-1 block text-xs text-slate-500">PNG, JPEG or WebP; maximum 15 MB.</span>
          </label>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy ? "Working…" : "Upload asset"}
          </button>
        </form>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Workspace library</h2>
          {assets.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No active brand assets yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {assets.map((asset) => (
                <li key={asset.id} className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{asset.name}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {asset.asset_type} · {new Date(asset.created_at).toLocaleDateString()}
                    </p>
                    {asset.description && <p className="mt-1 text-sm text-slate-600">{asset.description}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={assetFileUrl(asset)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-indigo-700 hover:bg-indigo-50"
                    >
                      Open <ExternalLink className="h-4 w-4" />
                    </a>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleArchive(asset)}
                      aria-label={`Archive ${asset.name}`}
                      className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                    >
                      <Archive className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {message && <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
    </DashboardShell>
  );
}
