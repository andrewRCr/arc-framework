import { describe, expect, it } from "vitest";

import { canonicalJson } from "../../../src/lib/coupling-audit/canonical.js";
import {
  HISTORICAL_LAYOUT_RESULT_DIGEST,
  LAYOUT_MIGRATION_CLASS_IDS,
  LayoutMigrationClassIdSchema,
  digestLayoutClassInventory,
  digestLayoutHitSet,
  type LayoutMigrationLedgerV1,
} from "../../../src/lib/coupling-audit/layout-migration-ledger.js";
import { scanClassInventory } from "../../../src/lib/coupling-audit/scan.js";
import type { CouplingManifest } from "../../../src/lib/coupling-audit/types.js";
import type { GitExec } from "../../../src/lib/git/exec.js";
import {
  LAYOUT_MIGRATION_LEDGER_PATH,
  LAYOUT_MIGRATION_MANIFEST_PATH,
  executeLayoutMigrationAssertion,
  runLayoutMigrationAssertionCommand,
  type LayoutMigrationScriptContext,
} from "../../../src/scripts/assert-layout-migration.js";

const encoder = new TextEncoder();

function manifest(): CouplingManifest {
  const idioms = [
    "path-literal",
    "directory-state",
    "git-tracked-path",
    "filename-prefix",
    "branch-pattern",
    "config-key",
    "doc-name",
  ] as const;
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
      key: { kind: "name" as const, value: `token-${classId}` },
      patterns: [{ id: `${classId}-pattern`, form: "literal" as const, value: `token-${classId}` }],
      citations: [{ path: "direction.md", anchor: classId, workUnit: "layout-owner" }],
      idioms: ["path-literal" as const],
      volatility: { rating: "stable" as const, evidence: { workUnit: "layout-owner", source: "fixture" } },
    })),
    catchAllVectors: idioms.map((idiom) => ({
      id: `${idiom}-vector`,
      idiom,
      patterns: [{ id: `${idiom}-pattern`, form: "literal" as const, value: `unmatched-${idiom}` }],
      surfaceKinds: ["test", "workflow", "template", "code", "prose", "config"],
    })),
    dispositions: { exact: [], bulk: [] },
    thresholds: { test: 2, workflow: 2, template: 2, code: 2, prose: 2, config: 2 },
    sampleCaps: { codePerClass: 1, residueTotal: 1 },
  };
}

function fixture() {
  const auditManifest = manifest();
  const corpusContent = LAYOUT_MIGRATION_CLASS_IDS.map((classId) => `token-${classId}`).join("\n");
  const inventory = scanClassInventory(auditManifest, [{
    path: "packages/arc-framework/src/source.ts",
    content: corpusContent,
    surfaceKind: "code",
    locus: "package",
  }]);
  const hits = inventory.classes.flatMap(({ classId, hits: classHits }) =>
    classHits.map((hit) => [classId, hit.evidenceDigest] as const));
  const ledger: LayoutMigrationLedgerV1 = {
    version: 1,
    source: {
      historicalResultDigest: HISTORICAL_LAYOUT_RESULT_DIGEST,
      manifestDigest: inventory.manifestDigest,
      corpusFilesDigest: inventory.corpus.filesDigest,
      classInventoryDigest: digestLayoutClassInventory(inventory),
      selectedClassIds: [...LAYOUT_MIGRATION_CLASS_IDS],
      selectedHitCount: hits.length,
      selectedHitSetDigest: digestLayoutHitSet(hits),
    },
    exact: inventory.classes.flatMap(({ classId, hits: classHits }) => classHits.map((hit) => ({
      classId: LayoutMigrationClassIdSchema.parse(classId),
      evidenceDigest: hit.evidenceDigest,
      disposition: "layout-definition" as const,
      owner: "layout",
      reason: "Fixture semantic owner.",
    }))),
    bulk: [],
  };
  return { auditManifest, corpusContent, ledger };
}

function context(overrides: {
  missing?: string;
  untracked?: string[];
  mutateLedger?: (ledger: LayoutMigrationLedgerV1) => void;
  nonCanonicalLedger?: boolean;
} = {}): { context: LayoutMigrationScriptContext; stdout: string[]; stderr: string[] } {
  const { auditManifest, corpusContent, ledger } = fixture();
  overrides.mutateLedger?.(ledger);
  const ledgerText = overrides.nonCanonicalLedger ? `${JSON.stringify(ledger, null, 2)}\n` : canonicalJson(ledger);
  const blobs = new Map<string, Uint8Array>([
    [LAYOUT_MIGRATION_MANIFEST_PATH, encoder.encode(canonicalJson(auditManifest))],
    [LAYOUT_MIGRATION_LEDGER_PATH, encoder.encode(ledgerText)],
    ["packages/arc-framework/src/source.ts", encoder.encode(corpusContent)],
  ]);
  if (overrides.missing !== undefined) blobs.delete(overrides.missing);
  const indexed = [...blobs.keys()];
  const git: GitExec = async (_command, args) => {
    if (args[0] === "ls-files" && args.includes("--cached")) return { stdout: `${indexed.join("\0")}\0` };
    if (args[0] === "ls-files" && args.includes("--others")) {
      return { stdout: `${(overrides.untracked ?? []).join("\0")}${(overrides.untracked ?? []).length > 0 ? "\0" : ""}` };
    }
    throw new Error(`unexpected Git command: ${args.join(" ")}`);
  };
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    context: {
      root: "/repo",
      git,
      readIndexBlob: async (path) => blobs.get(path) ?? null,
      writeStdout: (content) => stdout.push(content),
      writeStderr: (content) => stderr.push(content),
    },
    stdout,
    stderr,
  };
}

describe("layout migration staged-tree assertion", () => {
  it("certifies canonical indexed inputs and renders per-class owners", async () => {
    const fixtureContext = context();

    const result = await executeLayoutMigrationAssertion(fixtureContext.context);

    expect(result.selectedHitCount).toBe(LAYOUT_MIGRATION_CLASS_IDS.length);
    expect(result.classes).toHaveLength(LAYOUT_MIGRATION_CLASS_IDS.length);
    expect(fixtureContext.stdout.join("\n")).toContain("arc-root: 1 hit; layout=1");
  });

  it.each([LAYOUT_MIGRATION_MANIFEST_PATH, LAYOUT_MIGRATION_LEDGER_PATH])(
    "fails closed when indexed input %s is missing",
    async (missing) => {
      const fixtureContext = context({ missing });
      await expect(executeLayoutMigrationAssertion(fixtureContext.context)).rejects.toThrow(/missing indexed/u);
    },
  );

  it("refuses relevant untracked corpus paths", async () => {
    const fixtureContext = context({ untracked: ["packages/arc-framework/src/untracked.ts"] });
    await expect(executeLayoutMigrationAssertion(fixtureContext.context)).rejects.toThrow(
      "packages/arc-framework/src/untracked.ts",
    );
  });

  it("refuses non-canonical ledger bytes", async () => {
    const fixtureContext = context({ nonCanonicalLedger: true });
    await expect(executeLayoutMigrationAssertion(fixtureContext.context)).rejects.toThrow(/canonical/u);
  });

  it("refuses source digest and exactly-once coverage drift", async () => {
    const sourceDrift = context({ mutateLedger: (ledger) => { ledger.source.selectedHitCount += 1; } });
    await expect(executeLayoutMigrationAssertion(sourceDrift.context)).rejects.toThrow(/selectedHitCount/u);

    const coverageDrift = context({ mutateLedger: (ledger) => { ledger.exact.pop(); } });
    await expect(executeLayoutMigrationAssertion(coverageDrift.context)).rejects.toThrow(/unmatched/u);
  });

  it("refuses exact misses and invalid bulk expansions", async () => {
    const exactMiss = context({
      mutateLedger: (ledger) => { ledger.exact[0]!.evidenceDigest = "c".repeat(64); },
    });
    await expect(executeLayoutMigrationAssertion(exactMiss.context)).rejects.toThrow(/does not match/u);

    const emptyBulk = context({ mutateLedger: (ledger) => {
      ledger.exact.shift();
      ledger.bulk.push({
        id: "empty-rule",
        predicate: { field: "path", operator: "equals", values: ["missing.ts"] },
        memberSetDigest: "d".repeat(64),
        disposition: "independent-evidence",
        owner: "tests",
        reason: "Fixture empty cohort.",
      });
    } });
    await expect(executeLayoutMigrationAssertion(emptyBulk.context)).rejects.toThrow(/zero selected hits/u);

    const driftedBulk = context({ mutateLedger: (ledger) => {
      ledger.exact.shift();
      ledger.bulk.push({
        id: "drifted-rule",
        predicate: { field: "classId", operator: "equals", values: ["arc-root"] },
        memberSetDigest: "d".repeat(64),
        disposition: "layout-definition",
        owner: "layout",
        reason: "Fixture drifted cohort.",
      });
    } });
    await expect(executeLayoutMigrationAssertion(driftedBulk.context)).rejects.toThrow(/memberSetDigest/u);

    const overlap = context({ mutateLedger: (ledger) => {
      const evidenceDigest = ledger.exact.find((entry) => entry.classId === "arc-root")!.evidenceDigest;
      ledger.bulk.push({
        id: "overlap-rule",
        predicate: { field: "classId", operator: "equals", values: ["arc-root"] },
        memberSetDigest: digestLayoutHitSet([["arc-root", evidenceDigest]]),
        disposition: "layout-definition",
        owner: "layout",
        reason: "Fixture overlapping cohort.",
      });
    } });
    await expect(executeLayoutMigrationAssertion(overlap.context)).rejects.toThrow(/overlapping/u);
  });

  it("maps validation failures to deterministic command diagnostics", async () => {
    const fixtureContext = context({ nonCanonicalLedger: true });
    await expect(runLayoutMigrationAssertionCommand(fixtureContext.context)).resolves.toBe(2);
    expect(fixtureContext.stderr.join("\n")).toMatch(/^layout-migration: /u);
  });
});
