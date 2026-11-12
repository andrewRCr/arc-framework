import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveCompiler, type CompilerIO } from "../../../../src/scripts/typecheck/compiler.js";

function installation(missing?: string): CompilerIO {
  return {
    resolve: (name, from) => {
      if (name.startsWith(missing ?? "never-missing")) throw new Error("MODULE_NOT_FOUND");
      if (name === "typescript-7/package.json") return "/deps/typescript-7/package.json";
      if (from !== "/deps/typescript-7/package.json") throw new Error("Wrong resolution context");
      return `/deps/${name}`;
    },
    readFile: () => JSON.stringify({ bin: { tsc: "./bin/tsc" } }),
    realpath: path => path,
  };
}

describe("native compiler installation", () => {
  it("resolves the alias launcher and the native platform binary", () => {
    expect(resolveCompiler("linux", "x64", installation())).toEqual({
      launcher: resolve("/deps/typescript-7/bin/tsc"),
      nativeBinary: resolve("/deps/@typescript/typescript-linux-x64/lib/tsc"),
    });
  });
  it("selects the Windows executable", () => {
    expect(resolveCompiler("win32", "arm64", installation()).nativeBinary)
      .toBe(resolve("/deps/@typescript/typescript-win32-arm64/lib/tsc.exe"));
  });
  it.each(["typescript-7", "@typescript/typescript-linux-x64"])("names missing %s and its repair", name => {
    expect(() => resolveCompiler("linux", "x64", installation(name))).toThrow(new RegExp(`${name}.*npm ci`));
  });
});
