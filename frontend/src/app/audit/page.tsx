"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { ApiError, type AuditEvent, listAuditEvents, useAuthenticatedSession } from "@/lib/api";

export default function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const authenticated = useAuthenticatedSession();

  useEffect(() => {
    if (!authenticated) return;
    listAuditEvents()
      .then(setEvents)
      .catch((error: unknown) =>
        setMessage(error instanceof ApiError ? error.message : "Unable to load audit history."),
      )
      .finally(() => setLoading(false));
  }, [authenticated]);

  const visibleEvents = events.filter((event) =>
    `${event.event_type} ${event.entity_type} ${event.action_description}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  return (
    <DashboardShell title="Audit History" subtitle="Workspace-scoped record of review and configuration actions.">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Event trail</h2>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input aria-label="Search audit events" placeholder="Search events" value={search} onChange={(event) => setSearch(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm" />
          </div>
        </div>
        {message && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{message}</p>}
        {loading ? <p role="status">Loading audit events…</p> : visibleEvents.length === 0 ? (
          <p className="text-sm text-slate-500">No audit events are available.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-slate-600"><tr><th className="px-3 py-2">Actor</th><th className="px-3 py-2">Action</th><th className="px-3 py-2">Entity</th><th className="px-3 py-2">ID</th><th className="px-3 py-2">Timestamp</th></tr></thead>
              <tbody className="divide-y divide-slate-200">
                {visibleEvents.map((event) => (
                  <tr key={event.id}>
                    <td className="px-3 py-2">{event.actor_id ?? "System"}</td>
                    <td className="px-3 py-2">{event.action_description}</td>
                    <td className="px-3 py-2">{event.entity_type} · {event.event_type}</td>
                    <td className="px-3 py-2 font-mono text-xs">{event.entity_id}</td>
                    <td className="px-3 py-2">{new Date(event.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </DashboardShell>
  );
}
