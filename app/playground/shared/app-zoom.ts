import type { LayangAppZoomInfo } from "@/types/electron";

export type { LayangAppZoomInfo };

export async function getAppZoomInfo(): Promise<LayangAppZoomInfo | null> {
  if (typeof window === "undefined" || !window.electronAppZoom?.get) return null;
  return window.electronAppZoom.get();
}

export async function setAppZoomPercent(zoomPercent: number): Promise<LayangAppZoomInfo | null> {
  if (typeof window === "undefined" || !window.electronAppZoom?.set) return null;
  return window.electronAppZoom.set(zoomPercent);
}

export async function increaseAppZoom(): Promise<LayangAppZoomInfo | null> {
  if (typeof window === "undefined" || !window.electronAppZoom?.zoomIn) return null;
  return window.electronAppZoom.zoomIn();
}

export async function decreaseAppZoom(): Promise<LayangAppZoomInfo | null> {
  if (typeof window === "undefined" || !window.electronAppZoom?.zoomOut) return null;
  return window.electronAppZoom.zoomOut();
}

export async function resetAppZoom(): Promise<LayangAppZoomInfo | null> {
  if (typeof window === "undefined" || !window.electronAppZoom?.reset) return null;
  return window.electronAppZoom.reset();
}

export function subscribeAppZoomChanges(callback: (info: LayangAppZoomInfo) => void): () => void {
  if (typeof window === "undefined" || !window.electronAppZoom?.onChanged) return () => {};
  return window.electronAppZoom.onChanged(callback);
}
