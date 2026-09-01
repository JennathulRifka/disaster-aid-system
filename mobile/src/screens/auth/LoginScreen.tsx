import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { useTranslation } from "react-i18next";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "../../navigation/types";
import { loginUser } from "../../lib/auth";
import { LanguageSwitcher } from "../../components/LanguageSwitcher";

type Props = NativeStackScreenProps<AuthStackParamList, "Login">;

export function LoginScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError("");
    setLoading(true);
    try {
      await loginUser(email, password);
      // No manual navigation needed — RootNavigator swaps to the role-based
      // tabs automatically once AuthContext's onAuthStateChanged fires.
    } catch (err: any) {
      setError(err.message || t("auth.loginFailed", "Login failed. Check your email and password."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 items-center justify-center bg-gray-50 px-4"
    >
      <View className="w-full max-w-sm rounded-xl bg-white p-8 shadow">
        <View className="mb-4 flex-row items-center justify-between">
          <LanguageSwitcher />
          <TouchableOpacity
            onPress={() => navigation.navigate("Home")}
            accessibilityLabel={t("common.close")}
            className="h-8 w-8 items-center justify-center rounded-full"
          >
            <Text className="text-lg text-gray-400">✕</Text>
          </TouchableOpacity>
        </View>
        <Text className="mb-6 text-2xl font-semibold text-gray-900">{t("auth.signInTitle")}</Text>

        <View className="mb-4">
          <Text className="mb-1 text-sm font-medium text-gray-700">{t("auth.email")}</Text>
          <TextInput
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            className="rounded border border-gray-300 px-3 py-2.5"
          />
        </View>

        <View className="mb-4">
          <Text className="mb-1 text-sm font-medium text-gray-700">{t("auth.password")}</Text>
          <TextInput
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            className="rounded border border-gray-300 px-3 py-2.5"
          />
        </View>

        {error ? <Text className="mb-4 text-sm text-red-600">{error}</Text> : null}

        <TouchableOpacity
          onPress={handleSubmit}
          disabled={loading}
          className="items-center rounded bg-orange-600 py-3"
          style={{ opacity: loading ? 0.5 : 1 }}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="font-medium text-white">{t("auth.signInButton")}</Text>
          )}
        </TouchableOpacity>

        <View className="mt-4 flex-row justify-center">
          <Text className="text-sm text-gray-600">{t("auth.noAccount")} </Text>
          <TouchableOpacity onPress={() => navigation.navigate("Register")}>
            <Text className="text-sm text-slate-700 underline">{t("auth.register")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
