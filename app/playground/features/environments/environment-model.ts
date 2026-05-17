export type TransportMode = "grpc-web" | "native-grpc";
export type EnvironmentKey = string;

export type EnvironmentConfig = {
  key: string;
  label: string;
  grpcWebBaseUrl: string;
  nativeTarget: string;
};

export const defaultEnvironments: EnvironmentConfig[] = [
  {
    key: "dev",
    label: "Develop Env",
    grpcWebBaseUrl: "http://127.0.0.1:9080/grpc/web",
    nativeTarget: "127.0.0.1:50051",
  },
  {
    key: "testing",
    label: "Testing Env",
    grpcWebBaseUrl: "http://127.0.0.1:9081/grpc/web",
    nativeTarget: "127.0.0.1:50052",
  },
  {
    key: "prod",
    label: "Prod Env",
    grpcWebBaseUrl: "https://grpc.example.com/grpc/web",
    nativeTarget: "grpc.example.com:443",
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
  return label.length > 3 ? `${label.slice(0, 3)}...` : label;
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
    if (env) return transport === "grpc-web" ? env.grpcWebBaseUrl : env.nativeTarget;
  }
  return transport === "grpc-web" ? fallbackBaseUrl : fallbackNativeTarget;
}
