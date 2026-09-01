import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Switch } from "react-native";
import { apiFetch } from "../../lib/api";

interface CategoryLimit {
  label: string;
  max: number | null;
  unit: string;
}

export function CategoriesScreen() {
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
      await apiFetch(`/api/categories/${key}`, { method: "PATCH", body: JSON.stringify({ max }) });
      await load();
    } catch (err: any) {
      setMessage(err.message || "Failed to update category.");
    } finally {
      setSavingKey(null);
    }
  }

  async function handleCreate() {
    if (!newLabel.trim() || !newUnit.trim()) {
      setMessage("Label and unit are required.");
      return;
    }
    setCreating(true);
    setMessage("");
    try {
      await apiFetch("/api/categories", {
        method: "POST",
        body: JSON.stringify({ label: newLabel.trim(), unit: newUnit.trim(), max: newNoCap ? null : Number(newMax) }),
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

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator size="large" color="#ea580c" />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16 }}>
      <Text className="text-2xl font-semibold text-gray-900">Manage Aid Categories</Text>
      <Text className="mt-1 text-sm text-gray-600">
        Adjust how much of each category a victim can request per submission, or add a new category.
      </Text>

      {message ? (
        <View className="mt-4 rounded border border-red-200 bg-red-50 px-4 py-2">
          <Text className="text-sm text-red-800">{message}</Text>
        </View>
      ) : null}

      <View className="mt-4" style={{ gap: 10 }}>
        {Object.entries(categories).map(([key, cat]) => (
          <View key={key} className="rounded-xl border border-gray-200 bg-white p-4">
            <Text className="text-sm font-medium text-gray-900">{cat.label}</Text>
            <Text className="text-xs text-gray-500">Unit: {cat.unit}</Text>
            <View className="mt-2 flex-row items-center" style={{ gap: 8 }}>
              <TextInput
                keyboardType="number-pad"
                placeholder="No cap"
                defaultValue={cat.max != null ? String(cat.max) : ""}
                onChangeText={(v) => setDrafts((prev) => ({ ...prev, [key]: v }))}
                className="w-24 rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
              <TouchableOpacity
                disabled={savingKey === key}
                onPress={() => saveMax(key)}
                className="rounded bg-orange-600 px-3 py-1.5"
                style={{ opacity: savingKey === key ? 0.5 : 1 }}
              >
                <Text className="text-xs font-medium text-white">{savingKey === key ? "Saving..." : "Save"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </View>

      <View className="mt-6 rounded-xl border border-gray-200 bg-white p-5">
        <Text className="text-sm font-semibold text-gray-900">Add a new category</Text>
        <View className="mt-3" style={{ gap: 12 }}>
          <View>
            <Text className="mb-1 text-sm font-medium text-gray-700">Label</Text>
            <TextInput
              value={newLabel}
              onChangeText={setNewLabel}
              placeholder="e.g. Tarpaulins"
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </View>
          <View>
            <Text className="mb-1 text-sm font-medium text-gray-700">Unit</Text>
            <TextInput
              value={newUnit}
              onChangeText={setNewUnit}
              placeholder="e.g. sheets"
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </View>
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-medium text-gray-700">No fixed cap (always reviewed by admin)</Text>
            <Switch value={newNoCap} onValueChange={setNewNoCap} />
          </View>
          {!newNoCap && (
            <TextInput
              keyboardType="number-pad"
              value={newMax}
              onChangeText={setNewMax}
              placeholder="Max per request"
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            />
          )}
          <TouchableOpacity
            disabled={creating}
            onPress={handleCreate}
            className="items-center rounded bg-orange-600 py-2.5"
            style={{ opacity: creating ? 0.5 : 1 }}
          >
            <Text className="text-sm font-medium text-white">{creating ? "Adding..." : "Add category"}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}
