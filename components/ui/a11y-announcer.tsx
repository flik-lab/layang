"use client";

import { useEffect, useState } from "react";
import { A11Y_ANNOUNCE_EVENT } from "@/lib/accessibility";

export function A11yAnnouncer() {
  const [message, setMessage] = useState("");

  useEffect(() => {
    const onAnnounce = (event: Event) => {
      const nextMessage = (event as CustomEvent<string>).detail;
      if (!nextMessage) return;
      setMessage("");
      window.requestAnimationFrame(() => setMessage(nextMessage));
    };
    window.addEventListener(A11Y_ANNOUNCE_EVENT, onAnnounce);
    return () => window.removeEventListener(A11Y_ANNOUNCE_EVENT, onAnnounce);
  }, []);

  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only" data-slot="a11y-announcer">
      {message}
    </div>
  );
}
