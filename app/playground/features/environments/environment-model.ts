export type TransportMode = "grpc-web" | "native-grpc" | "websocket" | "rest";
export type EnvironmentKey = string;

export type EnvironmentConfig = {
  key: string;
  label: string;
  grpcWebBaseUrl: string;
  nativeTarget: string;
  websocketUrl: string;
  restBaseUrl: string;
};

export const defaultEnvironments: EnvironmentConfig[] = [
  {
    key: "dev",
    label: "Develop Env",
    grpcWebBaseUrl: "http://127.0.0.1:9080/grpc/web",
    nativeTarget: "127.0.0.1:50051",
    websocketUrl: "ws://127.0.0.1:8080",
    restBaseUrl: "http://127.0.0.1:3000",
  },
  {
    key: "testing",
    label: "Testing Env",
    grpcWebBaseUrl: "http://127.0.0.1:9081/grpc/web",
    nativeTarget: "127.0.0.1:50052",
    websocketUrl: "ws://127.0.0.1:8081",
    restBaseUrl: "http://127.0.0.1:3001",
  },
  {
    key: "prod",
    label: "Prod Env",
    grpcWebBaseUrl: "https://grpc.example.com/grpc/web",
    nativeTarget: "grpc.example.com:443",
    websocketUrl: "wss://ws.example.com",
    restBaseUrl: "https://api.example.com",
  },
];

/** Returns true when a value can be used as an environment key. */
export function isEnvironmentKey(value: unknown): value is EnvironmentKey {
  return typeof value === "string" && value.length > 0;
}

/** Merges default and custom environments without duplicates. */
export function mergeEnvironments(input?: EnvironmentConfig[]): EnvironmentConfig[] {
  const byKey = new Map<string, EnvironmentConfig>();
  for (const env of defaultEnvironments) byKey.set(env.key, { ...env });
  if (Array.isArray(input)) {
    for (const env of input) {
      if (!env || typeof env.key !== "string" || !env.key.trim()) continue;
      const fallback = defaultEnvironments.find((item) => item.key === env.key);
      byKey.set(env.key, {
        key: env.key,
        label: env.label || fallback?.label || env.key,
        grpcWebBaseUrl: env.grpcWebBaseUrl || fallback?.grpcWebBaseUrl || "",
        nativeTarget: env.nativeTarget || fallback?.nativeTarget || "",
        websocketUrl: env.websocketUrl || fallback?.websocketUrl || (env.grpcWebBaseUrl?.startsWith("ws") ? env.grpcWebBaseUrl : ""),
        restBaseUrl: env.restBaseUrl || fallback?.restBaseUrl || env.grpcWebBaseUrl || "",
      });
    }
  }
  const defaults = defaultEnvironments.map((env) => byKey.get(env.key) ?? env);
  const custom = Array.from(byKey.values()).filter((env) => !defaultEnvironments.some((item) => item.key === env.key));
  return [...defaults, ...custom];
}

/** Resolves the display label for an environment key. */
export function environmentLabel(environments: EnvironmentConfig[], key: EnvironmentKey): string {
  if (key === "default") return "None";
  if (key === "manual") return "Manual";
  return environments.find((env) => env.key === key)?.label ?? "Env";
}

/** Resolves a short label for the compact environment button. */
export function environmentShortLabel(environments: EnvironmentConfig[], key: EnvironmentKey): string {
  const label = environmentLabel(environments, key);
  return label.length > 8 ? `${label.slice(0, 8)}...` : label;
}

/** Resolves the URL/target to use for a transport mode and environment key. */
export function getEnvironmentTarget(
  environments: EnvironmentConfig[],
  key: EnvironmentKey,
  transport: TransportMode,
  fallbackBaseUrl: string,
  fallbackNativeTarget: string,
): string {
  if (key !== "default" && key !== "manual") {
    const env = environments.find((item) => item.key === key) ?? defaultEnvironments.find((item) => item.key === key);
    if (env) return getEnvironmentTransportTarget(env, transport);
  }
  return transport === "native-grpc" ? fallbackNativeTarget : fallbackBaseUrl;
}

/** Reads the transport-specific target stored on an environment. */
export function getEnvironmentTransportTarget(env: EnvironmentConfig, transport: TransportMode): string {
  switch (transport) {
    case "native-grpc":
      return env.nativeTarget;
    case "websocket":
      return env.websocketUrl;
    case "rest":
      return env.restBaseUrl;
    case "grpc-web":
      return env.grpcWebBaseUrl;
  }
}

/** Updates only the field that belongs to the selected transport. */
export function setEnvironmentTransportTarget(
  env: EnvironmentConfig,
  transport: TransportMode,
  value: string,
): EnvironmentConfig {
  switch (transport) {
    case "native-grpc":
      return { ...env, nativeTarget: value };
    case "websocket":
      return { ...env, websocketUrl: value };
    case "rest":
      return { ...env, restBaseUrl: value };
    case "grpc-web":
      return { ...env, grpcWebBaseUrl: value };
  }
}
