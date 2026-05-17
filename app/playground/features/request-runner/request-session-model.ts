import type * as protobuf from "protobufjs";
import { generateExampleFromType } from "@/lib/example-generator";
import type { MetadataPair, RpcMethodInfo } from "@/lib/types";
import { createId } from "../../shared/entity-utils";
import { methodKey } from "../../shared/rpc-method-utils";
import { defaultAssertion, defaultMetadata } from "../../shared/workbench-constants";
import type { EnvironmentKey, RequestSession, TransportMode } from "../../shared/workbench-types";

export function createRequestSession(
  root: protobuf.Root,
  method: RpcMethodInfo,
  options: {
    requestJson?: string;
    metadata?: MetadataPair[];
    transportMode?: TransportMode;
    baseUrl?: string;
    nativeTarget?: string;
    environmentKey?: EnvironmentKey;
    assertionJson?: string;
    titleSuffix?: string;
  } = {},
): RequestSession {
  const now = new Date().toISOString();
  const title = options.titleSuffix ? `${method.methodName} · ${options.titleSuffix}` : method.methodName;
  return {
    id: createId(),
    methodKey: methodKey(method),
    title,
    serviceName: method.serviceName,
    requestJson: options.requestJson ?? JSON.stringify(generateExampleFromType(root, method.requestType), null, 2),
    metadata: (options.metadata ?? defaultMetadata).map((item) => ({ ...item })),
    transportMode: options.transportMode ?? "grpc-web",
    baseUrl: options.baseUrl ?? "http://localhost:9080/grpc/web",
    nativeTarget: options.nativeTarget ?? "localhost:50051",
    environmentKey: options.environmentKey ?? "default",
    assertionJson: options.assertionJson ?? defaultAssertion,
    responseTab: "messages",
    events: [],
    lastResult: null,
    assertionResults: [],
    running: false,
    status: "idle",
    openedAt: now,
    updatedAt: now,
  };
}
