import { useState } from "react";
import { View, TextInput, TouchableOpacity, type TextInputProps } from "react-native";
import { Ionicons } from "@expo/vector-icons";

// A plain TextInput with secureTextEntry + a show/hide eye toggle — the
// mobile equivalent of web's PasswordInput.tsx, used on LoginScreen and
// RegisterScreen.
export function PasswordInput({ className, ...props }: TextInputProps & { className?: string }) {
  const [visible, setVisible] = useState(false);

  return (
    <View className="relative justify-center">
      <TextInput {...props} secureTextEntry={!visible} className={`${className ?? ""} pr-10`} />
      <TouchableOpacity
        onPress={() => setVisible((v) => !v)}
        accessibilityLabel={visible ? "Hide password" : "Show password"}
        className="absolute right-0 h-full w-10 items-center justify-center"
      >
        <Ionicons name={visible ? "eye-off-outline" : "eye-outline"} size={18} color="#9ca3af" />
      </TouchableOpacity>
    </View>
  );
}
