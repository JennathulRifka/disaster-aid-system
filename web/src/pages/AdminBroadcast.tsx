import { useEffect, useState, type FormEvent } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { apiFetch } from "@/lib/api";

interface Broadcast {
  id: string;
  message: string;
  severity: "info" | "warning" | "critical";
  active: boolean;
  createdByName: string;
  createdAt: string;
  deactivatedAt: string | null;
}

const SEVERITY_LABELS: Record<Broadcast["severity"], string> = {
  info: "Info",
  warning: "Warning",
  critical: "Critical",
};

const SEVERITY_BADGE: Record<Broadcast["severity"], string> = {
  info: "bg-blue-100 text-blue-800",
  warning: "bg-amber-100 text-amber-800",
  critical: "bg-red-100 text-red-800",
};

export default function AdminBroadcast() {
  const [history, setHistory] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [severity, setSeverity] = useState<Broadcast["severity"]>("warning");
  const [posting, setPosting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState("");

  const active = history.find((b) => b.active) || null;

  async function load() {
    setLoading(true);
    const data = await apiFetch("/api/broadcasts");
    setHistory(data);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handlePost(e: FormEvent) {
    e.preventDefault();
    if (!message.trim()) {
      setError("Message is required.");
      return;
    }
    setPosting(true);
    setError("");
    try {
      await apiFetch("/api/broadcasts", {
        method: "POST",
        body: JSON.stringify({ message: message.trim(), severity }),
      });
      setMessage("");
      setSeverity("warning");
      await load();
    } catch (err: any) {
      setError(err.message || "Failed to post banner.");
    } finally {
      setPosting(false);
    }
  }

  async function handleClear() {
    if (!active) return;
    setClearing(true);
    setError("");
    try {
      await apiFetch(`/api/broadcasts/${active.id}/deactivate`, { method: "PATCH" });
      await load();
    } catch (err: any) {
      setError(err.message || "Failed to clear banner.");
    } finally {
      setClearing(false);
    }
  }

  return (
    <DashboardLayout>
      <h1 className="text-2xl font-semibold text-gray-900">Emergency Broadcast Banner</h1>
      <p className="mt-1 text-sm text-gray-600">
        Post a message shown across the public landing page and every logged-in dashboard — the manual,
        admin-curated equivalent of the DMC alerts feed.
      </p>

      {error && (
        <div className="mt-4 rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{error}</div>
      )}

      <div className="mt-6 max-w-xl rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-gray-900">Current banner</h2>
        {loading ? (
          <p className="mt-2 text-sm text-gray-500">Loading...</p>
        ) : active ? (
          <div className="mt-3 flex items-start justify-between gap-3 rounded border border-gray-200 p-3">
            <div>
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${SEVERITY_BADGE[active.severity]}`}>
                {SEVERITY_LABELS[active.severity]}
              </span>
              <p className="mt-2 text-sm text-gray-800">{active.message}</p>
              <p className="mt-1 text-xs text-gray-400">
                Posted by {active.createdByName} — {new Date(active.createdAt).toLocaleString()}
              </p>
            </div>
            <button
              onClick={handleClear}
              disabled={clearing}
              className="shrink-0 rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {clearing ? "Clearing..." : "Clear banner"}
            </button>
          </div>
        ) : (
          <p className="mt-2 text-sm text-gray-500">No banner is currently active.</p>
        )}
      </div>

      <div className="mt-6 max-w-xl rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-gray-900">Post a new banner</h2>
        <p className="mt-1 text-xs text-gray-500">Posting replaces any currently active banner.</p>
        <form onSubmit={handlePost} className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder="e.g. Cyclone approaching Batticaloa, expect delivery delays."
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Severity</label>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value as Broadcast["severity"])}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={posting}
            className="w-full rounded bg-orange-600 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {posting ? "Posting..." : "Post banner"}
          </button>
        </form>
      </div>

      {history.length > 0 && (
        <div className="mt-6 max-w-xl rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-gray-900">Recent history</h2>
          <ul className="mt-3 space-y-3">
            {history.map((b) => (
              <li key={b.id} className="border-b border-gray-100 pb-3 last:border-0 last:pb-0">
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${SEVERITY_BADGE[b.severity]}`}>
                  {SEVERITY_LABELS[b.severity]}
                </span>
                {b.active && (
                  <span className="ml-2 rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                    Active
                  </span>
                )}
                <p className="mt-1 text-sm text-gray-800">{b.message}</p>
                <p className="mt-1 text-xs text-gray-400">
                  {b.createdByName} — {new Date(b.createdAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </DashboardLayout>
  );
}
