import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

function ensureElectronWinstaller7z() {
  const vendorDir = path.join(rootDir, "node_modules", "electron-winstaller", "vendor");
  const arch = os.arch();

  for (const extension of ["exe", "dll"]) {
    const source = path.join(vendorDir, `7z-${arch}.${extension}`);
    const target = path.join(vendorDir, `7z.${extension}`);

    if (fs.existsSync(source)) {
      fs.copyFileSync(source, target);
    }
  }
}

export default {
  packagerConfig: {
    name: "Layang",
    executableName: "Layang",
    appBundleId: "labs.layang.desktop",
    appCategoryType: "public.app-category.developer-tools",
    icon: path.join(rootDir, "electron", "assets", "icon"),
    asar: true,
    ignore: [
      /^\/\.github($|\/)/,
      /^\/\.next($|\/)/,
      /^\/docs($|\/)/,
      /^\/github-pages($|\/)/,
      /^\/tests($|\/)/,
      /^\/layangMock\.rar$/,
      /^\/tsconfig\.tsbuildinfo$/,
    ],
  },
  rebuildConfig: {},
  outDir: "dist",
  hooks: {
    preMake: async () => {
      ensureElectronWinstaller7z();
    },
  },
  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      platforms: ["win32"],
      config: {
        name: "Layang",
        authors: "Layang contributors",
        description: "Local-first gRPC and mock server workbench.",
        setupIcon: path.join(rootDir, "electron", "assets", "icon-layang.ico"),
      },
    },
    {
      name: "@electron-forge/maker-zip",
      platforms: ["darwin", "win32", "linux"],
    },
    {
      name: "@electron-forge/maker-dmg",
      platforms: ["darwin"],
      config: {
        icon: path.join(rootDir, "electron", "assets", "icon.icns"),
        overwrite: true,
      },
    },
    {
      name: "@electron-forge/maker-deb",
      platforms: ["linux"],
      config: {
        options: {
          maintainer: "Layang contributors <hello@layang.local>",
          homepage: "https://github.com/flik-lab/layang",
          icon: path.join(rootDir, "electron", "assets", "icon.png"),
          categories: ["Development"],
          section: "devel",
          priority: "optional",
          description:
            "Layang is a local-first gRPC, gRPC-Web, proto, and mock server workbench with Git-friendly workspaces.",
        },
      },
    },
    {
      name: "@electron-forge/maker-rpm",
      platforms: ["linux"],
      config: {
        options: {
          homepage: "https://github.com/flik-lab/layang",
          icon: path.join(rootDir, "electron", "assets", "icon.png"),
          categories: ["Development"],
          license: "MIT",
          description:
            "Layang is a local-first gRPC, gRPC-Web, proto, and mock server workbench with Git-friendly workspaces.",
        },
      },
    },
  ],
};
