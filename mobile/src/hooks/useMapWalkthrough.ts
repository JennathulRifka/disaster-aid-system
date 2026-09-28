import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "map_walkthrough_dismissed";

/**
 * Mobile port of web's identical hook (see CLAUDE.md's "Public map
 * accessibility pass") — AsyncStorage instead of localStorage, meant to be
 * seen once ever per install, not once per screen visit. Auto-opens on
 * first mount of whichever screen calls this; exposes `show()` so a "Help /
 * Tour" button can reopen it any time afterward.
 */
export function useMapWalkthrough() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (!value) setOpen(true);
      })
      .catch(() => {
        // AsyncStorage unavailable — just skip the auto-open
      });
  }, []);

  function dismiss() {
    setOpen(false);
    AsyncStorage.setItem(STORAGE_KEY, "1").catch(() => {});
  }

  function show() {
    setOpen(true);
  }

  return { open, show, dismiss };
}
