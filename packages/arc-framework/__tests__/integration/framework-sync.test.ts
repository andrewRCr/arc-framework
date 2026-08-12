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
import { classifyFile, resolveFileList } from "../../src/lib/classification.js";
import { resolveTemplateOutputPath } from "../../src/lib/layout/index.js";
import { parseWorkflowFrontmatter } from "../../src/scripts/audit-method-triggers.js";
import type { Manifest, Recipe } from "../../src/lib/types.js";

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
    tokens = buildTokenMap({ project_name: cfg.project_name });
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
        ? renderConditionals(renderTokens(pkg.content, tokens), conditionals, relPath)
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

  it("keeps review chunking thresholds as intentional Configurable project overrides", async () => {
    const path = "system/arc-config.yml";
    const packageConfig = await readFile(join(PKG_ARC_DIR, path), "utf-8");
    const projectConfig = await readFile(join(ARC_DIR, path), "utf-8");

    expect(manifest.files[path]?.classification).toBe("Configurable");
    expect(packageConfig).toContain("changeset.advisory_threshold_lines: 0");
    expect(packageConfig).toContain("changeset.advisory_threshold_files: 0");
    expect(projectConfig).toContain("changeset.advisory_threshold_lines: 5000");
    expect(projectConfig).toContain("changeset.advisory_threshold_files: 150");
    expect(packageConfig).not.toContain("review.chunking_threshold_lines");
    expect(projectConfig).not.toContain("review.chunking_threshold_lines");
  });

  it("keeps neutral review customization contracts aligned across both copies", async () => {
    const paths = [
      "system/methods/README.md",
      "system/methods/assess-design-proportionality.md",
      "system/methods/design-audit.md",
      "system/methods/self-review.md",
      "system/methods/standard-review.md",
      "system/methods/implementation-audit.md",
      "system/methods/review-chunking.md",
      "system/methods/review-response.md",
      "system/methods/review-triage.md",
      "system/extensions/README.md",
      "system/extensions/pre-pr-open.md",
      "system/workflows/arc/supplemental/run-errand.md",
      "system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md",
    ];

    for (const path of paths) {
      const [packaged, project] = await Promise.all([
        readFile(join(PKG_ARC_DIR, path), "utf8"),
        readFile(join(ARC_DIR, path), "utf8"),
      ]);
      expect(project, `${path} must retain the shipped neutral contract`).toBe(packaged);
    }
  });

  it("keeps frontline activation project-specific without changing its method contract", async () => {
    const path = "system/methods/frontline-review.md";
    const [packaged, project] = await Promise.all([
      readFile(join(PKG_ARC_DIR, path), "utf8"),
      readFile(join(ARC_DIR, path), "utf8"),
    ]);

    expect(packaged).toContain("active: false");
    expect(project).toContain("active: true");
    expect(project.replace("active: true", "active: false")).toBe(packaged);
  });

  it("keeps the frontline chunking attachment reference-only and whole-target", async () => {
    const method = await readFile(join(PKG_ARC_DIR, "system/methods/frontline-review.md"), "utf8");
    expect(method.match(/review-chunking/gu)?.length).toBeGreaterThanOrEqual(2);
    expect(method).toContain("canonical target, partition, and coverage state");
    expect(method).toContain("one aggregate whole-target frontline result");
    expect(method).not.toContain("per-chunk receipt");
  });

  it("keeps standard chunking bounded to one exact-target carrier orchestration", async () => {
    const standard = await readFile(join(PKG_ARC_DIR, "system/methods/standard-review.md"), "utf8");
    const adversarial = await readFile(join(PKG_ARC_DIR, "system/methods/adversarial-review.md"), "utf8");
    const guidance = `${standard}\n${adversarial}`;

    expect(standard.match(/review-chunking/gu)?.length).toBeGreaterThanOrEqual(2);
    expect(standard).toContain("target identity, partition, and coverage state");
    expect(standard).toContain("one aggregate whole-target standard-review result");
    expect(adversarial).toContain("bounded chunk-series carrier mode");
    expect(guidance).not.toMatch(/per-chunk receipt|durable scope identity|review-gate runtime state/iu);
  });

  it("declares design proportionality at every direct planning consumer", async () => {
    const workflowPaths = [
      "system/workflows/arc/draft-design.md",
      "system/workflows/arc/create-spec.md",
      "system/workflows/arc/generate-tasks.template.md",
    ];

    for (const path of workflowPaths) {
      const content = await readFile(join(PKG_ARC_DIR, path), "utf8");
      const declarations = parseWorkflowFrontmatter(content);
      expect(declarations.parseError, `${path} frontmatter`).toBeUndefined();
      expect(declarations.methods, `${path} direct methods`).toContain("assess-design-proportionality");
    }
  });

  it("keeps the self-hosting manifest aligned with recipe-derived membership and classification", async () => {
    const recipeText = await readFile(join(REPO_ROOT_DIR, "packages/arc-framework/init-recipe.json"), "utf8");
    const recipe = JSON.parse(recipeText) as Recipe;
    const expected = resolveFileList(recipe, conditionals);
    const expectedOutputs = expected.map((path) => resolveTemplateOutputPath(path)).sort();
    expect(Object.keys(manifest.files).sort()).toEqual(expectedOutputs);

    for (const templatePath of expected) {
      const outputPath = resolveTemplateOutputPath(templatePath);
      expect(manifest.files[outputPath]?.classification, outputPath).toBe(classifyFile(templatePath));
    }
  });
});
