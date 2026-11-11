import type { ProtoSourceFile } from "@/lib/types";

export async function readProtoImportFiles(files: FileList | null): Promise<{
  sources: ProtoSourceFile[];
  archiveName?: string;
}> {
  const selection = Array.from(files ?? []);
  const zip = selection.find(file => !file.webkitRelativePath && /\.zip$/i.test(file.name));
  if (zip) {
    if (selection.length !== 1) throw new Error("Choose a ZIP archive by itself.");
    if (zip.size > 16 * 1024 * 1024) throw new Error("Choose a ZIP archive up to 16 MiB.");
    if (!window.electronProtoImport) throw new Error("ZIP import is available in Layang Desktop.");
    const result = await window.electronProtoImport.readZip(new Uint8Array(await zip.arrayBuffer()));
    if (!result.ok || !result.files?.length) throw new Error(result.error || "Could not import proto ZIP.");
    return { sources: result.files, archiveName: zip.name.replace(/\.zip$/i, "") };
  }

  const selected = selection.filter(file => /\.proto$/i.test(file.name));
  if (!selected.length) throw new Error("Select one or more .proto files.");
  const sources = await Promise.all(selected.map(async file => ({
    name: file.webkitRelativePath || file.name,
    text: await file.text(),
  })));
  return { sources };
}
