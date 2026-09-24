import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { AdminTabParamList } from "../../navigation/types";
import { HomeTileGrid, type HomeTile } from "../../components/HomeTileGrid";
import { db } from "../../lib/firebase";
import { apiFetch } from "../../lib/api";

type Props = BottomTabScreenProps<AdminTabParamList, "Home">;

// Flattened from a 5th "More" tab that hid 7 screens behind a menu — direct
// user ask: list every admin feature right here, the same way SOS
// Dispatch/Overview/Aid Requests/Donations already were, instead of forcing
// an extra tap through a menu first. See AdminTabs.tsx for the corresponding
// hidden-tab wiring these onPress calls navigate into.
export function AdminHomeScreen({ navigation }: Props) {
  // "if there are new aid requests just add a red circle... do this to
  // every tab that gets new addons" — live counts for the tiles whose whole
  // point is "things waiting on an admin," each backed by a plain
  // onSnapshot count query (no full document list needed just for a badge).
  const [pendingRequests, setPendingRequests] = useState(0);
  const [availableDonations, setAvailableDonations] = useState(0);
  const [openSos, setOpenSos] = useState(0);
  const [unverifiedReports, setUnverifiedReports] = useState(0);

  useEffect(() => {
    // aidRequests/donations/sosRequests all have a Firestore rule allowing
    // admin reads (see firestore.rules), so these three are safe to
    // subscribe to directly and get truly live counts.
    const unsubRequests = onSnapshot(
      query(collection(db, "aidRequests"), where("status", "==", "pending")),
      (snap) => setPendingRequests(snap.size)
    );
    const unsubDonations = onSnapshot(
      query(collection(db, "donations"), where("status", "==", "available")),
      (snap) => setAvailableDonations(snap.size)
    );
    const unsubSos = onSnapshot(
      query(collection(db, "sosRequests"), where("status", "==", "pending")),
      (snap) => setOpenSos(snap.size)
    );
    return () => {
      unsubRequests();
      unsubDonations();
      unsubSos();
    };
  }, []);

  useEffect(() => {
    // communityReports deliberately has NO Firestore rule for direct client
    // reads (see CLAUDE.md "Community reports" — always read through the
    // Express API, same as AdminCommunityReports.tsx on web). A live
    // onSnapshot here throws permission-denied; a one-time admin-only
    // apiFetch respects that existing design instead of adding a new rule.
    apiFetch("/api/community-reports")
      .then((reports: { status: string }[]) => {
        setUnverifiedReports(reports.filter((r) => r.status === "unverified").length);
      })
      .catch(() => {});
  }, []);

  const tiles: HomeTile[] = [
    {
      icon: "warning-outline",
      label: "SOS Dispatch",
      color: "#fef2f2",
      iconColor: "#dc2626",
      onPress: () => navigation.navigate("SosDispatch"),
      badge: openSos > 0,
    },
    {
      icon: "stats-chart-outline",
      label: "Overview",
      color: "#eff6ff",
      iconColor: "#2563eb",
      onPress: () => navigation.navigate("Overview"),
    },
    {
      icon: "document-text-outline",
      label: "Aid Requests",
      color: "#fff7ed",
      iconColor: "#ea580c",
      onPress: () => navigation.navigate("AidRequests"),
      badge: pendingRequests > 0,
    },
    {
      icon: "gift-outline",
      label: "Donations",
      color: "#f0fdf4",
      iconColor: "#16a34a",
      onPress: () => navigation.navigate("Donations"),
      badge: availableDonations > 0,
    },
    {
      icon: "pricetags-outline",
      label: "Categories",
      color: "#f5f3ff",
      iconColor: "#7c3aed",
      onPress: () => navigation.navigate("Categories"),
    },
    {
      icon: "megaphone-outline",
      label: "Broadcast",
      color: "#fffbeb",
      iconColor: "#d97706",
      onPress: () => navigation.navigate("Broadcast"),
    },
    {
      icon: "flag-outline",
      label: "Active Emergencies",
      color: "#fef2f2",
      iconColor: "#dc2626",
      onPress: () => navigation.navigate("ActiveDistricts"),
    },
    {
      icon: "water-outline",
      label: "Water Alerts",
      color: "#eff6ff",
      iconColor: "#0284c7",
      onPress: () => navigation.navigate("WaterAlerts"),
    },
    {
      icon: "chatbox-ellipses-outline",
      label: "Community Reports",
      color: "#f0fdf4",
      iconColor: "#16a34a",
      onPress: () => navigation.navigate("CommunityReports"),
      badge: unverifiedReports > 0,
    },
    {
      icon: "list-outline",
      label: "Audit Log",
      color: "#f1f5f9",
      iconColor: "#334155",
      onPress: () => navigation.navigate("AuditLog"),
    },
    {
      icon: "people-outline",
      label: "Volunteer Workload",
      color: "#fff7ed",
      iconColor: "#ea580c",
      onPress: () => navigation.navigate("VolunteerWorkload"),
    },
    {
      icon: "cube-outline",
      label: "District Inventory",
      color: "#eff6ff",
      iconColor: "#2563eb",
      onPress: () => navigation.navigate("DistrictInventory"),
    },
  ];

  return <HomeTileGrid title="Disaster Aid — Admin" subtitle="What would you like to do?" tiles={tiles} />;
}
