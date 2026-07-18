import { describe, expect, it, vi } from "vitest";

import { collectCorpus } from "../../../../src/lib/coupling-audit/corpus.js";
import type { CouplingManifest } from "../../../../src/lib/coupling-audit/types.js";

const corpus: CouplingManifest["corpus"] = {
  packageRoot: "packages/arc-framework",
  installedDelta: [".arc/system/arc-config.yml"],
  repoRootDelta: [".husky/pre-commit"],
  excluded: [],
};

describe("collectCorpus", () => {
  it("collects hidden and extensionless tracked files in canonical order", async () => {
    const git = vi.fn().mockResolvedValue({
      stdout: [
        ".husky/pre-commit",
        "packages/arc-framework/src/z.ts",
        ".arc/system/arc-config.yml",
        "packages/arc-framework/arc/system/.internal/githooks/pre-commit",
        "packages/arc-framework/src/z.ts",
        "",
      ].join("\0"),
      stderr: "",
    });
    const readFile = vi.fn<(path: string) => Promise<Uint8Array>>().mockImplementation(async (path) =>
      new TextEncoder().encode(`content:${path}`),
    );
    const files = await collectCorpus(corpus, { git, readFile });
    expect(git).toHaveBeenCalledWith("git", [
      "ls-files",
      "--cached",
      "-z",
      "--",
      "packages/arc-framework",
      ".arc/system/arc-config.yml",
      ".husky/pre-commit",
    ]);
    expect(files.map((file) => [file.path, file.surfaceKind, file.locus])).toEqual([
      [".arc/system/arc-config.yml", "config", "installed-delta"],
      [".husky/pre-commit", "code", "repo-root-delta"],
      ["packages/arc-framework/arc/system/.internal/githooks/pre-commit", "code", "package"],
      ["packages/arc-framework/src/z.ts", "code", "package"],
    ]);
  });

  it("rejects a missing exact delta file", async () => {
    const git = vi.fn().mockResolvedValue({ stdout: "packages/arc-framework/src/z.ts\0", stderr: "" });
    await expect(
      collectCorpus(corpus, { git, readFile: async () => new TextEncoder().encode("ok") }),
    ).rejects.toThrow("Missing tracked corpus path: .arc/system/arc-config.yml");
  });

  it("reports fatal UTF-8 and filesystem failures with the path", async () => {
    const git = vi.fn().mockResolvedValue({
      stdout: "packages/arc-framework/src/z.ts\0.arc/system/arc-config.yml\0.husky/pre-commit\0",
      stderr: "",
    });
    const readFile = vi.fn<(path: string) => Promise<Uint8Array>>().mockImplementation(async (path) => {
      if (path.endsWith("z.ts")) return Uint8Array.from([0xc3, 0x28]);
      return new TextEncoder().encode("ok");
    });
    await expect(collectCorpus(corpus, { git, readFile })).rejects.toThrow(
      "packages/arc-framework/src/z.ts",
    );
  });
});
