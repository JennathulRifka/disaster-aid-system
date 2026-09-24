import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { useTranslation } from "react-i18next";
import type { VolunteerTabParamList } from "../../navigation/types";
import { HomeTileGrid, type HomeTile } from "../../components/HomeTileGrid";

type Props = BottomTabScreenProps<VolunteerTabParamList, "Home">;

// Landing tab for the volunteer role — same tile-grid pattern as the other
// three roles. Exactly 4 tiles here, a clean 2x2.
export function VolunteerHomeScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const tiles: HomeTile[] = [
    {
      icon: "car-outline",
      label: t("home.myDeliveries"),
      color: "#fff7ed",
      iconColor: "#ea580c",
      onPress: () => navigation.navigate("MyDeliveries"),
    },
    {
      icon: "alert-circle-outline",
      label: t("home.reportCondition"),
      color: "#fef2f2",
      iconColor: "#dc2626",
      onPress: () => navigation.navigate("CommunityReport"),
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
