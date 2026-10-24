import { describe, test, expect } from "vitest";
import {
  recoverUneditedBaselines, findEditsWithoutBaseline, missingBaselineError,
} from "../../../src/lib/manifest/baseline.js";
import { hashContent } from "../../../src/lib/manifest/hash.js";
import type { FileChangePlan, PlannedMerge } from "../../../src/lib/manifest/plan.js";
import type { RenderContext } from "../../../src/lib/manifest/apply.js";
import type { Manifest, FileEntry } from "../../../src/lib/types.js";
import { UserFacingError } from "../../../src/lib/errors.js";

// --- Helpers ---

function makeManifest(files: Record<string, FileEntry>): Manifest {
  return {
    schema_version: 1,
    framework_version: "1.0.0",
    installed_at: "2026-01-01T00:00:00Z",
    install_config: { project_name: "test", pm_mode: "none", tools: [] },
    files,
  };
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

describe("recoverUneditedBaselines", () => {
  test("restores the baseline of a file still identical to its last install", async () => {
    const manifest = makeManifest({
      "system/arc-config.yml": { classification: "Configurable", layer: "core", pristine_hash: hashContent("v1\n") },
    });

    const recovered = await recoverUneditedBaselines(
      manifest, {}, "/project/.arc", reader({ "/project/.arc/system/arc-config.yml": "v1\n" }),
    );

    expect(recovered).toEqual({ "system/arc-config.yml": "v1\n" });
  });

  test("recovers nothing for a file edited since its last install", async () => {
    const manifest = makeManifest({
      "system/arc-config.yml": { classification: "Configurable", layer: "core", pristine_hash: hashContent("v1\n") },
    });

    const recovered = await recoverUneditedBaselines(
      manifest, {}, "/project/.arc", reader({ "/project/.arc/system/arc-config.yml": "v1\nlocal edit\n" }),
    );

    expect(recovered).toEqual({});
  });

  test("leaves a stored baseline, an unhashed entry, and a missing file alone", async () => {
    const manifest = makeManifest({
      "stored.md": { classification: "Configurable", layer: "core", pristine_hash: hashContent("disk\n") },
      "unhashed.md": { classification: "Scaffolded", layer: "core" },
      "absent.md": { classification: "Configurable", layer: "core", pristine_hash: hashContent("gone\n") },
    });

    const recovered = await recoverUneditedBaselines(
      manifest, { "stored.md": "stored baseline\n" }, "/project/.arc",
      reader({ "/project/.arc/stored.md": "disk\n", "/project/.arc/unhashed.md": "anything\n" }),
    );

    expect(recovered).toEqual({});
  });
});

describe("findEditsWithoutBaseline", () => {
  test("names a Configurable file with no baseline whose content differs from the update", async () => {
    const edits = await findEditsWithoutBaseline(
      planWith([merge("system/arc-config.yml")]), "/project/.arc",
      reader({
        "/project/.arc/system/arc-config.yml": "local edit\n",
        "/templates/system/arc-config.yml": "upstream v2\n",
      }),
      renderCtx,
    );

    expect(edits).toEqual(["system/arc-config.yml"]);
  });

  test("passes a file with a baseline, a file that already matches the update, and a missing file", async () => {
    const edits = await findEditsWithoutBaseline(
      planWith([
        merge("based.md", { pristineContent: "v1\n" }),
        merge("matching.md"),
        merge("absent.md"),
      ]),
      "/project/.arc",
      reader({
        "/project/.arc/based.md": "local edit\n",
        "/templates/based.md": "v2\n",
        "/project/.arc/matching.md": "v2\n",
        "/templates/matching.md": "v2\n",
        "/templates/absent.md": "v2\n",
      }),
      renderCtx,
    );

    expect(edits).toEqual([]);
  });

  test("passes a Framework file, which is replaced rather than merged", async () => {
    const edits = await findEditsWithoutBaseline(
      planWith([merge("framework.md", { classification: "Framework" })]), "/project/.arc",
      reader({ "/project/.arc/framework.md": "local edit\n", "/templates/framework.md": "v2\n" }),
      renderCtx,
    );

    expect(edits).toEqual([]);
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
