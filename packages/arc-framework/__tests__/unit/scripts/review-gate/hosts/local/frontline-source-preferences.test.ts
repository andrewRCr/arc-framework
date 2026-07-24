import { describe, expect, it, vi } from "vitest";

import { createLocalFrontlineSourcePreferenceReader } from "../../../../../../src/scripts/review-gate/hosts/local/frontline-source-preferences.js";

describe("local frontline source preferences", () => {
  it("reads the private developer key and tracked project default without mutation", async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: "personal-reviewer\nfallback-reviewer\n" });
    const readFile = vi.fn().mockResolvedValue("review.frontline_sources: [project-reviewer, fallback-reviewer]\n");
    const reader = createLocalFrontlineSourcePreferenceReader({ cwd: "/repo", exec, readFile });

    await expect(reader.readDeveloperSourceIds()).resolves.toEqual(["personal-reviewer", "fallback-reviewer"]);
    await expect(reader.readProjectSourceIds()).resolves.toEqual(["project-reviewer", "fallback-reviewer"]);
    expect(exec).toHaveBeenCalledWith("git", ["config", "--get-all", "arc.frontlineSources"]);
    expect(readFile.mock.calls[0]?.[0]).toMatch(/\.arc\/system\/arc-config\.yml$/u);
  });

  it("normalizes missing or empty preferences to empty lists", async () => {
    const reader = createLocalFrontlineSourcePreferenceReader({
      cwd: "/repo",
      exec: vi.fn().mockRejectedValue(new Error("unset")),
      readFile: vi.fn().mockResolvedValue("review.frontline_sources: []\n"),
    });

    await expect(reader.readDeveloperSourceIds()).resolves.toEqual([]);
    await expect(reader.readProjectSourceIds()).resolves.toEqual([]);
  });

  it.each(["[project-reviewer", "project-reviewer]"])(
    "rejects project preferences with unmatched brackets: %s",
    async (value) => {
      const reader = createLocalFrontlineSourcePreferenceReader({
        cwd: "/repo",
        exec: vi.fn().mockRejectedValue(new Error("unset")),
        readFile: vi.fn().mockResolvedValue(`review.frontline_sources: ${value}\n`),
      });

      await expect(reader.readProjectSourceIds()).resolves.toEqual([]);
    },
  );
});
