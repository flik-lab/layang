"use client";

import { useMemo, useRef, useSyncExternalStore } from "react";
import type { ResponseSnapshot } from "./response.types";
import type { ResponseStore } from "./response.store";
import {
  createResponseSelectorBinding,
  type ResponseSelectorEquality,
} from "./responseSelector";

export function useResponseSelector<T>(
  store: ResponseStore,
  selector: (snapshot: ResponseSnapshot) => T,
  equality: ResponseSelectorEquality<T> = Object.is,
): T {
  const selectorRef = useRef(selector);
  const equalityRef = useRef(equality);
  selectorRef.current = selector;
  equalityRef.current = equality;

  const binding = useMemo(
    () =>
      createResponseSelectorBinding(
        store,
        (snapshot) => selectorRef.current(snapshot),
        (left, right) => equalityRef.current(left, right),
      ),
    [store],
  );

  return useSyncExternalStore(binding.subscribe, binding.getSnapshot, binding.getSnapshot);
}
