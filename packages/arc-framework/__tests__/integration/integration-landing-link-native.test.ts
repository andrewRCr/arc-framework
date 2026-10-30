/** Already-landed native integration repairs durable traceability through the ordinary handler. */
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { handleIntegrationMerge } from "../../src/handlers/integration.js";
import { IntegrationMergeResultSchema } from "../../src/scripts/integration/merge.js";
import { persistIntegrationCheckpointComposition } from "../../src/scripts/integration/checkpoint-store.js";
import { composeCanonicalSettlementPlan } from "../../src/scripts/integration/settlement-plan.js";
import { createUserSurfaceResolver } from "../../src/lib/user-surfaces.js";
import { SlugSchema, canonicalDigest } from "../../src/lib/kernel/index.js";
import { createReviewRepositoryHarness } from "../helpers/store/review-differential.js";
import { lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import type { Store } from "../../src/lib/store/index.js";
import { lackingEndedHistory } from "../helpers/store/ended-history.js";

async function landed(archived = false) {
  const h = await createReviewRepositoryHarness();
  onTestFinished(h.cleanup);
  const { cwd, exec } = h.native;
  const git = async (...args: string[]) => (await exec("git", args, { cwd })).stdout.trim();
  const projectId = "123e4567-e89b-42d3-a456-426614174099", branch = "topic/opaque";
  await h.reference.seedProject(projectId);
  await git("config", "arc.identity", "test-user");
  await git("switch", "-c", branch);
  await writeFile(join(cwd, "feature.ts"), "export const value = 1;\n");
  await git("add", "feature.ts");
  await git("commit", "-m", "Implement the feature");
  const head = await git("rev-parse", "HEAD");
  await git("push", "origin", branch);
  await git("switch", "main");
  await git("merge", "--no-ff", branch, "-m", "Land the feature");
  const mergeCommit = await git("rev-parse", "HEAD");
  await git("push", "origin", "main");
  await git("switch", branch);
  await git("remote", "set-url", "origin", "git@github.com:owner/repo.git");
  await git("config", `url.${h.origin}.insteadOf`, "git@github.com:owner/repo.git");
  const links = { branches: [{ repository: projectId, ref: branch, linkedAs: "adopted" as const, excluded: [] }],
    changeRequest: { repository: projectId, number: 42 } };
  const meta = await h.reference.seedMeta("example", archived ? { state: "Shipped", branch: null, currentWorkflow: null }
    : { state: "Integrating", branch: null, currentWorkflow: "integrate-work-unit" },
  archived ? { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } : { kind: "active" }, links);
  const surfaces = createUserSurfaceResolver({ cwd, identity: SlugSchema.parse("test-user") });
  const checkpoint = await persistIntegrationCheckpointComposition(surfaces.workUnitRoot(SlugSchema.parse("example")), {
    workUnit: "example", approvedHead: head, lifecycleVersion: meta.version,
    target: { repository: "owner/repo", pullRequest: 42, baseRef: "main", headRef: branch, headSha: head },
    settlementPlan: composeCanonicalSettlementPlan([]), mergeMethod: { schemaVersion: 1, mode: "review-merge-method-resolve",
      repository: "owner/repo", stackPosition: "non-delivery", state: "validated", nextAction: "use-method",
      method: "merge", allowedMethods: ["merge"], policyFingerprint: canonicalDigest({ policy: 1 }) },
  });
  const bin = join(cwd, "..", "landing-host-bin");
  await mkdir(bin, { recursive: true });
  const host = async (identity: string | null) => {
    const candidate = { number: 42, url: "https://github.com/owner/repo/pull/42", state: "MERGED",
      baseRefName: "main", headRefName: branch, headRefOid: head };
    const confirmation = { number: 42, merged: true, merge_commit_sha: identity,
      base: { ref: "main" }, head: { ref: branch, sha: head } };
    await writeFile(join(bin, "gh"), ["#!/bin/sh", 'case "$1:$2" in',
      `pr:list) printf '%s\\n' '${JSON.stringify([candidate])}' ;;`,
      `api:repos/owner/repo/pulls/42) printf '%s\\n' '${JSON.stringify(confirmation)}' ;;`,
      '*) echo "unexpected host invocation: $*" >&2; exit 1 ;;', "esac", ""].join("\n"));
    await chmod(join(bin, "gh"), 0o755);
  };
  const oldPath = process.env.PATH;
  process.env.PATH = `${bin}${delimiter}${oldPath ?? ""}`;
  onTestFinished(() => { if (oldPath === undefined) delete process.env.PATH; else process.env.PATH = oldPath; });
  const run = async (store: Store = h.reference.store) => {
    let output = "";
    const exits: number[] = [];
    const originalCwd = process.cwd();
    try {
      process.chdir(cwd);
      await handleIntegrationMerge("example", { checkpoint }, undefined, { resolveRoot: () => cwd,
        write: value => { output += value; }, setExitCode: value => exits.push(value) },
      { store, projectId: h.reference.projectId, workItem: meta.reference.owner });
    } finally { process.chdir(originalCwd); }
    expect(exits, output).toEqual([]);
    return IntegrationMergeResultSchema.parse(JSON.parse(output));
  };
  return { h, git, projectId, head, mergeCommit, links, meta, checkpoint, host, run };
}

it("retains a landed merge through missing host identity and a failed link write, then saves the host commit on retry", async () => {
  const { h, git, projectId, head, mergeCommit, links, meta, checkpoint, host, run } = await landed();
  await host(null);
  expect(await run()).toMatchObject({ state: "merged", payload: { landingLink: { state: "not-written",
    remedy: { argv: ["arc", "integrate", "merge", "example", "--checkpoint", checkpoint] } } } });
  expect(lifecycleSuccess(await h.reference.store.read({ reference: meta.reference }))).toEqual(meta);
  await host(mergeCommit);
  const write = h.reference.store.write.bind(h.reference.store);
  h.reference.store.write = async input => input.action === "put" && input.links?.landingCommit !== undefined
    ? { status: "refused", refusal: { code: "version-conflict", class: "recoverable", records: [meta.reference],
        condition: "Metadata moved before its link write.", remedy: { text: "Reread metadata and retry." } } }
    : write(input);
  expect(await run()).toMatchObject({ state: "merged", payload: { providerMergeId: mergeCommit,
    landingLink: { state: "not-written", detail: expect.stringContaining("Metadata moved") } } });
  h.reference.store.write = write;
  expect(await run()).toMatchObject({ state: "merged", payload: { providerMergeId: mergeCommit, landingLink: { state: "written" } } });
  expect(lifecycleSuccess(await h.reference.store.read({ reference: meta.reference })).links).toEqual({ ...links,
    landingCommit: { repository: projectId, sha: mergeCommit } });
  expect(await git("rev-parse", "HEAD")).toBe(head);
  expect(await git("diff", "--cached", "--name-only")).toBe("");
  expect(await git("rev-parse", "origin/main")).toBe(mergeCommit);
}, 30_000);

it("links an archived work unit's landing after pulling the history this clone lacks", async () => {
  const { h, projectId, mergeCommit, links, meta, host, run } = await landed(true);
  await host(mergeCommit);
  expect(await run(lackingEndedHistory(h.reference.store, meta.reference.owner))).toMatchObject({ state: "merged",
    payload: { providerMergeId: mergeCommit, landingLink: { state: "written" } } });
  expect(lifecycleSuccess(await h.reference.store.read({ reference: meta.reference })).links).toEqual({ ...links,
    landingCommit: { repository: projectId, sha: mergeCommit } });
}, 30_000);
