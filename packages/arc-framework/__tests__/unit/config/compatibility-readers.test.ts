/** Shared-corpus compatibility checks for tolerant and precedence-aware config readers. */

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { CONFIG_COMPATIBILITY_CASES } from "../../fixtures/config/cases.js";
import { resolveAllSettings } from "../../../src/lib/config/resolved-settings.js";
import { readConfigSettings } from "../../../src/lib/config/status-reader.js";
import { scriptGitExec } from "../../helpers/git-exec-fake.js";

const roots: string[] = [];

async function materializeConfig(content: string | null): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "arc-config-compatibility-"));
  roots.push(root);
  if (content !== null) {
    const directory = join(root, ".arc", "system");
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "arc-config.yml"), content);
  }
  return root;
}

function gitConfigExec(values: Readonly<Record<string, string>>) {
  return scriptGitExec([{
    match: { prefix: ["config", "--get"] },
    responses: [({ args }) => {
      const key = args[2];
      const value = key === undefined ? undefined : values[key];
      return value === undefined ? { failure: { exitCode: 1 } } : { stdout: `${value}\n` };
    }],
  }]).exec;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("configuration compatibility — tolerant status reader", () => {
  for (const fixture of CONFIG_COMPATIBILITY_CASES) {
    it(fixture.id, async () => {
      const root = await materializeConfig(fixture.config);
      const result = await readConfigSettings(root);

      expect(result.settings).toMatchObject(fixture.expected.status.settings);
      for (const key of fixture.expected.status.defaulted) {
        expect(result.defaultsApplied).toContain(key);
      }
      for (const key of fixture.expected.status.notDefaulted) {
        expect(result.defaultsApplied).not.toContain(key);
      }
      for (const text of fixture.expected.status.warningIncludes) {
        expect(result.warnings).toEqual(expect.arrayContaining([expect.stringContaining(text)]));
      }
      if (fixture.expected.status.warningIncludes.length === 0) {
        expect(result.warnings).toEqual([]);
      }
    });
  }
});

describe("configuration compatibility — resolved settings", () => {
  for (const fixture of CONFIG_COMPATIBILITY_CASES) {
    it(fixture.id, async () => {
      const root = await materializeConfig(fixture.config);
      const result = await resolveAllSettings({
        cwd: root,
        exec: gitConfigExec(fixture.gitConfig),
        readFile: (path) => readFile(path, "utf8"),
      });

      expect(result.resolved.notesPush).toEqual(fixture.expected.resolved.notesPush);
      for (const text of fixture.expected.resolved.warningIncludes) {
        expect(result.warnings).toEqual(expect.arrayContaining([expect.stringContaining(text)]));
      }
      if (fixture.expected.resolved.warningIncludes.length === 0) {
        expect(result.warnings).toEqual([]);
      }
    });
  }
});
