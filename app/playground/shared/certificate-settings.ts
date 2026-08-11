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

export async function getHttpsEnvironment() {
  if (typeof window === "undefined" || !window.electronCertificateSettings?.getHttpsEnvironment) return null;
  return window.electronCertificateSettings.getHttpsEnvironment();
}

export async function setupLocalHttps(payload: {
  hostnames?: string[];
  includeHostname?: boolean;
  includeLanAddresses?: boolean;
  trustSystem?: boolean;
  trustNss?: boolean;
  trustScope?: "current-user" | "all-users";
}) {
  if (typeof window === "undefined" || !window.electronCertificateSettings?.setupLocalHttps) return null;
  return window.electronCertificateSettings.setupLocalHttps(payload);
}

export async function chooseHttpsPemFiles() {
  if (typeof window === "undefined" || !window.electronCertificateSettings?.choosePemFiles) return null;
  return window.electronCertificateSettings.choosePemFiles();
}

export async function chooseHttpsPfxFile() {
  if (typeof window === "undefined" || !window.electronCertificateSettings?.choosePfxFile) return null;
  return window.electronCertificateSettings.choosePfxFile();
}

export async function validateHttpsCertificate(payload: {
  mode: "local" | "pem" | "pfx";
  hostname?: string;
  certificateId?: string;
  certificatePath?: string;
  privateKeyPath?: string;
  caPath?: string;
  pfxPath?: string;
  passphrase?: string;
  passphraseSecretId?: string;
  rememberPassphrase?: boolean;
}) {
  if (typeof window === "undefined" || !window.electronCertificateSettings?.validateHttpsCertificate) return null;
  return window.electronCertificateSettings.validateHttpsCertificate(payload);
}

export async function testHttpsEndpoint(url: string) {
  if (typeof window === "undefined" || !window.electronCertificateSettings?.testHttps) return null;
  return window.electronCertificateSettings.testHttps({ url });
}

export async function openHttpsCertificateFolder() {
  if (typeof window === "undefined" || !window.electronCertificateSettings?.openHttpsFolder) return null;
  return window.electronCertificateSettings.openHttpsFolder();
}
