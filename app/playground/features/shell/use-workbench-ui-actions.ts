"use client";

import { type MutableRefObject, type UIEvent, useEffect } from "react";
import type { ColorMode } from "../../design-system";
import type { ResponseTab } from "../../shared/workbench-types";

type StateSetter<T> = (value: T | ((current: T) => T)) => void;

type WorkbenchUiActionsScope = {
  responseBodyRef: MutableRefObject<HTMLDivElement | null>;
  responseTab: ResponseTab;
  setShowMessageTopButton: StateSetter<boolean>;
  setPendingMessageCount?: StateSetter<number>;
  setThemeMode: StateSetter<ColorMode>;
  themeMode: ColorMode;
};

export function useWorkbenchUiActions(scope: WorkbenchUiActionsScope) {
  const { responseBodyRef, responseTab, setShowMessageTopButton, setPendingMessageCount, setThemeMode, themeMode } =
    scope;

  function handleResponseBodyScroll(event: UIEvent<HTMLDivElement>) {
    if (responseTab !== "messages") return;
    const awayFromTop = event.currentTarget.scrollTop > 96;
    setShowMessageTopButton(awayFromTop);
    if (!awayFromTop) setPendingMessageCount?.(0);
  }

  function scrollMessagesToTop() {
    responseBodyRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    setShowMessageTopButton(false);
    setPendingMessageCount?.(0);
  }

  useEffect(() => {
    if (responseTab !== "messages") {
      setShowMessageTopButton(false);
      return;
    }
    const node = responseBodyRef.current;
    setShowMessageTopButton(Boolean(node && node.scrollTop > 96));
  }, [responseTab, responseBodyRef, setShowMessageTopButton]);

  function toggleTheme() {
    const next = themeMode === "dark" ? "light" : "dark";
    setThemeMode(next);
    window.localStorage.setItem("layang-theme", next);
  }

  return { handleResponseBodyScroll, scrollMessagesToTop, toggleTheme };
}
