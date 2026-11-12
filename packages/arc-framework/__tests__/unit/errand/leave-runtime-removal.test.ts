/** Removal authorization precedes persisted Errand preservation. */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SlugSchema } from "../../../src/lib/kernel/index.js";
import { leaveOrdinaryErrandAtRuntime } from "../../../src/lib/errand/leave-runtime.js";
import { projectLocusIdentity, serializeTransientIdentityRecord } from "../../../src/lib/errand/identity-record.js";
import type { OrdinaryErrandRecord } from "../../../src/lib/errand/identity-transitions.js";
import type { DerivedCheckoutRow } from "../../../src/lib/locus/derived-roster.js";
import { passingProjectionRemovalSlots } from "../../../src/lib/git/worktree-removal.js";
import { scriptGitExec, scriptGitExecInput } from "../../helpers/git-exec-fake.js";
import { worktreePorcelainZ } from "../../helpers/worktree-porcelain.js";

const head = "b".repeat(40);
const tip = "d".repeat(40);
const blob = "e".repeat(40);
const record: OrdinaryErrandRecord = {
  version: 3, kind: "errand", slug: SlugSchema.parse("repair"), claimId: "a".repeat(32), purpose: "errand",
  origin: "description", originEntry: null, intent: "Repair output", branch: "chore/repair",
  state: "open", savedHead: null, changeRequest: null,
  createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z",
};
const bytes = serializeTransientIdentityRecord(record);
let checkout: string;
beforeEach(async () => { checkout = await mkdtemp(join(tmpdir(), "arc-leave-")); });
afterEach(async () => { await rm(checkout, { recursive: true, force: true }); });

async function leave(status: "dirty" | "unobservable" | "clean") {
  const identity = projectLocusIdentity(record);
  const row: DerivedCheckoutRow = {
    kind: "transient", checkout: { path: checkout, head, branch: record.branch, detached: false, primary: false, folderPresent: true },
    markerGeneration: `sha256:${"c".repeat(64)}`, parentCheckoutPath: null, origin: null, identity,
    context: null, lifecycleLocation: null, diagnostics: [], subject: { kind: "errand", key: record.slug, claimId: record.claimId },
  };
  const ok = { stdout: "", stderr: "" };
  const git = scriptGitExec([
    { match: { prefix: ["fetch", "origin"] }, responses: [ok] },
    { match: { prefix: ["show-ref", "--exists"] }, responses: [ok] },
    { match: { prefix: ["rev-parse", "--verify"] }, responses: [{ ...ok, stdout: tip }] },
    { match: ["ls-tree", "--full-tree", "-z", "-l", tip], responses: [{ ...ok, stdout: `100644 blob ${blob} ${Buffer.byteLength(bytes)}\t${record.slug}\0` }] },
    { match: ["cat-file", "blob", blob], responses: [{ ...ok, stdout: bytes }] },
    { match: { prefix: ["update-ref", "-d"] }, responses: [ok] },
    { match: ["worktree", "list", "--porcelain", "-z"], responses: [{ ...ok, stdout: worktreePorcelainZ(`worktree ${checkout}\nHEAD ${head}\nbranch refs/heads/${record.branch}\n`) }] },
    { match: ["status", "--porcelain"], responses: [status === "unobservable" ? { failure: { exitCode: 1, stderr: "status failed" } }
      : { ...ok, stdout: status === "dirty" ? " M changed\n" : "" }] },
    { match: ["rev-parse", "--abbrev-ref", "HEAD"], responses: [{ ...ok, stdout: record.branch }] },
    { match: ["rev-parse", "HEAD"], responses: [{ ...ok, stdout: head }] },
  ]);
  const writes = scriptGitExecInput([]);
  const result = await leaveOrdinaryErrandAtRuntime({
    slug: record.slug, state: "paused", protection: "full", base: "main", updatedAt: "2026-10-01T01:00:00Z", identity: "andrew",
    exec: git.exec, execInput: writes.exec,
    readFrame: async () => ({ roster: [row], entering: { kind: "selected", row }, active: null,
      primaryAvailability: { kind: "unsafe", checkoutPath: null, reasons: ["occupied"] },
      identityDiscovery: { kind: "complete", identities: [identity], diagnostics: [] } }),
    projectionRemovalSlots: { ...passingProjectionRemovalSlots, check: async () => ({ kind: "would-refuse",
      remedy: { text: "Save the projection before leaving.", argv: ["arc", "save"] } }) },
  });
  return { result, writes: writes.calls };
}

describe("spawned Errand leave removal authorization", () => {
  it.each([
    ["dirty", "refusing to remove a dirty worktree"],
    ["unobservable", "cannot observe worktree removal safety"],
    ["clean", "Save the projection before leaving."],
  ] as const)("refuses %s preservation before a state write", async (status, message) => {
    const { result, writes } = await leave(status);
    expect(result).toMatchObject({ outcome: "refused", reason: "preservation-unproven", recommendedPromptText: expect.stringContaining(message) });
    expect(writes).toEqual([]);
  });
});
