import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { apiFetch } from "../../lib/api";

interface Broadcast {
  id: string;
  message: string;
  severity: "info" | "warning" | "critical";
  active: boolean;
  createdByName: string;
  createdAt: string;
}

const SEVERITY_BADGE: Record<Broadcast["severity"], { bg: string; text: string }> = {
  info: { bg: "bg-blue-100", text: "text-blue-800" },
  warning: { bg: "bg-amber-100", text: "text-amber-800" },
  critical: { bg: "bg-red-100", text: "text-red-800" },
};

export function BroadcastScreen() {
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
    setHistory(await apiFetch("/api/broadcasts"));
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handlePost() {
    if (!message.trim()) {
      setError("Message is required.");
      return;
    }
    setPosting(true);
    setError("");
    try {
      await apiFetch("/api/broadcasts", { method: "POST", body: JSON.stringify({ message: message.trim(), severity }) });
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

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator size="large" color="#ea580c" />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16 }}>
      <Text className="text-2xl font-semibold text-gray-900">Emergency Broadcast Banner</Text>
      <Text className="mt-1 text-sm text-gray-600">
        Post a message shown across the public landing page and every logged-in dashboard.
      </Text>

      {error ? (
        <View className="mt-4 rounded border border-red-200 bg-red-50 px-4 py-2">
          <Text className="text-sm text-red-800">{error}</Text>
        </View>
      ) : null}

      <View className="mt-4 rounded-xl border border-gray-200 bg-white p-5">
        <Text className="text-sm font-semibold text-gray-900">Current banner</Text>
        {active ? (
          <View className="mt-3 rounded border border-gray-200 p-3">
            <View className={`self-start rounded px-2 py-0.5 ${SEVERITY_BADGE[active.severity].bg}`}>
              <Text className={`text-xs font-medium ${SEVERITY_BADGE[active.severity].text}`}>{active.severity}</Text>
            </View>
            <Text className="mt-2 text-sm text-gray-800">{active.message}</Text>
            <Text className="mt-1 text-xs text-gray-400">
              Posted by {active.createdByName} — {new Date(active.createdAt).toLocaleString()}
            </Text>
            <TouchableOpacity
              onPress={handleClear}
              disabled={clearing}
              className="mt-2 self-start rounded border border-gray-300 px-3 py-1.5"
              style={{ opacity: clearing ? 0.5 : 1 }}
            >
              <Text className="text-xs font-medium text-gray-700">{clearing ? "Clearing..." : "Clear banner"}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text className="mt-2 text-sm text-gray-500">No banner is currently active.</Text>
        )}
      </View>

      <View className="mt-4 rounded-xl border border-gray-200 bg-white p-5">
        <Text className="text-sm font-semibold text-gray-900">Post a new banner</Text>
        <Text className="mt-1 text-xs text-gray-500">Posting replaces any currently active banner.</Text>
        <View className="mt-3" style={{ gap: 12 }}>
          <TextInput
            value={message}
            onChangeText={setMessage}
            multiline
            numberOfLines={3}
            placeholder="e.g. Cyclone approaching Batticaloa, expect delivery delays."
            className="rounded border border-gray-300 px-3 py-2 text-sm"
            style={{ textAlignVertical: "top" }}
          />
          <View className="rounded border border-gray-300">
            <Picker selectedValue={severity} onValueChange={(v) => setSeverity(v as Broadcast["severity"])}>
              <Picker.Item label="Info" value="info" />
              <Picker.Item label="Warning" value="warning" />
              <Picker.Item label="Critical" value="critical" />
            </Picker>
          </View>
          <TouchableOpacity
            onPress={handlePost}
            disabled={posting}
            className="items-center rounded bg-orange-600 py-2.5"
            style={{ opacity: posting ? 0.5 : 1 }}
          >
            <Text className="text-sm font-medium text-white">{posting ? "Posting..." : "Post banner"}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {history.length > 0 && (
        <View className="mt-4 rounded-xl border border-gray-200 bg-white p-5">
          <Text className="text-sm font-semibold text-gray-900">Recent history</Text>
          <View className="mt-2" style={{ gap: 10 }}>
            {history.map((b) => (
              <View key={b.id} className="border-b border-gray-100 pb-2">
                <View className="flex-row items-center" style={{ gap: 6 }}>
                  <View className={`rounded px-2 py-0.5 ${SEVERITY_BADGE[b.severity].bg}`}>
                    <Text className={`text-xs font-medium ${SEVERITY_BADGE[b.severity].text}`}>{b.severity}</Text>
                  </View>
                  {b.active && (
                    <View className="rounded bg-green-100 px-2 py-0.5">
                      <Text className="text-xs font-medium text-green-800">Active</Text>
                    </View>
                  )}
                </View>
                <Text className="mt-1 text-sm text-gray-800">{b.message}</Text>
                <Text className="mt-1 text-xs text-gray-400">
                  {b.createdByName} — {new Date(b.createdAt).toLocaleString()}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}
