/**
 * What one checkout's records look like from a sibling that shares its git common dir.
 *
 * Two registered worktrees of one repository meet each other in the roster the locus reader builds, so a record
 * only one of them can parse is a fact about both. These drive the production probe from the primary and read
 * what the sibling's state costs it — and, for the write direction, whether a ceremony run in one reaches the
 * other.
 */

import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { runDerivedLocusStateProbe } from "../../src/handlers/derived-locus-state-probe.js";
import { handleWuReconcile } from "../../src/handlers/reconcile.js";
import { renderMetaFile } from "../../src/lib/active/meta-reader.js";
import type { CanonicalDigest } from "../../src/lib/kernel/index.js";
import { resolveProcessInteractionContext } from "../../src/lib/command-input/interaction-context.js";
import {
  createCandidateAttestation,
  createCandidateSubjectSnapshot,
  serializeCandidateManagedRecord,
} from "../../src/lib/work-unit/candidate-attestation.js";
import { resolveCandidateRecordRelativePath } from "../../src/lib/work-unit/candidate-record-store.js";
import { runHandlerAt } from "../helpers/handler.js";
import { makeGitExec } from "../helpers/integration.js";
import { setupWorktreeSiblings, type WorktreeSiblings } from "../helpers/multi-clone.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";

const execFileAsync = promisify(execFile);

const IDENTITY = "test-user";
const WORK_UNIT = "example";
const BRANCH = `feat/${WORK_UNIT}`;

const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()?.();
});

async function git(cwd: string, args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-c", "core.hooksPath=/dev/null", ...args], { cwd });
  return stdout;
}

/** One valid managed Candidate record, built through its producer rather than hand-shaped. */
function candidateRecord(attestedBy = IDENTITY): { candidateId: CanonicalDigest; text: string } {
  const subject = createCandidateSubjectSnapshot([
    { path: "src/example.ts", digest: `sha256:${"a".repeat(64)}`, mode: "100644", treatment: "reviewable" },
  ]);
  const attestation = createCandidateAttestation({
    workUnit: WORK_UNIT,
    subject,
    baseRevision: "0".repeat(40),
    attestedBy,
    attestedAt: "2026-09-01T00:00:00.000Z",
    verificationEvidenceRef: "verification://isolation",
  });
  return {
    candidateId: attestation.candidateId,
    text: serializeCandidateManagedRecord({
      schemaVersion: 1,
      semanticsVersion: "candidate-attestation/v1",
      attestation,
      subject,
      transitions: [],
      lineageAttestations: [],
    }),
  };
}

/**
 * Rewrite one subject entry's treatment to a value outside this build's schema.
 *
 * The record stays canonical in every other respect, so the only thing a reader can refuse it for is the
 * enum — which is the shape a checkout built from a different revision actually produces.
 */
function withUnrecognizedTreatment(record: { candidateId: CanonicalDigest; text: string }): {
  candidateId: CanonicalDigest;
  text: string;
} {
  const parsed = JSON.parse(record.text) as { subject: { entries: { treatment: string }[] } };
  const entry = parsed.subject.entries[0];
  if (entry === undefined) throw new Error("the Candidate subject carries no entry to rewrite");
  entry.treatment = "future-treatment";
  return { candidateId: record.candidateId, text: JSON.stringify(parsed) };
}

/**
 * A sibling worktree standing at a Candidate-bearing boundary, with the primary left free.
 *
 * `Integrating` plus a set Candidate id is what demands Candidate authority; without both, the record is never
 * read and the probe reports a resolved sibling whatever the record says.
 */
async function siblingCarrying(input: {
  readonly record: { candidateId: CanonicalDigest; text: string };
  readonly owner?: string;
}): Promise<WorktreeSiblings> {
  const harness = await setupWorktreeSiblings({ siblingBranch: BRANCH });
  cleanups.push(harness.cleanup);
  const active = join(harness.sibling, ".arc", "active");
  await mkdir(active, { recursive: true });
  await writeFile(join(active, `meta-${WORK_UNIT}.md`), renderMetaFile(WORK_UNIT, {
    state: "Integrating",
    owner: input.owner ?? IDENTITY,
    branch: BRANCH,
    workClass: "Light",
    candidateId: input.record.candidateId,
  }));
  const markerDir = join(harness.sibling, ".arc", "system", ".internal");
  await mkdir(markerDir, { recursive: true });
  await writeFile(join(markerDir, "worktree-marker.json"), `${JSON.stringify({
    spawnedByArc: true,
    wuName: WORK_UNIT,
    createdFor: { kind: "work-unit", name: WORK_UNIT },
    spawningIdentity: IDENTITY,
    createdAt: "2026-07-14T00:00:00.000Z",
  })}\n`);
  const candidatePath = join(harness.sibling, resolveCandidateRecordRelativePath(WORK_UNIT));
  await mkdir(dirname(candidatePath), { recursive: true });
  await writeFile(candidatePath, input.record.text);
  return harness;
}

async function rosterFrom(harness: WorktreeSiblings) {
  return await runDerivedLocusStateProbe({
    cwd: harness.primary,
    identity: IDENTITY,
    baseBranch: "main",
    exec: makeGitExec(harness.primary),
  });
}

describe("a sibling checkout whose record this build cannot parse", () => {
  it("names the sibling unresolved while this checkout's own frame still resolves", async () => {
    const harness = await siblingCarrying({ record: withUnrecognizedTreatment(candidateRecord()) });

    const frame = await rosterFrom(harness);

    const sibling = frame.roster.find((row) => !row.checkout.primary);
    expect(sibling, JSON.stringify(frame)).toMatchObject({
      kind: "unresolved-checkout",
      subject: { kind: "work-unit", key: WORK_UNIT },
      diagnostics: [{ code: "candidate-record-schema-skew" }],
    });
    expect(sibling?.diagnostics[0]?.message).toContain("could not be read by this inspecting build's schema");
    // The refusal stays with the checkout that owns the record: this one still selects its own row and reports
    // the primary free, so a sibling nobody can read is a diagnostic here rather than a stop.
    expect(frame.entering).toMatchObject({ kind: "selected", row: { kind: "free-primary" } });
    expect(frame.primaryAvailability).toMatchObject({ kind: "free" });
  });
});

describe("a foreign owner's record in the shared namespace", () => {
  it("refuses the sibling on ownership without projecting its subject at all", async () => {
    const harness = await siblingCarrying({ record: candidateRecord("other-user"), owner: "other-user" });

    const frame = await rosterFrom(harness);

    // Ownership is settled before the record is opened, so a foreign work unit never reaches the Candidate
    // guard and never surfaces a subject — a narrower reading than the unreadable-record row's.
    const sibling = frame.roster.find((row) => !row.checkout.primary);
    expect(sibling, JSON.stringify(frame)).toMatchObject({
      kind: "unresolved-checkout",
      subject: null,
      diagnostics: [{ code: "authority-evidence-unreadable", source: "lifecycle" }],
    });
    expect(frame.entering).toMatchObject({ kind: "selected", row: { kind: "free-primary" } });
  });
});

describe("a sibling under this checkout's own reconcile ceremony", () => {
  it("leaves the sibling byte-identical after the ceremony applies", async () => {
    const harness = await setupWorktreeSiblings({ siblingBranch: BRANCH });
    cleanups.push(harness.cleanup);
    const transitions = join(harness.primary, ".arc", "system", ".internal", "transitions");
    const planned = join(harness.primary, ".arc", "backlog", "planned");
    await mkdir(join(harness.primary, ".arc", "active"), { recursive: true });
    await mkdir(planned, { recursive: true });
    await mkdir(transitions, { recursive: true });
    await writeFile(join(harness.primary, ".arc", "active", "meta-dependent.md"),
      makeMetaFixture("dependent", {
        owner: IDENTITY, branch: "main", dependsOn: ["origin"],
      }));
    await writeFile(join(planned, "meta-successor.md"), makeMetaFixture("successor", {
      state: "Planning", owner: IDENTITY, branch: null,
    }));
    await writeFile(join(transitions, "origin.json"), `${JSON.stringify({
      schemaVersion: 1,
      origin: "origin",
      kind: "rename",
      successors: ["successor"],
      edges: [],
    })}\n`);
    await git(harness.primary, ["add", "--all"]);
    await git(harness.primary, ["commit", "-m", "fixture"]);
    await git(harness.sibling, ["merge", "--ff-only", "main"]);
    const siblingMeta = join(harness.sibling, ".arc", "active", "meta-dependent.md");
    const before = await readFile(siblingMeta, "utf8");
    const primaryMeta = join(harness.primary, ".arc", "active", "meta-dependent.md");
    const primaryBefore = await readFile(primaryMeta, "utf8");

    const result = await runHandlerAt(harness.primary, async () => {
      await handleWuReconcile("dependent", { apply: true, json: true }, resolveProcessInteractionContext({
        noInput: false,
        machineReadable: true,
        yes: "absent",
      }));
    });

    expect(JSON.parse(result.stdout), result.stdout + result.stderr).toMatchObject({ status: "applied" });
    // The ceremony has to have written for the sibling's stillness to carry any weight: an apply that
    // reported success while staging nothing would leave both checkouts untouched and read here as isolation.
    expect(await readFile(primaryMeta, "utf8")).not.toBe(primaryBefore);
    expect(await readFile(siblingMeta, "utf8")).toBe(before);
    expect(await git(harness.sibling, ["status", "--porcelain"])).toBe("");
  });
});
