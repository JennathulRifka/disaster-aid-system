import { TouchableOpacity, Text } from "react-native";
import { logoutUser } from "../lib/auth";

export function LogoutButton() {
  return (
    <TouchableOpacity onPress={() => logoutUser()} className="mr-4">
      <Text className="text-sm font-medium text-slate-700">Log out</Text>
    </TouchableOpacity>
  );
}
