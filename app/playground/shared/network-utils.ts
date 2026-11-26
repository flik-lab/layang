const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * True when a listen address lets other devices on the network connect
 * (0.0.0.0, ::, a LAN or public IP, or a non-loopback host name).
 */
export function isNetworkReachableListenHost(value: string | undefined | null): boolean {
  const host = String(value ?? "").trim().toLowerCase();
  if (!host) return false;
  if (LOOPBACK_HOSTS.has(host)) return false;
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return false;
  return true;
}
