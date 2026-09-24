import { useEffect, useRef } from "react";

/**
 * Screen-reader + keyboard basics for this app's several ad-hoc
 * "fixed inset-0" modal overlays (SosButton, QrScanModal, CaseNotesModal,
 * ChatModal, MapWalkthroughModal) — none of which had dialog semantics,
 * focus management, or Escape-to-close before this. Pair with
 * role="dialog" aria-modal="true" aria-labelledby={a heading id} on the
 * element this ref is attached to.
 *
 * On mount: moves focus into the dialog panel itself (the ref target needs
 * tabIndex={-1} to be programmatically focusable without joining the normal
 * tab order). While open: traps Tab/Shift+Tab so keyboard focus can't
 * escape to the page behind the overlay, and Escape calls onClose. On
 * unmount: returns focus to whatever was focused before the dialog opened,
 * so closing it doesn't strand a keyboard/screen-reader user at the top of
 * the page.
 */
export function useDialogA11y(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    // The dialog panel is almost always conditionally rendered ({open &&
    // <div ref={ref}>...}), so this effect has to re-run once `open` flips
    // true — a plain mount-only effect would fire before the ref ever
    // attaches to anything and never get a second chance.
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !dialog) return;
      const focusable = dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [open]);

  return ref;
}
