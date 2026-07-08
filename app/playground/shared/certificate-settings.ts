import type { LayangCertificateSettings, LayangCertificateSettingsInfo } from "@/types/electron";

export type { LayangCertificateSettings, LayangCertificateSettingsInfo };

export const defaultCertificateSettings: LayangCertificateSettings = {
  version: 1,
  caCertificatePem: "",
  caCertificates: [],
  bypassTlsErrors: false,
  updatedAt: "",
};

export async function getCertificateSettings(): Promise<LayangCertificateSettingsInfo | null> {
  if (typeof window === "undefined" || !window.electronCertificateSettings?.get) return null;
  return window.electronCertificateSettings.get();
}

export async function updateCertificateSettings(
  settings: Partial<LayangCertificateSettings>,
): Promise<LayangCertificateSettingsInfo | null> {
  if (typeof window === "undefined" || !window.electronCertificateSettings?.set) return null;
  return window.electronCertificateSettings.set(settings);
}

export async function importCertificateFile(): Promise<LayangCertificateSettingsInfo | null> {
  if (typeof window === "undefined" || !window.electronCertificateSettings?.importFile) return null;
  return window.electronCertificateSettings.importFile();
}

export async function clearCertificatePem(): Promise<LayangCertificateSettingsInfo | null> {
  if (typeof window === "undefined" || !window.electronCertificateSettings?.clear) return null;
  return window.electronCertificateSettings.clear();
}
