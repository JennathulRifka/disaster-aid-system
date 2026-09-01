import { useTranslation } from "react-i18next";

const COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  verified: "bg-blue-100 text-blue-800",
  rejected: "bg-red-100 text-red-800",
  matched: "bg-purple-100 text-purple-800",
  in_progress: "bg-purple-100 text-purple-800",
  delivered: "bg-green-100 text-green-800",
  available: "bg-blue-100 text-blue-800",
  pending_acceptance: "bg-yellow-100 text-yellow-800",
  accepted: "bg-blue-100 text-blue-800",
  picked_up: "bg-purple-100 text-purple-800",
  confirmed: "bg-green-100 text-green-800",
};

export function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const classes = COLORS[status] || "bg-gray-100 text-gray-800";
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${classes}`}>
      {t(`status.${status}`, status.replace("_", " "))}
    </span>
  );
}
