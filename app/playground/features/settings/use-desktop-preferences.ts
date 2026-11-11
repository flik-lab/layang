import { useCallback, useEffect, useState } from "react";
import {
  clearLoggerFiles,
  getLoggerInfo,
  openLoggerFolder,
  updateLoggerSettings,
  type LayangLoggerInfo,
  type LayangLoggerSettings,
  type LayangLogLevel,
} from "../../shared/logger";
import {
  clearCertificatePem,
  defaultCertificateSettings,
  getCertificateSettings,
  importCertificateFile,
  updateCertificateSettings,
  type LayangCertificateSettings,
  type LayangCertificateSettingsInfo,
} from "../../shared/certificate-settings";
import {
  decreaseAppZoom,
  getAppZoomInfo,
  increaseAppZoom,
  resetAppZoom,
  subscribeAppZoomChanges,
  type LayangAppZoomInfo,
} from "../../shared/app-zoom";

const loggerLevelOptions: LayangLogLevel[] = ["debug", "info", "warn", "error"];
const defaultLoggerSettings: LayangLoggerSettings = {
  level: "info",
  mirrorToConsole: false,
  maxBytes: 5 * 1024 * 1024,
  maxTotalBytes: 50 * 1024 * 1024,
  retentionDays: 14,
};

/** Isolates desktop settings state and IPC effects from the main workbench model. */
export function useDesktopPreferences({ hydrated, showToast }: {
  hydrated: boolean;
  showToast: (message: string, severity?: "info" | "success" | "warning" | "error") => void;
}) {
  const [loggerSettingsOpen, setLoggerSettingsOpen] = useState(false);
  const [loggerInfo, setLoggerInfo] = useState<LayangLoggerInfo | null>(null);
  const [loggerDraft, setLoggerDraft] = useState<LayangLoggerSettings>(defaultLoggerSettings);
  const [certificateSettingsOpen, setCertificateSettingsOpen] = useState(false);
  const [certificateInfo, setCertificateInfo] = useState<LayangCertificateSettingsInfo | null>(null);
  const [certificateDraft, setCertificateDraft] = useState<LayangCertificateSettings>(defaultCertificateSettings);
  const [appZoomInfo, setAppZoomInfo] = useState<LayangAppZoomInfo | null>(null);
  const refreshLoggerSettings = useCallback(async () => {
    const info = await getLoggerInfo();
    if (!info) return null;
    setLoggerInfo(info);
    if (info.settings) setLoggerDraft(info.settings);
    return info;
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void refreshLoggerSettings();
  }, [hydrated, refreshLoggerSettings]);

  const openLoggerSettings = useCallback(() => {
    setLoggerSettingsOpen(true);
    void refreshLoggerSettings();
  }, [refreshLoggerSettings]);

  const saveLoggerSettings = useCallback(async () => {
    const info = await updateLoggerSettings(loggerDraft);
    if (!info?.ok) {
      showToast(info?.error || "Failed to update logger settings.", "error");
      return;
    }
    setLoggerInfo(info);
    setLoggerDraft(info.settings);
    showToast("Logger settings updated.", "success");
  }, [loggerDraft, showToast]);

  const openLogFolder = useCallback(async () => {
    const result = await openLoggerFolder();
    if (!result.ok) showToast(result.error || "Failed to open log folder.", "error");
  }, [showToast]);

  const clearLogFiles = useCallback(async () => {
    const info = await clearLoggerFiles();
    if (!info?.ok) {
      showToast(info?.error || "Failed to clear log files.", "error");
      return;
    }
    setLoggerInfo(info);
    showToast("Log files cleared.", "success");
  }, [showToast]);

  const refreshCertificateSettings = useCallback(async () => {
    const info = await getCertificateSettings();
    if (!info) return null;
    setCertificateInfo(info);
    if (info.settings) setCertificateDraft(info.settings);
    return info;
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void refreshCertificateSettings();
  }, [hydrated, refreshCertificateSettings]);

  const openCertificateSettings = useCallback(() => {
    setCertificateSettingsOpen(true);
    void refreshCertificateSettings();
  }, [refreshCertificateSettings]);

  const saveCertificateSettings = useCallback(async () => {
    const info = await updateCertificateSettings(certificateDraft);
    if (!info?.ok) {
      showToast(info?.error || "Failed to update certificate settings.", "error");
      return;
    }
    setCertificateInfo(info);
    setCertificateDraft(info.settings);
    showToast("Certificate settings updated.", "success");
  }, [certificateDraft, showToast]);

  const importCertificateSettingsFile = useCallback(async () => {
    const info = await importCertificateFile();
    if (!info) {
      showToast("Certificate import is only available in the desktop app.", "warning");
      return;
    }
    if (info.cancelled) return;
    if (!info.ok) {
      showToast(info.error || "Failed to import certificate file.", "error");
      return;
    }
    setCertificateInfo(info);
    setCertificateDraft(info.settings);
    showToast("Certificate trusted by Layang. New requests use it immediately.", "success");
  }, [showToast]);

  const clearCertificateSettingsPem = useCallback(async () => {
    const info = await clearCertificatePem();
    if (!info?.ok) {
      showToast(info?.error || "Failed to clear certificates.", "error");
      return;
    }
    setCertificateInfo(info);
    setCertificateDraft(info.settings);
    showToast("Certificates cleared.", "success");
  }, [showToast]);

  const removeCertificateSettingsItem = useCallback(
    async (certificateId: string) => {
      const nextCertificates = certificateDraft.caCertificates.filter(
        (certificate) => certificate.id !== certificateId,
      );
      const info = await updateCertificateSettings({
        ...certificateDraft,
        caCertificates: nextCertificates,
        caCertificatePem: nextCertificates.map((certificate) => certificate.pem).join(""),
      });
      if (!info?.ok) {
        showToast(info?.error || "Failed to remove certificate.", "error");
        return;
      }
      setCertificateInfo(info);
      setCertificateDraft(info.settings);
      showToast("Certificate removed.", "success");
    },
    [certificateDraft, showToast],
  );

  const refreshAppZoomInfo = useCallback(async () => {
    const info = await getAppZoomInfo();
    if (!info) return null;
    setAppZoomInfo(info);
    return info;
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void refreshAppZoomInfo();
    return subscribeAppZoomChanges(setAppZoomInfo);
  }, [hydrated, refreshAppZoomInfo]);

  const applyAppZoomAction = useCallback(
    async (action: () => Promise<LayangAppZoomInfo | null>, successMessage: string) => {
      const info = await action();
      if (!info) {
        showToast("Zoom is only available in the desktop app.", "warning");
        return;
      }
      if (!info.ok) {
        showToast(info.error || "Failed to update zoom.", "error");
        return;
      }
      setAppZoomInfo(info);
      showToast(successMessage, "success");
    },
    [showToast],
  );

  const zoomAppIn = useCallback(() => applyAppZoomAction(increaseAppZoom, "App zoom increased."), [applyAppZoomAction]);

  const zoomAppOut = useCallback(
    () => applyAppZoomAction(decreaseAppZoom, "App zoom decreased."),
    [applyAppZoomAction],
  );

  const resetAppZoomLevel = useCallback(
    () => applyAppZoomAction(resetAppZoom, "App zoom reset to 100%."),
    [applyAppZoomAction],
  );


  return {
    loggerSettingsOpen, setLoggerSettingsOpen, loggerInfo, loggerDraft, setLoggerDraft,
    loggerLevelOptions, openLoggerSettings, refreshLoggerSettings, saveLoggerSettings,
    openLogFolder, clearLogFiles,
    certificateSettingsOpen, setCertificateSettingsOpen, certificateInfo, certificateDraft,
    setCertificateDraft, openCertificateSettings, refreshCertificateSettings,
    saveCertificateSettings, importCertificateSettingsFile, clearCertificateSettingsPem,
    removeCertificateSettingsItem, appZoomInfo, zoomAppIn, zoomAppOut, resetAppZoomLevel,
  };
}
