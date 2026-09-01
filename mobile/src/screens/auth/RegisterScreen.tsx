import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import { useTranslation } from "react-i18next";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "../../navigation/types";
import { registerUser, type UserRole } from "../../lib/auth";
import { LanguageSwitcher } from "../../components/LanguageSwitcher";
import { normalizeSriLankanPhone } from "../../lib/phone";

type Props = NativeStackScreenProps<AuthStackParamList, "Register">;

const inputClass = "rounded border border-gray-300 px-3 py-2.5";
const labelClass = "mb-1 text-sm font-medium text-gray-700";

export function RegisterScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [nic, setNic] = useState("");
  const [homeAddress, setHomeAddress] = useState("");
  const [role, setRole] = useState<UserRole>("victim");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError("");

    if (phone && !normalizeSriLankanPhone(phone)) {
      setError("Enter a valid Sri Lankan mobile number, e.g. 0771234567.");
      return;
    }

    setLoading(true);
    try {
      await registerUser({ email, password, name, role, phone, nic, homeAddress });
      // RootNavigator swaps screens automatically once auth state changes.
    } catch (err: any) {
      setError(err.message || "Registration failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1 bg-gray-50">
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 16 }}>
        <View className="w-full max-w-sm self-center rounded-xl bg-white p-8 shadow">
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
          <Text className="mb-6 text-2xl font-semibold text-gray-900">{t("auth.createAccountTitle")}</Text>

          <View className="mb-4">
            <Text className={labelClass}>{t("auth.fullName")}</Text>
            <TextInput value={name} onChangeText={setName} className={inputClass} />
          </View>

          <View className="mb-4">
            <Text className={labelClass}>{t("auth.email")}</Text>
            <TextInput
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              className={inputClass}
            />
          </View>

          <View className="mb-4">
            <Text className={labelClass}>{t("auth.password")}</Text>
            <TextInput secureTextEntry value={password} onChangeText={setPassword} className={inputClass} />
          </View>

          <View className="mb-4">
            <Text className={labelClass}>{t("auth.phone")}</Text>
            <TextInput
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
              placeholder="0771234567"
              className={inputClass}
            />
            <Text className="mt-1 text-xs text-gray-400">Sri Lankan mobile number — used for SMS status alerts.</Text>
          </View>

          <View className="mb-4">
            <Text className={labelClass}>{t("auth.iAmA")}</Text>
            <View className="rounded border border-gray-300">
              <Picker selectedValue={role} onValueChange={(v) => setRole(v as UserRole)}>
                <Picker.Item label={t("auth.roleVictim")} value="victim" />
                <Picker.Item label={t("auth.roleDonor")} value="donor" />
                <Picker.Item label={t("auth.roleVolunteer")} value="volunteer" />
                <Picker.Item label={t("auth.roleAdmin")} value="admin" />
              </Picker>
            </View>
          </View>

          {role === "victim" && (
            <>
              <View className="mb-4">
                <Text className={labelClass}>{t("auth.nic")}</Text>
                <TextInput value={nic} onChangeText={setNic} className={inputClass} />
              </View>

              <View className="mb-4">
                <Text className={labelClass}>{t("auth.homeAddress")}</Text>
                <TextInput value={homeAddress} onChangeText={setHomeAddress} className={inputClass} />
                <Text className="mt-1 text-xs text-gray-400">{t("auth.homeAddressHint")}</Text>
              </View>
            </>
          )}

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
              <Text className="font-medium text-white">{t("auth.createAccountButton")}</Text>
            )}
          </TouchableOpacity>

          <View className="mt-4 flex-row justify-center">
            <Text className="text-sm text-gray-600">{t("auth.alreadyHaveAccount")} </Text>
            <TouchableOpacity onPress={() => navigation.navigate("Login")}>
              <Text className="text-sm text-slate-700 underline">{t("auth.signInButton")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
