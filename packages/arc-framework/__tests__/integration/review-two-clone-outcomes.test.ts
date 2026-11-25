/** Independent native producers share target identity and retain portable continuation ownership across clones. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { createReviewRepositoryHarness } from "../helpers/store/review-differential.js";
import { localReviewResult } from "../helpers/in-process-review.js";
import { writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { TransientIdentityRecordSchema } from "../../src/lib/errand/identity-record.js";
import { createReviewOutcomePort } from "../../src/lib/store/kinds/review/outcome/access.js";
import { LocalPrepareEnvelopeSchema, LocalAttestEnvelopeSchema, LocalResumeEnvelopeSchema } from "../../src/scripts/review-gate/core/review-command-envelope.js";
import { handleReviewLocalPrepare, handleReviewLocalAttest, handleReviewLocalResume } from "../../src/handlers/review.js";
import type { ReviewInvocationInput } from "../../src/scripts/review-gate/runtime/invocation.js";

it("produces the same native target on two clones and re-enters the first outcome from a different current claim", async () => {
  const h = await createReviewRepositoryHarness();
  onTestFinished(h.cleanup);
  const projectId = "123e4567-e89b-42d3-a456-426614174099";
  await h.reference.seedProject(projectId);
  const git = (input: ReviewInvocationInput, ...args: string[]) => input.exec("git", args, { cwd: input.cwd });
  await git(h.native, "config", "arc.identity", "andrew");
  await mkdir(join(h.native.cwd, ".arc/system"), { recursive: true });
  await writeFile(join(h.native.cwd, ".arc/system/arc-config.yml"), "branch.base: main\nreview.standard_sources: [delegated-agent]\n");
  await writeFile(join(h.native.cwd, ".gitignore"), ".arc/system/.internal/\n.arc/user/\n");
  await git(h.native, "add", ".");
  await git(h.native, "commit", "-m", "Configure native review");
  await git(h.native, "switch", "-c", "chore/first");
  await writeFile(join(h.native.cwd, "example.ts"), "export const value = true;\n");
  await git(h.native, "add", "example.ts");
  await git(h.native, "commit", "-m", "Implement example");
  await git(h.native, "push", "origin", "main", "chore/first");
  await git(h.secondNative, "fetch", "origin");
  await git(h.secondNative, "merge", "--ff-only", "origin/main");
  await git(h.secondNative, "switch", "-c", "chore/second", "origin/chore/first");
  await git(h.secondNative, "config", "arc.identity", "andrew");
  const invoke = async (input: ReviewInvocationInput,
    handler: typeof handleReviewLocalPrepare | typeof handleReviewLocalAttest | typeof handleReviewLocalResume, request: unknown) => {
    let output = "";
    const exits: number[] = [];
    await handler("-", { resolveRoot: () => input.cwd, readText: async () => JSON.stringify(request),
      write: text => { output += text; }, setExitCode: code => exits.push(code) }, undefined, { store: h.reference.store });
    expect(exits, output).toEqual([]);
    return JSON.parse(output) as unknown;
  };
  const produce = async (input: ReviewInvocationInput, label: "first" | "second", before?: () => Promise<void>) => {
    const claimId = (label === "first" ? "1" : "2").repeat(32), slug = label, branch = `chore/${label}`;
    const record = TransientIdentityRecordSchema.parse({ version: 3, kind: "errand", purpose: "errand", slug, claimId,
      owner: "andrew", intent: "Review the shared code target", origin: "description", originEntry: null, branch,
      state: "open", savedHead: null, changeRequest: null, createdAt: "2026-10-20T18:00:00Z", updatedAt: "2026-10-20T18:00:00Z" });
    if (record.kind !== "errand") throw new Error("Expected Errand");
    const primary = await h.reference.seedErrand(record);
    await writeWorktreeMarker(input.cwd, { spawnedByArc: false, spawningIdentity: "andrew", provisioning: "ready",
      createdAt: record.createdAt, createdFor: { kind: "errand", slug, claimId } });
    await before?.();
    const prepared = LocalPrepareEnvelopeSchema.parse(await invoke(input, handleReviewLocalPrepare, { schemaVersion: 1,
      evaluatorIdentity: `independent-${label}`, routingFacts: { contentKind: "code-bearing", reviewRisk: "sensitive",
        changeDeterminacy: "ordinary", ownership: "self", surfaceAuthority: "ordinary" } }));
    if (prepared.state !== "ready" || prepared.payload.operationRef === undefined) throw new Error(JSON.stringify(prepared));
    expect(prepared.payload.target.repositoryId).toBe(projectId);
    const request = { ...localReviewResult(prepared.payload, `clone-${label}`, []), operationRef: prepared.payload.operationRef };
    const result = LocalAttestEnvelopeSchema.parse(await invoke(input, handleReviewLocalAttest, request));
    expect(result.state).toBe("attested-current");
    const stored = await createReviewOutcomePort(h.reference.store, primary.reference.owner).read(prepared.payload.operationId);
    expect(stored?.value).toMatchObject({ outcome: "clean", target: prepared.payload.target });
    return { primary, prepared, request, stored };
  };
  const first = await produce(h.native, "first");
  const second = await produce(h.secondNative, "second", async () => {
    const replay = LocalAttestEnvelopeSchema.parse(await invoke(h.secondNative, handleReviewLocalAttest, first.request));
    expect(replay).toMatchObject({ state: "attested-current", payload: { persistedVersion: 0 } });
    expect(replay.payload).not.toHaveProperty("sourceRef");
    const resumed = LocalResumeEnvelopeSchema.parse(await invoke(h.secondNative, handleReviewLocalResume, { schemaVersion: 1,
      operationId: first.prepared.payload.operationId, operationRef: first.prepared.payload.operationRef }));
    expect(resumed).toMatchObject({ state: "review-complete", payload: { persistedVersion: 0 } });
    expect(resumed.payload).not.toHaveProperty("sourceRef");
  });
  expect(second.primary.reference.owner).not.toEqual(first.primary.reference.owner);
  expect(second.prepared.payload.target).toEqual(first.prepared.payload.target);
  expect(first.stored?.value.target.repositoryId).toBe(projectId);
  expect(second.stored?.value.target.repositoryId).toBe(projectId);
  expect(await createReviewOutcomePort(h.reference.store, first.primary.reference.owner).read(first.prepared.payload.operationId))
    .toEqual(first.stored);
}, 60_000);
