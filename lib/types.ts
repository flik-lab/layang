import type * as protobuf from "protobufjs";

export type RpcMethodInfo = {
  serviceName: string;
  methodName: string;
  sourceFile?: string;
  packageName?: string;
  requestType: string;
  responseType: string;
  requestStream: boolean;
  responseStream: boolean;
};

export type ProtoSourceFile = {
  name: string;
  text: string;
};

export type LoadedProto = {
  root: protobuf.Root;
  methods: RpcMethodInfo[];
  fileNames: string[];
  protoFiles: ProtoSourceFile[];
};

export type MetadataPair = {
  key: string;
  value: string;
};

export type GrpcFrame =
  | {
      kind: "data";
      payload: Uint8Array<ArrayBufferLike>;
    }
  | {
      kind: "trailers";
      payload: Uint8Array<ArrayBufferLike>;
      trailers: Record<string, string>;
    };

export type GrpcEvent =
  | {
      type: "log";
      level: "debug" | "info" | "warn" | "error";
      message: string;
      details?: unknown;
    }
  | {
      type: "headers";
      httpStatus: number;
      headers: Record<string, string>;
      contentType: string;
    }
  | {
      type: "message";
      index: number;
      value: unknown;
    }
  | {
      type: "trailers";
      trailers: Record<string, string>;
    }
  | {
      type: "error";
      message: string;
      details?: unknown;
    }
  | {
      type: "end";
      summary: GrpcResult;
    };

export type GrpcResult = {
  httpStatus: number;
  headers: Record<string, string>;
  trailers: Record<string, string>;
  messages: unknown[];
  totalMessages?: number;
  droppedMessages?: number;
  durationMs: number;
  requestUrl: string;
  startedAt?: string;
  completedAt?: string;
  transport?: "grpc-web" | "native-grpc";
};
