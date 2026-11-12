/** Frontline resolve refuses a supplied base that the local branch cannot reproduce, then resumes after repair. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { SpineRemedySchema } from "../../src/scripts/integration/spine-refusal.js";
import { handleReviewFrontlineResolve } from "../../src/handlers/review.js";
import { writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { TransientIdentityRecordSchema } from "../../src/lib/errand/identity-record.js";
import { FrontlineResolveRequestSchema } from "../../src/scripts/review-gate/policy/frontline-command-schema.js";
import { ReviewCommandErrorEnvelopeSchema } from "../../src/scripts/review-gate/core/review-command-envelope.js";
import { createReviewRepositoryHarness } from "../helpers/store/review-differential.js";

it("refuses before admission and admits the identical request after fast-forwarding the local base", async () => {
  const h = await createReviewRepositoryHarness();
  onTestFinished(h.cleanup);
  const { cwd, exec } = h.native;
  const git = async (...args: string[]) => (await exec("git", args, { cwd })).stdout.trim();
  const projectId = "123e4567-e89b-42d3-a456-426614174099", claimId = "1".repeat(32), branch = "chore/repair";
  await h.reference.seedProject(projectId);
  await git("config", "arc.identity", "andrew");
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"), "branch.base: main\nreview.frontline_sources: [coderabbit-cli]\n");
  await writeFile(join(cwd, ".gitignore"), ".arc/system/.internal/\n.arc/user/\n");
  await git("add", ".");
  await git("commit", "-m", "Configure review");
  const staleBase = await git("rev-parse", "HEAD");
  await git("switch", "-c", branch);
  await writeFile(join(cwd, "base.ts"), "export const base = 1;\n");
  await git("add", ".");
  await git("commit", "-m", "Advance shared base");
  const diffBaseSha = await git("rev-parse", "HEAD");
  await git("update-ref", "refs/remotes/origin/main", diffBaseSha);
  await writeFile(join(cwd, "example.ts"), "export const value = 1;\n");
  await git("add", ".");
  await git("commit", "-m", "Change example");
  const headSha = await git("rev-parse", "HEAD");
  const createdAt = "2026-11-05T12:00:00Z";
  const record = TransientIdentityRecordSchema.parse({ version: 3, kind: "errand", purpose: "errand", slug: "repair",
    claimId, intent: "Repair example", owner: "andrew", origin: "description", originEntry: null, branch,
    state: "open", savedHead: null, changeRequest: null, createdAt, updatedAt: createdAt });
  if (record.kind !== "errand") throw new Error("Expected Errand");
  const primary = await h.reference.seedErrand(record);
  await writeWorktreeMarker(cwd, { spawnedByArc: false, spawningIdentity: "andrew", createdAt, provisioning: "ready",
    createdFor: { kind: "errand", slug: "repair", claimId } });
  const request = FrontlineResolveRequestSchema.parse({ schemaVersion: 1,
    changeSet: { schemaVersion: 1, changeSetState: "known", contentKind: "code-bearing", reviewRisk: "sensitive",
      changeDeterminacy: "atomic", ownership: "self", surfaceAuthority: "ordinary",
      assurance: { workContext: "errand", workClass: "none" }, activity: { selfReview: true, frontlineReview: true } },
    invocation: { mode: "inherit", sourceId: "coderabbit-cli" }, target: { kind: "change-set", baseRef: "main", diffBaseSha, headSha } });
  const invoke = async (submitted: unknown) => {
    let output = "";
    const exits: number[] = [];
    await handleReviewFrontlineResolve("-", { resolveRoot: () => cwd, readText: async () => JSON.stringify(submitted),
      write: text => { output += text; }, setExitCode: code => exits.push(code) }, undefined,
    { ...h.native, workItem: primary.reference.owner });
    return { result: JSON.parse(output) as unknown, exits, output };
  };
  const before = await h.reference.store.version();
  const refused = await invoke(request);
  expect(refused.exits, refused.output).toEqual([1]);
  const error = ReviewCommandErrorEnvelopeSchema.parse(refused.result);
  expect(error).toMatchObject({ error: { code: "invalid-input" }, diagnostics: [{ code: "repository-precondition", precondition: "base-resolved" }] });
  if (!("remedy" in error)) throw new Error("Expected a corrective resolve remedy");
  const remedy = SpineRemedySchema.parse(error.remedy);
  expect(remedy.text).toContain("Fast-forward the local base branch 'main'");
  expect(remedy.stdin).toEqual(request);
  expect(remedy.argv).toEqual(["arc", "review", "frontline", "resolve", "-"]);
  expect(await h.reference.store.version()).toEqual(before);
  await git("update-ref", "refs/heads/main", diffBaseSha, staleBase);
  const repaired = await invoke(remedy.stdin);
  expect(repaired.exits, repaired.output).toEqual([]);
  expect(repaired.result).toMatchObject({ state: "ready", nextAction: "run-frontline", payload: { pass: 1,
    admission: { logicalPass: 1, target: { diffBaseSha, headSha } } } });
}, 60_000);
