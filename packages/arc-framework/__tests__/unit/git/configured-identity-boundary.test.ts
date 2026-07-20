/** Architecture coverage for the configured identity read authority. */

import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
  });
}

describe("configured identity read boundary", () => {
  it("keeps direct arc.identity Git reads inside the identity owner", () => {
    const sourceRoot = resolve(import.meta.dirname, "../../../src");
    const allowed = "lib/git/identity.ts";
    const offenders = sourceFiles(sourceRoot).flatMap((path) => {
      const file = relative(sourceRoot, path).split("\\").join("/");
      if (file === allowed) return [];
      const source = readFileSync(path, "utf8");
      return /gitConfigGet\([^)]*["']arc\.identity["']|["']config["']\s*,[^\]]*["']--get["'][^\]]*["']arc\.identity["']/u
        .test(source) ? [file] : [];
    });

    expect(offenders).toEqual([]);
  });
});
