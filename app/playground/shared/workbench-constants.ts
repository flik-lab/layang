import type { MetadataPair } from "@/lib/types";
import { designSystem } from "../design-system";

declare const process: { env?: Record<string, string | undefined> } | undefined;

export const projectStorageKey = "layang-project-v2";
export const legacyWorkspaceKey = "grpc-lab-workspaces-v1";
export const legacyActiveWorkspaceKey = "grpc-lab-active-workspace-v1";
export const railWidth = 46;
export const sidebarWidth = 278;
export const minSidebarWidth = 224;
export const maxSidebarWidth = 440;
export const defaultResponseHeight = 340;
export const minResponseHeight = 160;
export const layoutStorageKey = "layang-layout-v1";
export const legacyProjectStorageKey = "grpc-lab-project-v2";
export const legacyLayoutStorageKey = "grpc-lab-layout-v1";
export const workspaceFolderStorageKey = "layang-workspace-folder-v1";
export const appLogoSrc = "./layang-logo.png";
export const configuredLogLevel = (
  process?.env?.NEXT_PUBLIC_LAYANG_LOG_LEVEL ??
  process?.env?.NEXT_PUBLIC_GRPC_LAB_LOG_LEVEL ??
  "info"
).toLowerCase();
export const defaultUnaryDeadlineMs = 120000;
export const maxMessagesPerRequest = 500;
export const maxUiEventsPerSession = 650;
export const maxStoredEventsPerSession = 160;
export const maxStoredMessagesPerResult = 120;
export const maxPayloadPreviewChars = 12000;
export const maxJsonBlockChars = 60000;

export const buttonSx = {
  minHeight: designSystem.size.buttonSmallHeight,
  height: designSystem.size.buttonSmallHeight,
  px: 1,
  fontSize: designSystem.font.label,
  lineHeight: 1,
  whiteSpace: "nowrap",
} as const;

export const iconButtonSx = {
  width: designSystem.size.iconButton,
  height: designSystem.size.iconButton,
  p: 0.35,
  borderRadius: 1.2,
} as const;

export const compactCardSx = {
  p: designSystem.space.cardPadding,
  borderRadius: designSystem.size.cardRadius,
} as const;

export const nowrapTextSx = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} as const;

export const defaultMetadata: MetadataPair[] = [
  { key: "authorization", value: "Bearer <token>" },
  { key: "x-request-id", value: "{{$uuid}}" },
];

export const defaultAssertion = "";
export const defaultMockPort = 50055;
export const defaultMockStreamIntervalMs = 500;
export const defaultMockStreamLoop = false;
export const defaultMockScenarioText = JSON.stringify(
  {
    version: 1,
    scenarios: [],
  },
  null,
  2,
);

export const sampleProto = `syntax = "proto3";

package demo.v1;

service GreeterService {
  rpc SayHello (SayHelloRequest) returns (SayHelloResponse);
  rpc WatchHello (WatchHelloRequest) returns (stream SayHelloResponse);
}

message SayHelloRequest {
  string name = 1;
  int32 age = 2;
}

message WatchHelloRequest {
  string name = 1;
  int32 count = 2;
}

message SayHelloResponse {
  string message = 1;
  int64 sequence = 2;
}
`;

export const panelSx = {
  border: "1px solid",
  borderColor: "divider",
  bgcolor: "background.paper",
  overflow: "hidden",
} as const;
