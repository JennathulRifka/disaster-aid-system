import type { LucideIcon } from "lucide-react";

// Full, literal class strings (not template-built from the color name) —
// Tailwind's JIT scanner only picks up classes it can see spelled out in the
// source, so `bg-${accent}-50` would silently produce no styling at all.
const ACCENT_CLASSES: Record<string, string> = {
  orange: "bg-orange-50 text-orange-600",
  blue: "bg-blue-50 text-blue-600",
  green: "bg-green-50 text-green-600",
  purple: "bg-purple-50 text-purple-600",
  slate: "bg-slate-100 text-slate-600",
};

// `icon`/`accent` are optional and additive — every existing caller (Landing.tsx,
// Dashboard.tsx's AdminKpiRow) that omits them renders byte-identical to before.
// `accent` picks a key from ACCENT_CLASSES above; defaults to orange, this
// app's one brand accent color.
export function StatCard({
  label,
  value,
  icon: Icon,
  accent = "orange",
}: {
  label: string;
  value: number | string;
  icon?: LucideIcon;
  accent?: keyof typeof ACCENT_CLASSES;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 transition-shadow hover:shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="mt-1 text-3xl font-semibold text-gray-900">{value}</p>
        </div>
        {Icon && (
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${ACCENT_CLASSES[accent] ?? ACCENT_CLASSES.orange}`}
          >
            <Icon size={20} />
          </span>
        )}
      </div>
    </div>
  );
}
