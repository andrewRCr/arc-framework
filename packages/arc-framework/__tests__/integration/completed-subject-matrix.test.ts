/** One completed subject must yield the same authority at reader, entry and recovery boundaries. */
import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import type { Store } from "../../src/lib/store/contract.js";
const binding = vi.hoisted(() => ({ store: null as Store | null }));
vi.mock("../../src/lib/store/create.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/lib/store/create.js")>();
  return { ...original, createStore: (...args: Parameters<typeof original.createStore>) => binding.store ?? original.createStore(...args) };
});
import { completedSubjectFixture, type CompletedSubjectScenario } from "../helpers/completed-subject.js";
import { dispatchRegisteredCli } from "../helpers/registered-cli.js";
import { runDerivedLocusStateProbe } from "../../src/handlers/derived-locus-state-probe.js";
import { lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { recordPut, batchLifecycleWrites } from "../../src/lib/store/lifecycle-write.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { LineageRecordSchema, writeLineageRecord } from "../../src/lib/store/kinds/lineage/index.js";
import { readWorktreeMarkerGeneration, removeWorktreeMarkerGeneration } from "../../src/lib/git/worktree-marker.js";
import { RecoverAuditReportSchema } from "../../src/lib/recover/report.js";
import { SessionInitProbeResultSchema, SessionRecoverProbeResultSchema } from "../../src/commands/status/schema.js";

async function invoke(h: Awaited<ReturnType<typeof completedSubjectFixture>>, argv: readonly string[]) {
  const previousCwd = process.cwd(), previousExit = process.exitCode;
  let stdout = "", stderr = "";
  const out = vi.spyOn(process.stdout, "write").mockImplementation(chunk => { stdout += String(chunk); return true; });
  const err = vi.spyOn(process.stderr, "write").mockImplementation(chunk => { stderr += String(chunk); return true; });
  try {
    binding.store = h.store;
    process.chdir(h.cwd);
    process.exitCode = undefined;
    await dispatchRegisteredCli(["--no-input", ...argv]);
    return { exitCode: process.exitCode, stdout, stderr };
  } finally {
    out.mockRestore(); err.mockRestore(); binding.store = null;
    process.chdir(previousCwd); process.exitCode = previousExit;
  }
}

async function applyScenario(h: Awaited<ReturnType<typeof completedSubjectFixture>>, scenario: CompletedSubjectScenario) {
  if (scenario === "arc-landing" || scenario === "merge-commit" || scenario === "multi-commit-squash") {
    await h.exec("git", ["checkout", "main"]);
    if (scenario === "multi-commit-squash") {
      await h.exec("git", ["merge", "--squash", "feat/completed-unit"]);
      await h.exec("git", ["commit", "-m", "Outside squash"]);
    } else await h.exec("git", ["merge", "--no-ff", "feat/completed-unit", "-m", "Merge completed work"]);
    const landing = (await h.exec("git", ["rev-parse", "HEAD"])).stdout.trim();
    await h.exec("git", ["checkout", "feat/completed-unit"]);
    if (scenario === "arc-landing") lifecycleSuccess(await h.store.write({ ...recordPut(h.record, { links: { ...h.record.links, landingCommit: { repository: h.repository, sha: landing } } }), provenance: { verb: "merge", lifecycleAction: "land" } }));
  }
  if (scenario === "cut" || scenario === "abandon") {
    const lineage = LineageRecordSchema.parse({ schemaVersion: 2, origin: { name: h.record.reference.owner.name,
      ...("uid" in h.record.reference.owner ? { uid: h.record.reference.owner.uid } : {}) },
      kind: scenario === "cut" ? "decompose" : "abandon", successors: scenario === "cut" ? [{ name: "successor" }] : [], incoming: [],
      retiredBranches: h.record.links?.branches ?? [],
      ...(scenario === "cut" ? { outgoing: [] } : {}) });
    if (scenario === "cut") await h.seedMeta("successor");
    lifecycleSuccess(await batchLifecycleWrites(h.store, [
      { action: "remove", reference: h.record.reference, expected: h.record.version },
      { action: "put", reference: recordReferences["lineage/transition"](h.record.reference.owner), expected: null, content: writeLineageRecord(lineage) },
    ], { verb: scenario === "cut" ? "decompose" : "abandon", lifecycleAction: scenario === "cut" ? "decompose" : "abandon" }));
  }
  if (scenario === "partial-teardown") {
    const marker = await readWorktreeMarkerGeneration(h.cwd);
    if (marker.kind !== "present") throw new Error("Fixture marker must be present before partial teardown");
    expect(await removeWorktreeMarkerGeneration(h.cwd, marker.bytes)).toEqual({ kind: "removed" });
  }
  if (scenario === "missing") lifecycleSuccess(await h.store.write({ action: "remove", reference: h.record.reference,
    expected: h.record.version, provenance: { verb: "fixture", lifecycleAction: "remove-missing-subject" } }));
  if (scenario === "ambiguous") await h.seed(recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: "completed-unit", uid: randomUUID() })),
    h.record.content, { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") }, h.record.links);
}

const scenarios: readonly CompletedSubjectScenario[] = ["archive-restart", "arc-landing", "merge-commit", "multi-commit-squash", "cut", "abandon", "partial-teardown", "missing", "ambiguous"];
it.each((["manual", "with-integration"] as const).flatMap(cadence => scenarios.map(scenario => ({ cadence, scenario }))))(
  "$cadence/$scenario agrees across actual reader, entry and recovery", async ({ cadence, scenario }) => {
    const h = await completedSubjectFixture(cadence, scenario === "cut" || scenario === "abandon");
    const unresolved = scenario === "missing" || scenario === "ambiguous" || scenario === "partial-teardown";
    if (unresolved) {
      const seeded = await invoke(h, ["status", "--session-init", "--write-compaction-seed", "--json"]);
      expect(SessionInitProbeResultSchema.parse(JSON.parse(seeded.stdout)).compactionSeedWrite).toMatchObject({ status: "written" });
    }
    await applyScenario(h, scenario);
    const version = lifecycleSuccess(await h.store.version());
    const reader = await runDerivedLocusStateProbe({ cwd: h.cwd, store: h.store, identity: "test-user", baseBranch: "main", exec: h.exec });
    const integration = cadence === "with-integration" && (scenario === "archive-restart" || scenario === "multi-commit-squash");
    const kind = unresolved ? "unresolved-checkout" : integration ? "work-unit" : "retired";
    expect(reader.entering).toMatchObject({ kind: "selected", row: { kind } });
    if (integration) expect(reader.active?.context.sessionType).toBe("integration");
    if (unresolved) {
      expect(reader.active).toBeNull();
    }
    const entry = await invoke(h, ["status", "--session-init", ...(!unresolved ? ["--write-compaction-seed"] : []), "--json"]);
    expect(entry, entry.stderr).toMatchObject({ exitCode: undefined });
    const session = SessionInitProbeResultSchema.parse(JSON.parse(entry.stdout));
    expect(session.derivedLocusState).toMatchObject({ ok: true, value: { entering: reader.entering } });
    if (unresolved) expect(session.locusGuidance).toMatchObject({ kind: "unavailable", message: expect.stringContaining("unresolved") });
    else {
      expect(session.compactionSeedWrite).toMatchObject({ status: "written" });
      expect(session.locusGuidance).toMatchObject({ kind: "ready", cleanup: integration ? [] : [expect.stringContaining("Cleanup is available")] });
    }
    const recovery = await invoke(h, ["status", "--recover", "--json"]);
    expect(recovery, recovery.stderr).toMatchObject({ exitCode: undefined });
    const recovered = SessionRecoverProbeResultSchema.parse(JSON.parse(recovery.stdout));
    expect(recovered.derivedLocusState).toMatchObject({ ok: true, value: { entering: reader.entering } });
    expect(recovered.recoveryFrame).toMatchObject(unresolved ? { ok: false } : { ok: true, value: { kind: integration ? "resolved" : "none" } });
    const audit = await invoke(h, ["recover", "audit", "--json"]);
    const audited = RecoverAuditReportSchema.parse(JSON.parse(audit.stdout));
    expect(audited.recover?.derivedLocusState).toMatchObject({ ok: true, value: { entering: reader.entering } });
    if (unresolved) expect(audited.verdict).toMatchObject({ status: "stop", stopReasons: expect.arrayContaining([expect.objectContaining({ kind: "locus-unresolved" })]) });
    else expect(audited.verdict.stopReasons.filter(reason => reason.kind === "locus-unresolved")).toEqual([]);
    expect(lifecycleSuccess(await h.store.version())).toBe(version);
    expect((await h.exec("git", ["rev-parse", "HEAD"])).stdout.trim()).toBe(h.head);
    if (unresolved || integration) expect(cleanupCommands({ reader, session, recovered, audit: audited })).toEqual([]);
    if (scenario === "missing" || scenario === "ambiguous") {
      const code = scenario === "missing" ? "work-unit-record-missing" : "subject-unresolved";
      expect(reader.entering).toMatchObject({ row: { diagnostics: expect.arrayContaining([expect.objectContaining({ code })]) } });
    }
  }, 30000);

function cleanupCommands(value: unknown): string[][] {
  if (Array.isArray(value)) return value.flatMap(cleanupCommands);
  if (typeof value !== "object" || value === null) return [];
  const record = value as Record<string, unknown>;
  const argv = record.argv;
  const own = Array.isArray(argv) && argv.every((item): item is string => typeof item === "string")
    && /^(?:arc teardown|arc locus release|git worktree remove|git branch -[dD])(?: |$)/u.test(argv.join(" ")) ? [argv] : [];
  return [...own, ...Object.values(record).flatMap(cleanupCommands)];
}
