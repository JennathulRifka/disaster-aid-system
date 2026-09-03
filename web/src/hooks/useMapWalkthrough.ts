import { useEffect, useState } from "react";

const STORAGE_KEY = "map_walkthrough_dismissed";

/**
 * Auto-opens a one-time onboarding walkthrough on first visit (per browser,
 * via localStorage — not sessionStorage, since this is meant to be seen once
 * ever, not once per tab), and exposes `show()` so a "?" help button can
 * reopen it any time afterward.
 */
export function useMapWalkthrough() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setOpen(true);
    } catch {
      // localStorage unavailable — just skip the auto-open, no walkthrough needed
    }
  }, []);

  function dismiss() {
    setOpen(false);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore
    }
  }

  function show() {
    setOpen(true);
  }

  return { open, show, dismiss };
}
