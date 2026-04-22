/**
 * Framework sync drift check — verifies this repo's `.arc/` state stays
 * consistent with its package source under the current install config.
 *
 * Unlike most tests in this directory (which exercise CLI commands against
 * temp repos created by `arc init`), this test validates the self-hosting
 * loop: the Framework-classified files in `packages/arc-framework/arc/`,
 * rendered with this project's stored `install_config`, should produce
 * content identical to the files in `.arc/`.
 *
 * When this test fails, a Framework file was edited in one copy without
 * being mirrored to the other. Fix by mirroring the edit to the lagging
 * copy — see `strategy-package-project-sync.md` for the direction rules.
 *
 * Scope: Framework classification only. Scaffolded files are adopter-owned
 * and Configurable files have customizable sections, so both are expected
 * to diverge between package source and `.arc/`.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { renderTokens, renderConditionals } from "../../src/lib/template/render.js";
import { readManifest } from "../../src/lib/manifest/index.js";
import { buildConfigMap, buildTokenMap } from "../../src/lib/config/index.js";
import type { Manifest } from "../../src/lib/types.js";

const currentDir = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT_DIR = resolve(currentDir, "../../../..");
const ARC_DIR = join(REPO_ROOT_DIR, ".arc");
const PKG_ARC_DIR = join(REPO_ROOT_DIR, "packages/arc-framework/arc");

/**
 * Locate the package source for a `.arc/`-relative path.
 *
 * Templates are stored with a `.template.{ext}` suffix in package source;
 * non-template files use the plain path. Prefer the template variant — if
 * it exists, the file needs rendering; otherwise it's copied as-is.
 */
async function loadPackageSource(
  relPath: string,
): Promise<{ content: string; rendered: boolean } | null> {
  const plain = join(PKG_ARC_DIR, relPath);
  const dotIdx = plain.lastIndexOf(".");
  const template =
    dotIdx >= 0
      ? plain.slice(0, dotIdx) + ".template" + plain.slice(dotIdx)
      : plain + ".template";
  try {
    const content = await readFile(template, "utf-8");
    return { content, rendered: true };
  } catch {
    try {
      const content = await readFile(plain, "utf-8");
      return { content, rendered: false };
    } catch {
      return null;
    }
  }
}

describe("framework sync (self-hosting drift check)", () => {
  let manifest: Manifest;
  let tokens: Record<string, string>;
  let conditionals: Record<string, string>;

  beforeAll(async () => {
    const loaded = await readManifest(
      join(ARC_DIR, "system/.internal/manifest.json"),
      (p) => readFile(p, "utf-8"),
    );
    if (!loaded) {
      throw new Error("manifest missing — cannot run drift check");
    }
    manifest = loaded;

    const cfg = manifest.install_config;
    if (!cfg.repo_root) {
      throw new Error(
        "manifest.install_config.repo_root missing — run `arc init` or `arc update` to populate it",
      );
    }
    tokens = buildTokenMap({ project_name: cfg.project_name }, cfg.repo_root);
    conditionals = buildConfigMap({
      pm_mode: cfg.pm_mode,
      tools: cfg.tools,
      team_mode: cfg.team_mode,
    });
  });

  it("every Framework file in .arc/ matches its rendered package source", async () => {
    const drifts: string[] = [];

    for (const [relPath, entry] of Object.entries(manifest.files)) {
      if (entry.classification !== "Framework") continue;

      const pkg = await loadPackageSource(relPath);
      if (!pkg) {
        drifts.push(`${relPath}: package source missing`);
        continue;
      }

      const expected = pkg.rendered
        ? renderConditionals(renderTokens(pkg.content, tokens), conditionals)
        : pkg.content;

      let actual: string;
      try {
        actual = await readFile(join(ARC_DIR, relPath), "utf-8");
      } catch {
        drifts.push(`${relPath}: .arc/ copy missing`);
        continue;
      }

      if (expected !== actual) {
        const eLines = expected.split("\n");
        const aLines = actual.split("\n");
        const maxLen = Math.max(eLines.length, aLines.length);
        let firstDiff = -1;
        for (let i = 0; i < maxLen; i++) {
          if (eLines[i] !== aLines[i]) {
            firstDiff = i + 1;
            break;
          }
        }
        drifts.push(
          `${relPath}: content drift (first diverging line ${
            firstDiff === -1 ? "?" : firstDiff
          })`,
        );
      }
    }

    expect(
      drifts,
      drifts.length > 0
        ? "\nFramework file drifts detected:\n" +
            drifts.map((d) => "  " + d).join("\n") +
            "\n\nFix by mirroring edits between .arc/ and packages/arc-framework/arc/\n" +
            "(see strategy-package-project-sync.md for direction rules).\n"
        : undefined,
    ).toEqual([]);
  });
});
