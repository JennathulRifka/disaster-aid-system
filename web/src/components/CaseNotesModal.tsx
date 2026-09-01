import { useEffect, useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/api";

interface CaseNote {
  id: string;
  authorName: string;
  text: string;
  createdAt: string;
}

export function CaseNotesModal({
  requestId,
  victimName,
  onClose,
}: {
  requestId: string;
  victimName: string;
  onClose: () => void;
}) {
  const [notes, setNotes] = useState<CaseNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const data = await apiFetch(`/api/requests/${requestId}/notes`);
    setNotes(data);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setPosting(true);
    setError("");
    try {
      await apiFetch(`/api/requests/${requestId}/notes`, {
        method: "POST",
        body: JSON.stringify({ text: text.trim() }),
      });
      setText("");
      await load();
    } catch (err: any) {
      setError(err.message || "Failed to post note.");
    } finally {
      setPosting(false);
    }
  }

  return (
    // z-[1200]: above Leaflet's own map panes/controls (raw z-index up to 1000),
    // same fix as SosButton.tsx's modal, kept consistent in case this is ever
    // opened over a page with a map.
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-xl bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Case notes — {victimName}</h3>
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto border-t border-gray-100 pt-3">
          {loading ? (
            <p className="text-sm text-gray-500">Loading...</p>
          ) : notes.length === 0 ? (
            <p className="text-sm text-gray-500">No notes yet — add the first one below.</p>
          ) : (
            <ul className="space-y-3">
              {notes.map((note) => (
                <li key={note.id} className="rounded border border-gray-100 bg-gray-50 p-2">
                  <p className="text-sm text-gray-800">{note.text}</p>
                  <p className="mt-1 text-xs text-gray-400">
                    {note.authorName} — {new Date(note.createdAt).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <form onSubmit={handleSubmit} className="mt-3 border-t border-gray-100 pt-3">
          {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            placeholder="e.g. Called the victim, they confirmed access road is passable."
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={posting || !text.trim()}
            className="mt-2 w-full rounded bg-orange-600 py-1.5 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {posting ? "Adding..." : "Add note"}
          </button>
        </form>
      </div>
    </div>
  );
}
