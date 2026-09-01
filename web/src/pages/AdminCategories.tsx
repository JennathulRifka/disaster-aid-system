import { useEffect, useState, type FormEvent } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { apiFetch } from "@/lib/api";

interface CategoryLimit {
  label: string;
  max: number | null;
  unit: string;
}

export default function AdminCategories() {
  const [categories, setCategories] = useState<Record<string, CategoryLimit>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");

  const [newLabel, setNewLabel] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const [newMax, setNewMax] = useState("");
  const [newNoCap, setNewNoCap] = useState(false);
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    const data = await apiFetch("/api/categories");
    setCategories(data);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function saveMax(key: string) {
    const raw = drafts[key];
    const max = raw === "" || raw === undefined ? null : Number(raw);
    if (max !== null && (!Number.isFinite(max) || max <= 0)) {
      setMessage("Cap must be a positive number, or blank for no cap.");
      return;
    }
    setSavingKey(key);
    setMessage("");
    try {
      await apiFetch(`/api/categories/${key}`, {
        method: "PATCH",
        body: JSON.stringify({ max }),
      });
      await load();
    } catch (err: any) {
      setMessage(err.message || "Failed to update category.");
    } finally {
      setSavingKey(null);
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!newLabel.trim() || !newUnit.trim()) {
      setMessage("Label and unit are required.");
      return;
    }
    setCreating(true);
    setMessage("");
    try {
      await apiFetch("/api/categories", {
        method: "POST",
        body: JSON.stringify({
          label: newLabel.trim(),
          unit: newUnit.trim(),
          max: newNoCap ? null : Number(newMax),
        }),
      });
      setNewLabel("");
      setNewUnit("");
      setNewMax("");
      setNewNoCap(false);
      await load();
    } catch (err: any) {
      setMessage(err.message || "Failed to create category.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <DashboardLayout>
      <h1 className="text-2xl font-semibold text-gray-900">Manage Aid Categories</h1>
      <p className="mt-1 text-sm text-gray-600">
        Adjust how much of each category a victim can request per submission, or add a new category.
      </p>

      {message && (
        <div className="mt-4 rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {message}
        </div>
      )}

      {loading ? (
        <p className="mt-4 text-sm text-gray-500">Loading...</p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Unit</th>
                <th className="px-4 py-3">Cap per request</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {Object.entries(categories).map(([key, cat]) => (
                <tr key={key}>
                  <td className="px-4 py-3">{cat.label}</td>
                  <td className="px-4 py-3 text-gray-500">{cat.unit}</td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      min={1}
                      placeholder="No cap"
                      defaultValue={cat.max ?? ""}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [key]: e.target.value }))}
                      className="w-28 rounded border border-gray-300 px-2 py-1 text-sm"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <button
                      disabled={savingKey === key}
                      onClick={() => saveMax(key)}
                      className="rounded bg-orange-600 px-3 py-1 text-xs font-medium text-white hover:bg-orange-700 disabled:opacity-50"
                    >
                      {savingKey === key ? "Saving..." : "Save"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-8 max-w-md rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-gray-900">Add a new category</h2>
        <form onSubmit={handleCreate} className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Label</label>
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="e.g. Tarpaulins"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Unit</label>
            <input
              value={newUnit}
              onChange={(e) => setNewUnit(e.target.value)}
              placeholder="e.g. sheets"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 flex items-center gap-2 text-sm font-medium text-gray-700">
              <input type="checkbox" checked={newNoCap} onChange={(e) => setNewNoCap(e.target.checked)} />
              No fixed cap (always reviewed by admin)
            </label>
            {!newNoCap && (
              <input
                type="number"
                min={1}
                value={newMax}
                onChange={(e) => setNewMax(e.target.value)}
                placeholder="Max per request"
                className="mt-2 w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            )}
          </div>
          <button
            type="submit"
            disabled={creating}
            className="w-full rounded bg-orange-600 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {creating ? "Adding..." : "Add category"}
          </button>
        </form>
      </div>
    </DashboardLayout>
  );
}
