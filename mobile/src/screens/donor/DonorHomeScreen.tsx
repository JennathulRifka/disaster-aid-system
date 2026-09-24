import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { useTranslation } from "react-i18next";
import type { DonorTabParamList } from "../../navigation/types";
import { HomeTileGrid, type HomeTile } from "../../components/HomeTileGrid";

type Props = BottomTabScreenProps<DonorTabParamList, "Home">;

// Landing tab for the donor role — same tile-grid pattern as the victim's
// Home screen, so every role gets the same "orient before you act" first
// screen instead of a form.
export function DonorHomeScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const tiles: HomeTile[] = [
    {
      icon: "gift-outline",
      label: t("home.donate"),
      color: "#fff7ed",
      iconColor: "#ea580c",
      onPress: () => navigation.navigate("RegisterDonation"),
    },
    {
      icon: "receipt-outline",
      label: t("home.myDonations"),
      color: "#f1f5f9",
      iconColor: "#334155",
      onPress: () => navigation.navigate("MyDonations"),
    },
    {
      icon: "cube-outline",
      label: t("home.districtNeed"),
      color: "#fef2f2",
      iconColor: "#dc2626",
      onPress: () => navigation.navigate("DistrictNeed"),
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
