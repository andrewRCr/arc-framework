import { describe, test, expect } from "vitest";
import { resolveMissingBaselines, missingBaselineError } from "../../../src/lib/manifest/baseline.js";
import { hashContent } from "../../../src/lib/manifest/hash.js";
import type { FileChangePlan, PlannedMerge } from "../../../src/lib/manifest/plan.js";
import type { RenderContext } from "../../../src/lib/manifest/apply.js";
import type { Manifest, FileEntry } from "../../../src/lib/types.js";
import { UserFacingError } from "../../../src/lib/errors.js";

// --- Helpers ---

const ARC = "/project/.arc";
const PATH = "system/arc-config.yml";

function makeManifest(files: Record<string, FileEntry>): Manifest {
  return {
    schema_version: 1,
    framework_version: "1.0.0",
    installed_at: "2026-01-01T00:00:00Z",
    install_config: { project_name: "test", pm_mode: "none", tools: [] },
    files,
  };
}

function installed(content: string): Manifest {
  return makeManifest({ [PATH]: { classification: "Configurable", layer: "core", pristine_hash: hashContent(content) } });
}

/** Read from a fixed file map, throwing ENOENT for anything else. */
function reader(files: Record<string, string>): (path: string) => Promise<string> {
  return async (path: string) => {
    const value = files[path];
    if (value !== undefined) return value;
    const err = new Error(`ENOENT: ${path}`) as NodeJS.ErrnoException;
    err.code = "ENOENT";
    throw err;
  };
}

/** A project file at its current content and its template at the update. */
function onDisk(current: string, update: string, path = PATH): Record<string, string> {
  return { [`${ARC}/${path}`]: current, [`/templates/${path}`]: update };
}

function merge(outputPath: string, overrides: Partial<PlannedMerge> = {}): PlannedMerge {
  return {
    outputPath,
    templateFile: outputPath,
    classification: "Configurable",
    layer: "core",
    pristineContent: undefined,
    ...overrides,
  };
}

function planWith(merges: PlannedMerge[]): FileChangePlan {
  return { additions: [], removals: [], merges, skipped: [], reclassified: [], outputToTemplate: {} };
}

const renderCtx: RenderContext = { templateDir: "/templates", tokens: {}, config: {}, configKeyOverrides: {} };

// --- Tests ---

describe("resolveMissingBaselines", () => {
  test("recovers an unedited file's own content as its baseline", async () => {
    const resolution = await resolveMissingBaselines(
      planWith([merge(PATH)]), installed("v1\n"), ARC, { readFile: reader(onDisk("v1\n", "v2\n")) }, renderCtx,
    );

    expect(resolution).toEqual({ recovered: { [PATH]: "v1\n" }, edits: [] });
  });

  test("recovers the update as the baseline when upstream is unchanged since install", async () => {
    const resolution = await resolveMissingBaselines(
      planWith([merge(PATH)]), installed("v1\n"), ARC,
      { readFile: reader(onDisk("v1\nlocal edit\n", "v1\n")) }, renderCtx,
    );

    expect(resolution).toEqual({ recovered: { [PATH]: "v1\n" }, edits: [] });
  });

  test("names a customized file whose upstream changed since install", async () => {
    const resolution = await resolveMissingBaselines(
      planWith([merge(PATH)]), installed("v1\n"), ARC,
      { readFile: reader(onDisk("v1\nlocal edit\n", "v2\n")) }, renderCtx,
    );

    expect(resolution).toEqual({ recovered: {}, edits: [PATH] });
  });

  test("names a customized file whose install the manifest records no hash for", async () => {
    const resolution = await resolveMissingBaselines(
      planWith([merge(PATH)]), makeManifest({}), ARC, { readFile: reader(onDisk("local edit\n", "v2\n")) }, renderCtx,
    );

    expect(resolution).toEqual({ recovered: {}, edits: [PATH] });
  });

  test("passes a stored baseline, a file already matching the update, a missing file, and a Framework file", async () => {
    const resolution = await resolveMissingBaselines(
      planWith([
        merge("based.md", { pristineContent: "v1\n" }),
        merge("matching.md"),
        merge("absent.md"),
        merge("framework.md", { classification: "Framework" }),
      ]),
      installed("v1\n"), ARC,
      {
        readFile: reader({
          ...onDisk("local edit\n", "v2\n", "based.md"),
          ...onDisk("v2\n", "v2\n", "matching.md"),
          "/templates/absent.md": "v2\n",
          ...onDisk("local edit\n", "v2\n", "framework.md"),
        }),
      },
      renderCtx,
    );

    expect(resolution).toEqual({ recovered: {}, edits: [] });
  });

  test("compares the file as the merge will read it, and hashes its bytes as installed", async () => {
    const raw = "v1 with a legacy key\n";
    const files = onDisk(raw, "v2\n");
    const readAsMerged = async (path: string) => (path === `${ARC}/${PATH}` ? "v2\n" : reader(files)(path));

    const matchingUpdate = await resolveMissingBaselines(
      planWith([merge(PATH)]), makeManifest({}), ARC, { readFile: reader(files), readAsMerged }, renderCtx,
    );
    const unedited = await resolveMissingBaselines(
      planWith([merge(PATH)]), installed(raw), ARC, { readFile: reader(files), readAsMerged }, renderCtx,
    );

    expect(matchingUpdate).toEqual({ recovered: {}, edits: [] });
    expect(unedited).toEqual({ recovered: { [PATH]: raw }, edits: [] });
  });
});

describe("missingBaselineError", () => {
  test("names each file and both remedies", () => {
    const err = missingBaselineError(["system/arc-config.yml", "reference/QUICK-REFERENCE.md"], "update");

    expect(err).toBeInstanceOf(UserFacingError);
    expect(err.code).toBe("manifest.baseline-missing");
    expect(err.why).toContain(".arc/system/arc-config.yml");
    expect(err.why).toContain(".arc/reference/QUICK-REFERENCE.md");
    expect(err.whatToDo).toContain(".arc/system/.internal/pristine.json");
    expect(err.whatToDo).toContain("arc update --keep-local-without-baseline");
  });
});
