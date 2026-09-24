import { useTranslation } from "react-i18next";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { MessagesStackParamList } from "./types";
import { ChatListScreen } from "../screens/shared/ChatListScreen";
import { ChatThreadScreen } from "../screens/shared/ChatThreadScreen";

const Stack = createNativeStackNavigator<MessagesStackParamList>();

// A conversations list + thread, nested inside each role's "Messages" tab —
// the mobile equivalent of web's per-item ChatModal.tsx, but reachable on
// its own (like Messenger) rather than only from a delivery row's 💬 button.
export function MessagesStack() {
  const { t } = useTranslation();
  return (
    <Stack.Navigator>
      <Stack.Screen name="ChatList" component={ChatListScreen} options={{ title: t("chatList.title") }} />
      <Stack.Screen name="ChatThread" component={ChatThreadScreen} options={{ title: t("chatList.title") }} />
    </Stack.Navigator>
  );
}
