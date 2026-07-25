/** Shared-corpus compatibility checks for strict commit and worktree config adapters. */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { CONFIG_COMPATIBILITY_CASES } from "../../fixtures/config/cases.js";
import {
  readCommitCheckConfiguration,
  resolveCommitCheckPolicy,
} from "../../../src/lib/commit-check/index.js";
import { parseArcConfig } from "../../../src/lib/config/index.js";
import { readConfigSettings } from "../../../src/lib/config/status-reader.js";
import { parseRegisteredHarnessDirs } from "../../../src/lib/git/worktree-harness-dirs.js";
import { resolveWorktreeLocation } from "../../../src/lib/git/worktree-location.js";

const roots: string[] = [];

async function materializeConfig(content: string | null): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "arc-config-strict-compatibility-"));
  roots.push(root);
  if (content !== null) {
    const directory = join(root, ".arc", "system");
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "arc-config.yml"), content);
  }
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("configuration compatibility — commit-check policy", () => {
  for (const fixture of CONFIG_COMPATIBILITY_CASES) {
    it(fixture.id, () => {
      const values = parseArcConfig(fixture.config ?? "");
      const result = resolveCommitCheckPolicy(readCommitCheckConfiguration(values));

      expect(result.kind).toBe(fixture.expected.commitCheck.kind);
      expect(result.kind === "invalid" ? result.findings.map(({ code }) => code) : []).toEqual(
        fixture.expected.commitCheck.findingCodes,
      );
    });
  }
});

describe("configuration compatibility — worktree adapters", () => {
  for (const fixture of CONFIG_COMPATIBILITY_CASES) {
    it(fixture.id, async () => {
      const root = await materializeConfig(fixture.config);
      const { settings } = await readConfigSettings(root);
      const location = () => resolveWorktreeLocation({
        template: settings["worktree.location_template"],
        repo: "arc-framework",
        name: "example",
        branch: "feat/example",
      });
      const harnessDirs = () => parseRegisteredHarnessDirs(settings["worktree.harness_dirs"]);

      if (fixture.expected.worktree.location.kind === "throws") {
        expect(location).toThrow(fixture.expected.worktree.location.messageIncludes);
      } else {
        expect(location()).toEqual(fixture.expected.worktree.location.value);
      }

      if (fixture.expected.worktree.harnessDirs.kind === "throws") {
        expect(harnessDirs).toThrow(fixture.expected.worktree.harnessDirs.messageIncludes);
      } else {
        expect(harnessDirs()).toEqual(fixture.expected.worktree.harnessDirs.value);
      }
    });
  }
});
