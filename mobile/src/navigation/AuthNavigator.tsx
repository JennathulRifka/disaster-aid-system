import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "./types";
import { HomeScreen } from "../screens/auth/HomeScreen";
import { LoginScreen } from "../screens/auth/LoginScreen";
import { RegisterScreen } from "../screens/auth/RegisterScreen";

const Stack = createNativeStackNavigator<AuthStackParamList>();

// Home is the actual entry point for a logged-out user (mirrors web's
// Landing.tsx being the site's front door, with Login/Register one tap
// away) — not Login itself, which used to be the first thing anyone saw.
export function AuthNavigator() {
  return (
    <Stack.Navigator initialRouteName="Home" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  );
}
