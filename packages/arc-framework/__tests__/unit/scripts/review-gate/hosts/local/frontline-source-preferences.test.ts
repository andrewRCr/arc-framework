import { describe, expect, it, vi } from "vitest";

import { createLocalFrontlineSourcePreferenceReader } from "../../../../../../src/scripts/review-gate/hosts/local/frontline-source-preferences.js";

describe("local frontline source preferences", () => {
  it("reads the private developer key and tracked project default without mutation", async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: "personal-reviewer\n" });
    const readFile = vi.fn().mockResolvedValue("review.frontline_source: project-reviewer\n");
    const reader = createLocalFrontlineSourcePreferenceReader({ cwd: "/repo", exec, readFile });

    await expect(reader.readDeveloperSourceId()).resolves.toBe("personal-reviewer");
    await expect(reader.readProjectSourceId()).resolves.toBe("project-reviewer");
    expect(exec).toHaveBeenCalledWith("git", ["config", "--get", "arc.frontlineSource"]);
    expect(readFile.mock.calls[0]?.[0]).toMatch(/\.arc\/system\/arc-config\.yml$/u);
  });

  it("normalizes missing or empty preferences to null", async () => {
    const reader = createLocalFrontlineSourcePreferenceReader({
      cwd: "/repo",
      exec: vi.fn().mockRejectedValue(new Error("unset")),
      readFile: vi.fn().mockResolvedValue("review.frontline_source:\n"),
    });

    await expect(reader.readDeveloperSourceId()).resolves.toBeNull();
    await expect(reader.readProjectSourceId()).resolves.toBeNull();
  });
});
