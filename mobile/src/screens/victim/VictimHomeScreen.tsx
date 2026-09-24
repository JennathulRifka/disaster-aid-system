import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { useTranslation } from "react-i18next";
import type { VictimTabParamList } from "../../navigation/types";
import { HomeTileGrid, type HomeTile } from "../../components/HomeTileGrid";

type Props = BottomTabScreenProps<VictimTabParamList, "Home">;

// Landing tab for the victim role — a tile grid instead of dropping the
// user straight into the Submit Request form (the user-reported "not user
// friendly" gap). Each tile jumps to one of this role's own tabs.
export function VictimHomeScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const tiles: HomeTile[] = [
    {
      icon: "add-circle-outline",
      label: t("home.submitRequest"),
      color: "#fff7ed",
      iconColor: "#ea580c",
      onPress: () => navigation.navigate("SubmitRequest"),
    },
    {
      icon: "document-text-outline",
      label: t("home.myRequests"),
      color: "#f1f5f9",
      iconColor: "#334155",
      onPress: () => navigation.navigate("MyRequests"),
    },
    {
      icon: "map-outline",
      label: t("home.severityMap"),
      color: "#eff6ff",
      iconColor: "#2563eb",
      onPress: () => navigation.navigate("SeverityMap"),
    },
    {
      icon: "chatbubble-outline",
      label: t("home.messages"),
      color: "#f0fdf4",
      iconColor: "#16a34a",
      onPress: () => navigation.navigate("Messages", { screen: "ChatList" }),
    },
    {
      icon: "settings-outline",
      label: t("home.settings"),
      color: "#f1f5f9",
      iconColor: "#334155",
      onPress: () => navigation.navigate("Settings"),
    },
  ];

  return <HomeTileGrid title={t("home.title")} subtitle={t("home.subtitle")} tiles={tiles} />;
}
