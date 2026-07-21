import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { canonicalJson } from "../../src/lib/coupling-audit/canonical.js";
import {
  HISTORICAL_LAYOUT_RESULT_DIGEST,
  LAYOUT_MIGRATION_CLASS_IDS,
  LayoutMigrationClassIdSchema,
  digestLayoutClassInventory,
  digestLayoutHitSet,
  type LayoutMigrationLedgerV1,
} from "../../src/lib/coupling-audit/layout-migration-ledger.js";
import { scanClassInventory } from "../../src/lib/coupling-audit/scan.js";
import type { CouplingManifest } from "../../src/lib/coupling-audit/types.js";
import {
  LAYOUT_MIGRATION_LEDGER_PATH,
  LAYOUT_MIGRATION_MANIFEST_PATH,
  createLayoutMigrationScriptContext,
  executeLayoutMigrationAssertion,
} from "../../src/scripts/assert-layout-migration.js";

const execFileAsync = promisify(execFile);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function manifest(): CouplingManifest {
  const idioms = ["path-literal", "directory-state", "git-tracked-path", "filename-prefix", "branch-pattern", "config-key", "doc-name"] as const;
  return {
    version: 1,
    corpus: {
      packageRoot: "packages/arc-framework/src",
      installedDelta: [],
      repoRootDelta: [],
      excluded: [{ path: LAYOUT_MIGRATION_LEDGER_PATH, reason: "Derived migration bookkeeping." }],
    },
    classes: LAYOUT_MIGRATION_CLASS_IDS.map((classId) => ({
      id: classId,
      key: { kind: "name", value: `token-${classId}` },
      patterns: [{ id: `${classId}-pattern`, form: "literal", value: `token-${classId}` }],
      citations: [{ path: "direction.md", anchor: classId, workUnit: "layout-owner" }],
      idioms: ["path-literal"],
      volatility: { rating: "stable", evidence: { workUnit: "layout-owner", source: "fixture" } },
    })),
    catchAllVectors: idioms.map((idiom) => ({
      id: `${idiom}-vector`,
      idiom,
      patterns: [{ id: `${idiom}-pattern`, form: "literal", value: `unmatched-${idiom}` }],
      surfaceKinds: ["test", "workflow", "template", "code", "prose", "config"],
    })),
    dispositions: { exact: [], bulk: [] },
    thresholds: { test: 2, workflow: 2, template: 2, code: 2, prose: 2, config: 2 },
    sampleCaps: { codePerClass: 1, residueTotal: 1 },
  };
}

describe("layout migration index boundary", () => {
  it("certifies staged blobs when the working tree differs", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-layout-migration-"));
    roots.push(root);
    const sourcePath = "packages/arc-framework/src/source.ts";
    const source = LAYOUT_MIGRATION_CLASS_IDS.map((classId) => `token-${classId}`).join("\n");
    const auditManifest = manifest();
    const inventory = scanClassInventory(auditManifest, [{
      path: sourcePath,
      content: source,
      surfaceKind: "code",
      locus: "package",
    }]);
    const keys = inventory.classes.flatMap(({ classId, hits }) =>
      hits.map((hit) => [LayoutMigrationClassIdSchema.parse(classId), hit.evidenceDigest] as const));
    const ledger: LayoutMigrationLedgerV1 = {
      version: 1,
      source: {
        historicalResultDigest: HISTORICAL_LAYOUT_RESULT_DIGEST,
        manifestDigest: inventory.manifestDigest,
        corpusFilesDigest: inventory.corpus.filesDigest,
        classInventoryDigest: digestLayoutClassInventory(inventory),
        selectedClassIds: [...LAYOUT_MIGRATION_CLASS_IDS],
        selectedHitCount: keys.length,
        selectedHitSetDigest: digestLayoutHitSet(keys),
      },
      exact: keys.map(([classId, evidenceDigest]) => ({
        classId,
        evidenceDigest,
        disposition: "layout-definition",
        owner: "layout",
        reason: "Fixture owner.",
      })),
      bulk: [],
    };
    for (const path of [sourcePath, LAYOUT_MIGRATION_MANIFEST_PATH, LAYOUT_MIGRATION_LEDGER_PATH]) {
      await mkdir(dirname(join(root, path)), { recursive: true });
    }
    await writeFile(join(root, sourcePath), source);
    await writeFile(join(root, LAYOUT_MIGRATION_MANIFEST_PATH), canonicalJson(auditManifest));
    await writeFile(join(root, LAYOUT_MIGRATION_LEDGER_PATH), canonicalJson(ledger));
    await execFileAsync("git", ["init", "--initial-branch=main", root]);
    await execFileAsync("git", ["add", "-A"], { cwd: root });
    await writeFile(join(root, sourcePath), "working-tree drift that must not be scanned\n");

    const production = createLayoutMigrationScriptContext(root);
    const result = await executeLayoutMigrationAssertion({
      ...production,
      writeStdout: () => undefined,
      writeStderr: () => undefined,
    });

    expect(result.selectedHitCount).toBe(LAYOUT_MIGRATION_CLASS_IDS.length);
  });
});
