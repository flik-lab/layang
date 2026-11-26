"use client";

import { useEffect } from "react";
import { Close, OpenInNew } from "@/components/shadcn/icons";
import { FULL_GUIDE_URL, MOCK_HELP_SECTIONS } from "./mock-help-content";
import { closeMockHelp, selectMockHelpTopic, useMockHelp } from "./mock-help-store";

/** Docked help panel for Mocking. It stays beside the workspace instead of covering it. */
export function MockHelpDrawer() {
  const { open, topic } = useMockHelp();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMockHelp();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!open) return null;
  const section = MOCK_HELP_SECTIONS.find(item => item.id === topic) ?? MOCK_HELP_SECTIONS[0];

  return (
    <aside className="mock-help-drawer" aria-label="Mocking help">
      <header className="mock-help-header">
        <span className="mock-help-title">Help</span>
        <button type="button" className="mock-help-icon-button" aria-label="Close help" onClick={closeMockHelp}>
          <Close sx={{ fontSize: 16 }} />
        </button>
      </header>
      <nav className="mock-help-nav" aria-label="Help topics">
        {MOCK_HELP_SECTIONS.map(item => (
          <button key={item.id} type="button" className="mock-help-topic" aria-current={item.id === section.id ? "page" : undefined}
            onClick={() => selectMockHelpTopic(item.id)}>
            {item.title}
          </button>
        ))}
      </nav>
      <article className="mock-help-body">
        <h3>{section.title}</h3>
        {section.body}
      </article>
      <footer className="mock-help-footer">
        <a href={FULL_GUIDE_URL} target="_blank" rel="noreferrer">
          Read the full guide <OpenInNew sx={{ fontSize: 13 }} />
        </a>
      </footer>
    </aside>
  );
}
