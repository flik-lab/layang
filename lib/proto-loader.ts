import * as protobuf from "protobufjs";
import type { LoadedProto, ProtoSourceFile, RpcMethodInfo } from "./types";

export type ProtoInputFile = ProtoSourceFile;

/**
 * Parses uploaded proto sources into a protobuf root and discovers callable RPC methods.
 */
export function loadProtoFiles(files: ProtoInputFile[]): LoadedProto {
  if (files.length === 0) {
    throw new Error("Upload at least one .proto file.");
  }

  const root = new protobuf.Root();
  const fileMap = new Map(files.map((file) => [normalizeProtoPath(file.name), file]));
  const parsedFiles = new Set<string>();
  const bundledImports = new Set<string>();

  for (const file of files) {
    parseFileIntoRoot(file.name, root, fileMap, parsedFiles, bundledImports);
  }

  try {
    root.resolveAll();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Proto parsed, but type resolution failed. Upload missing imported .proto files too. Google well-known types under google/protobuf/* are supported. Detail: ${message}`,
    );
  }

  const sourceMap = inferMethodSources(files);
  const methods = collectMethods(root).map((method) => {
    const source = sourceMap.get(`${method.serviceName}/${method.methodName}`);
    return source ? { ...method, sourceFile: source.fileName, packageName: source.packageName } : method;
  });

  return {
    root,
    methods,
    fileNames: files.map((file) => file.name),
    protoFiles: files,
  };
}

/**
 * Parses one proto source into the shared protobuf root while preserving parser metadata.
 */
function parseIntoRoot(source: string, filename: string, root: protobuf.Root): protobuf.IParserResult {
  const parseFn = protobuf.parse as unknown as (
    source: string,
    rootOrOptions?: protobuf.Root | protobuf.IParseOptions,
    maybeOptions?: protobuf.IParseOptions,
  ) => protobuf.IParserResult;
  (parseFn as typeof parseFn & { filename?: string }).filename = filename;

  return parseFn(source, root, {
    keepCase: false,
    alternateCommentMode: true,
  });
}

function parseFileIntoRoot(
  fileName: string,
  root: protobuf.Root,
  fileMap: Map<string, ProtoInputFile>,
  parsedFiles: Set<string>,
  bundledImports: Set<string>,
) {
  const normalizedName = normalizeProtoPath(fileName);
  if (parsedFiles.has(normalizedName)) return;

  const file = fileMap.get(normalizedName);
  if (!file) {
    throw new Error(`Missing imported proto: ${fileName}`);
  }

  parsedFiles.add(normalizedName);
  const parsed = parseIntoRoot(file.text, normalizedName, root);
  if (parsed.imports?.length) {
    root.comment = [root.comment, `imports:${file.name}:${parsed.imports.join(",")}`].filter(Boolean).join("\n");
  }

  for (const importedFile of parsed.imports ?? []) {
    if (loadBundledImport(root, importedFile, bundledImports)) continue;

    const resolved = resolveUserImport(normalizedName, importedFile, fileMap);
    if (!resolved) {
      throw new Error(`Missing imported proto: ${importedFile} (imported from ${file.name})`);
    }
    parseFileIntoRoot(resolved, root, fileMap, parsedFiles, bundledImports);
  }

  for (const importedFile of parsed.weakImports ?? []) {
    if (loadBundledImport(root, importedFile, bundledImports)) continue;

    const resolved = resolveUserImport(normalizedName, importedFile, fileMap);
    if (resolved) {
      parseFileIntoRoot(resolved, root, fileMap, parsedFiles, bundledImports);
    }
  }
}

function loadBundledImport(root: protobuf.Root, fileName: string, bundledImports: Set<string>): boolean {
  const normalizedName = normalizeProtoPath(fileName);
  const bundledDefinition = protobuf.common.get(normalizedName);
  if (!bundledDefinition) return false;
  if (bundledImports.has(normalizedName)) return true;

  bundledImports.add(normalizedName);
  if (bundledDefinition.options) {
    root.setOptions(bundledDefinition.options);
  }
  root.addJSON(bundledDefinition.nested ?? {});
  return true;
}

function resolveUserImport(
  fromFile: string,
  importedFile: string,
  fileMap: Map<string, ProtoInputFile>,
): string | null {
  const normalizedImport = normalizeProtoPath(importedFile);
  if (fileMap.has(normalizedImport)) return normalizedImport;

  const originParts = normalizeProtoPath(fromFile).split("/");
  originParts.pop();
  const combined = normalizeProtoPath([...originParts, normalizedImport].join("/"));
  return fileMap.has(combined) ? combined : null;
}

function normalizeProtoPath(fileName: string): string {
  const normalized = fileName.replaceAll("\\", "/");
  const segments: string[] = [];

  for (const segment of normalized.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (segments.length > 0 && segments[segments.length - 1] !== "..") {
        segments.pop();
      } else {
        segments.push(segment);
      }
      continue;
    }
    segments.push(segment);
  }

  return segments.join("/");
}

/**
 * Builds a lookup from service/method pairs to the proto file that declares them.
 */
function inferMethodSources(files: ProtoSourceFile[]): Map<string, { fileName: string; packageName: string }> {
  const output = new Map<string, { fileName: string; packageName: string }>();

  for (const file of files) {
    const packageName = parsePackageName(file.text);
    const servicePattern = /service\s+([A-Za-z_][\w]*)\s*\{([\s\S]*?)\n\}/g;
    let serviceMatch = servicePattern.exec(file.text);

    while (serviceMatch !== null) {
      const serviceShortName = serviceMatch[1];
      const serviceName = packageName ? `${packageName}.${serviceShortName}` : serviceShortName;
      const serviceBody = serviceMatch[2];
      const rpcPattern = /rpc\s+([A-Za-z_][\w]*)\s*\(/g;
      let rpcMatch = rpcPattern.exec(serviceBody);

      while (rpcMatch !== null) {
        output.set(`${serviceName}/${rpcMatch[1]}`, { fileName: file.name, packageName });
        rpcMatch = rpcPattern.exec(serviceBody);
      }

      serviceMatch = servicePattern.exec(file.text);
    }
  }

  return output;
}

/**
 * Extracts the package name from proto source text.
 */
function parsePackageName(source: string): string {
  return source.match(/(?:^|\n)\s*package\s+([A-Za-z_][\w.]*)\s*;/)?.[1] ?? "";
}

/**
 * Walks a protobuf root and returns all service methods as UI-friendly descriptors.
 */
export function collectMethods(root: protobuf.Root): RpcMethodInfo[] {
  const methods: RpcMethodInfo[] = [];

  /**
   * Recursively visits protobuf namespaces while collecting services and methods.
   */
  function walk(namespace: protobuf.NamespaceBase) {
    for (const item of namespace.nestedArray ?? []) {
      if (item instanceof protobuf.Service) {
        for (const method of item.methodsArray) {
          methods.push({
            serviceName: item.fullName.replace(/^\./, ""),
            methodName: method.name,
            requestType: method.resolvedRequestType?.fullName.replace(/^\./, "") ?? method.requestType,
            responseType: method.resolvedResponseType?.fullName.replace(/^\./, "") ?? method.responseType,
            requestStream: Boolean(method.requestStream),
            responseStream: Boolean(method.responseStream),
          });
        }
      }

      if ("nestedArray" in item) {
        walk(item as protobuf.NamespaceBase);
      }
    }
  }

  walk(root);
  return methods.sort((a, b) => `${a.serviceName}/${a.methodName}`.localeCompare(`${b.serviceName}/${b.methodName}`));
}

/**
 * Returns a stable display label for one RPC method.
 */
export function methodLabel(method: RpcMethodInfo): string {
  const mode = method.requestStream
    ? method.responseStream
      ? "bidi streaming"
      : "client streaming"
    : method.responseStream
      ? "server streaming"
      : "unary";

  return `${method.serviceName}/${method.methodName} (${mode})`;
}
