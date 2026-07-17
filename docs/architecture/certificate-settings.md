# Certificate Settings

Layang supports internal HTTPS, self-signed APISIX, REST, gRPC-Web, and native gRPC lab targets without disabling TLS validation globally.

## User behavior

- Open **Certificate settings** from the Layang logo menu.
- Import one or more `.crt`, `.cer`, or `.pem` files.
- Review imported certificates as a list with name, SHA-256 fingerprint, and source path.
- Remove one certificate at a time or clear the full trusted list.
- Use **Bypass HTTPS certificate errors in this desktop app** only as an explicit local/lab escape hatch.

The dialog is English-only. There is no PEM text editor in the UI; users manage trusted certificates through import, remove, and clear-all actions. Clear-all only removes imported certificates; bypass mode stays at the last checkbox state.
Import, remove, and clear-all actions are persisted immediately and apply to new HTTPS, gRPC-Web, REST, and native gRPC requests without restarting the app. The Electron default session closes existing network connections after certificate settings change so subsequent renderer requests re-evaluate TLS policy.

## Storage

Settings are stored in Electron `userData` as `certificate-settings.json`, not in the workspace.

```json
{
  "version": 1,
  "caCertificatePem": "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----\n",
  "caCertificates": [
    {
      "id": "cert-...",
      "name": "gateway-ca.pem",
      "fingerprint": "...",
      "pem": "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----\n",
      "importedAt": "2026-07-08T00:00:00.000Z",
      "sourcePath": "C:/.../gateway-ca.pem"
    }
  ],
  "bypassTlsErrors": false,
  "updatedAt": "2026-07-08T00:00:00.000Z"
}
```

`caCertificates` is the UI source of truth. `caCertificatePem` remains as a combined PEM bundle for compatibility with native gRPC and older code paths.

## Import rules

- Supported file extensions: `.pem`, `.crt`, `.cer`.
- Each imported file may contain one or more PEM certificate blocks.
- Duplicate certificates are deduplicated by SHA-256 fingerprint.
- Invalid files are rejected with an actionable error.

## Electron HTTPS policy

Default behavior is safe: invalid HTTPS certificates are rejected.

When Electron raises `certificate-error`:

1. If bypass is enabled, accept the certificate error and log a warning.
2. Else, if the presented server certificate exactly matches one imported PEM certificate, accept it.
3. Else, reject the certificate error.

## Native gRPC policy

- `grpc://` uses insecure credentials.
- `grpcs://` and `https://` use `grpc.credentials.createSsl(Buffer.from(caCertificatePem))` when certificates are configured.
- Bypass mode is not applied to native gRPC. Import the CA/server PEM for secure native gRPC targets.

## Files

- `electron/utils/certificate-settings.cjs`
- `electron/ipc/certificate-settings-ipc.cjs`
- `electron/main.cjs`
- `electron/preload.cjs`
- `electron/services/native-grpc-runner.cjs`
- `types/electron.d.ts`
- `app/playground/shared/certificate-settings.ts`
- `app/playground/features/shell/use-workbench-container-model.tsx`
- `app/playground/features/shell/workbench-dialogs.tsx`
- `tests/certificate-settings.test.cjs`
