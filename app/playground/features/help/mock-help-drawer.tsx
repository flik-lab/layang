"use client";

import { useEffect, useState } from "react";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle } from "@/components/shadcn/compat";
import { Close, DocsIcon } from "@/components/shadcn/icons";
import { MarkdownPreview } from "../docs-publisher/docs-publisher-panel";
import { HELP_GUIDES } from "./help-guides.generated";
import { MOCK_HELP_SECTIONS } from "./mock-help-content";
import { closeMockHelp, selectMockHelpTopic, useMockHelp } from "./mock-help-store";

/** The dialog title already names the guide, so drop the markdown's own H1. */
const QUICKSTART_BODY = HELP_GUIDES.mockQuickstart.replace(/^# .*\n+/, "");

/** Docked help panel for Mocking. It stays beside the workspace instead of covering it. */
export function MockHelpDrawer() {
  const { open, topic } = useMockHelp();
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    if (!open || guideOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMockHelp();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, guideOpen]);

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
        <button type="button" className="mock-help-guide-link" onClick={() => setGuideOpen(true)}>
          <DocsIcon sx={{ fontSize: 13 }} /> Open the full quick start guide
        </button>
      </footer>
      <Dialog open={guideOpen} onClose={() => setGuideOpen(false)} fullWidth maxWidth="lg">
        <DialogTitle>gRPC mock quick start</DialogTitle>
        <DialogContent sx={{ maxHeight: "70vh", overflowY: "auto" }}>
          <MarkdownPreview markdown={QUICKSTART_BODY} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setGuideOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </aside>
  );
}
