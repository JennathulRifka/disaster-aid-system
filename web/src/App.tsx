import { Routes, Route } from "react-router-dom";
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Dashboard from "@/pages/Dashboard";
import Settings from "@/pages/Settings";
import TransparencyDashboard from "@/pages/TransparencyDashboard";
import VictimRequestForm from "@/pages/VictimRequestForm";
import VictimMyRequests from "@/pages/VictimMyRequests";
import DonorDonationForm from "@/pages/DonorDonationForm";
import DonorMyDonations from "@/pages/DonorMyDonations";
import AdminRequests from "@/pages/AdminRequests";
import AdminDonations from "@/pages/AdminDonations";
import VolunteerDeliveries from "@/pages/VolunteerDeliveries";
import VolunteerNavigation from "@/pages/VolunteerNavigation";
import PublicSeverityMap from "@/pages/PublicSeverityMap";
import SituationMap from "@/pages/SituationMap";
import AdminCategories from "@/pages/AdminCategories";
import AdminBroadcast from "@/pages/AdminBroadcast";
import ResourceGapView from "@/pages/ResourceGapView";
import AuditLog from "@/pages/AuditLog";
import VolunteerWorkload from "@/pages/VolunteerWorkload";
import AdminActiveDistricts from "@/pages/AdminActiveDistricts";
import AdminWaterAlerts from "@/pages/AdminWaterAlerts";
import AdminSos from "@/pages/AdminSos";
import AdminCommunityReports from "@/pages/AdminCommunityReports";
import { ProtectedRoute } from "@/components/ProtectedRoute";

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/transparency" element={<TransparencyDashboard />} />
      <Route path="/severity-map" element={<PublicSeverityMap />} />

      {/* Any logged-in user */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <Settings />
          </ProtectedRoute>
        }
      />

      {/* Victim only */}
      <Route
        path="/request/new"
        element={
          <ProtectedRoute allowedRoles={["victim"]}>
            <VictimRequestForm />
          </ProtectedRoute>
        }
      />
      <Route
        path="/request/mine"
        element={
          <ProtectedRoute allowedRoles={["victim"]}>
            <VictimMyRequests />
          </ProtectedRoute>
        }
      />

      {/* Donor only */}
      <Route
        path="/donations/new"
        element={
          <ProtectedRoute allowedRoles={["donor"]}>
            <DonorDonationForm />
          </ProtectedRoute>
        }
      />
      <Route
        path="/donations/mine"
        element={
          <ProtectedRoute allowedRoles={["donor"]}>
            <DonorMyDonations />
          </ProtectedRoute>
        }
      />

      {/* Admin only */}
      <Route
        path="/admin/requests"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <AdminRequests />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/donations"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <AdminDonations />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/map"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <SituationMap />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/categories"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <AdminCategories />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/broadcast"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <AdminBroadcast />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/resource-gap"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <ResourceGapView />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/audit-log"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <AuditLog />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/volunteer-workload"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <VolunteerWorkload />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/active-emergencies"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <AdminActiveDistricts />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/water-alerts"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <AdminWaterAlerts />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/sos"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <AdminSos />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/community-reports"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <AdminCommunityReports />
          </ProtectedRoute>
        }
      />

      {/* Volunteer only */}
      <Route
        path="/deliveries/mine"
        element={
          <ProtectedRoute allowedRoles={["volunteer"]}>
            <VolunteerDeliveries />
          </ProtectedRoute>
        }
      />
      <Route
        path="/deliveries/:id/navigate"
        element={
          <ProtectedRoute allowedRoles={["volunteer"]}>
            <VolunteerNavigation />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
