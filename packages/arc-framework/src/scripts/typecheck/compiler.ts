/** Resolve the aliased native TypeScript compiler without consulting npm's bin links. */
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

export interface CompilerIO {
  resolve: (specifier: string, from: string) => string;
  readFile: (path: string) => string;
  realpath: (path: string) => string;
}

/** Paths for the Node launcher and the native executable it replaces itself with. */
export interface CompilerPaths {
  launcher: string;
  nativeBinary: string;
}

const installedIO: CompilerIO = {
  resolve: (specifier, from) => createRequire(from).resolve(specifier),
  readFile: path => readFileSync(path, "utf8"),
  realpath: realpathSync,
};

/** Resolve both installed packages, with a repair instruction on missing installation evidence. */
export function resolveCompiler(platform: string, arch: string, io: CompilerIO = installedIO): CompilerPaths {
  let packageName = "typescript-7";
  try {
    const manifest = io.resolve(`${packageName}/package.json`, import.meta.url);
    const data: unknown = JSON.parse(io.readFile(manifest));
    if (typeof data !== "object" || data === null || !("bin" in data)
      || typeof data.bin !== "object" || data.bin === null || !("tsc" in data.bin)
      || typeof data.bin.tsc !== "string") throw new Error("Missing bin.tsc");
    const launcher = io.realpath(resolve(dirname(manifest), data.bin.tsc));
    packageName = `@typescript/typescript-${platform}-${arch}`;
    const nativeManifest = io.resolve(`${packageName}/package.json`, manifest);
    const nativeBinary = io.realpath(resolve(dirname(nativeManifest), "lib", platform === "win32" ? "tsc.exe" : "tsc"));
    return { launcher, nativeBinary };
  } catch (cause) {
    throw new Error(`Compiler installation unavailable: ${packageName}; run npm ci.`, { cause });
  }
}
