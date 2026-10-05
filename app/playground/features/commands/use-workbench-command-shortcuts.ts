"use client";

import { useEffect } from "react";
import type { RequestSession } from "../../shared/workbench-types";
import type { LayangWindowKind } from "@/types/electron";

type CommandShortcutScope = {
  hydrated: boolean;
  activeRequestId: string;
  requestSessions: RequestSession[];
  activateRequestSession: (session: RequestSession) => void;
  closeRequestSession: (sessionId: string) => void;
  closeAllRequestSessions: () => void;
  runActiveRequest: () => void;
  activeRunning: boolean;
  saveActiveMockDraft: () => boolean | undefined;
  mockDraftDirty: boolean;
  getActiveSection: () => string;
  windowKind?: LayangWindowKind;
};

function isTextEditingTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  if (target.closest("textarea, input, [contenteditable='true'], [role='textbox'], .code-editor")) return true;
  return false;
}

function isDialogTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('[role="dialog"]'));
}

function consumeShortcut(event: KeyboardEvent) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

function dispatchPalette(mode: "commands" | "requests") {
  window.dispatchEvent(new CustomEvent("layang:open-palette", { detail: { mode } }));
}

export function useWorkbenchCommandShortcuts(scope: CommandShortcutScope) {
  useEffect(() => {
    if (!scope.hydrated) return;

    function switchRequest(direction: -1 | 1) {
      if (scope.requestSessions.length < 2) return;
      const activeIndex = Math.max(
        0,
        scope.requestSessions.findIndex((session) => session.id === scope.activeRequestId),
      );
      const nextIndex = (activeIndex + direction + scope.requestSessions.length) % scope.requestSessions.length;
      const nextSession = scope.requestSessions[nextIndex];
      if (nextSession) scope.activateRequestSession(nextSession);
    }

    function handleShortcut(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing || event.altKey) return;
      const hasCommandModifier = event.ctrlKey || event.metaKey;
      if (!hasCommandModifier) return;

      const key = event.key.toLowerCase();
      const textEditing = isTextEditingTarget(event.target);

      if (key === "w") {
        if (isDialogTarget(event.target)) return;
        if (scope.windowKind && scope.windowKind !== "main") {
          consumeShortcut(event);
          window.dispatchEvent(new CustomEvent("layang:close-detached-window"));
          return;
        }
        if (scope.requestSessions.length === 0) return;
        consumeShortcut(event);
        if (event.shiftKey) scope.closeAllRequestSessions();
        else if (scope.activeRequestId) scope.closeRequestSession(scope.activeRequestId);
        return;
      }

      if (key === "p") {
        if (scope.windowKind === "mocking" || scope.windowKind === "response") return;
        consumeShortcut(event);
        dispatchPalette("requests");
        return;
      }

      if (key === "k") {
        consumeShortcut(event);
        dispatchPalette("commands");
        return;
      }

      if (key === "i") {
        if (scope.windowKind === "mocking" || scope.windowKind === "response" || isDialogTarget(event.target)) return;
        const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
          '[data-layang-primary-input="true"]',
        );
        if (!input) return;
        consumeShortcut(event);
        input.focus({ preventScroll: false });
        input.select?.();
        return;
      }

      if (key === "enter") {
        if (
          scope.windowKind === "mocking" ||
          scope.windowKind === "response" ||
          isDialogTarget(event.target) ||
          !scope.activeRequestId ||
          scope.activeRunning ||
          scope.getActiveSection() !== "collections"
        ) return;
        consumeShortcut(event);
        scope.runActiveRequest();
        return;
      }

      if (key === "s") {
        if (isDialogTarget(event.target) || scope.getActiveSection() !== "services" || !scope.mockDraftDirty) return;
        consumeShortcut(event);
        scope.saveActiveMockDraft();
        return;
      }

      if (scope.windowKind === "main" && (event.key === "PageUp" || event.key === "PageDown") && scope.requestSessions.length > 1) {
        consumeShortcut(event);
        switchRequest(event.key === "PageUp" ? -1 : 1);
        return;
      }

      if (scope.windowKind === "main" && !textEditing && (event.key === "ArrowLeft" || event.key === "ArrowRight") && scope.requestSessions.length > 1) {
        consumeShortcut(event);
        switchRequest(event.key === "ArrowLeft" ? -1 : 1);
      }
    }

    // Capture phase is intentional: code editors isolate key events at their boundary.
    window.addEventListener("keydown", handleShortcut, { capture: true });
    return () => window.removeEventListener("keydown", handleShortcut, { capture: true });
  }, [
    scope.activeRequestId,
    scope.activeRunning,
    scope.activateRequestSession,
    scope.closeAllRequestSessions,
    scope.closeRequestSession,
    scope.getActiveSection,
    scope.hydrated,
    scope.mockDraftDirty,
    scope.requestSessions,
    scope.runActiveRequest,
    scope.saveActiveMockDraft,
    scope.windowKind,
  ]);
}
