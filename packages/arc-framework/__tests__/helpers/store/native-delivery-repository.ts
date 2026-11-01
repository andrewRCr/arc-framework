/** A real two-member delivery with checked native review records and an executable host boundary. */
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { expect, onTestFinished, vi } from "vitest";
import { createReviewRepositoryHarness } from "./review-differential.js";
import { deliveryStackPlanForWorkUnitFixture } from "../../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../../fixtures/delivery-state.js";
import { DeliveryStateV1Schema } from "../../../src/lib/delivery/schema.js";
import { RepositoryGitCommonStatePublisher } from "../../../src/lib/git-common-state.js";
import { RepositoryDeliveryPlanStore, RepositoryDeliveryStateStore } from "../../../src/lib/delivery/local-stores.js";
import { DeliveryPlanV1Codec } from "../../../src/lib/delivery/plan.js";
import { collectGitCandidateSubject } from "../../../src/lib/work-unit/git-candidate-subject.js";
import { createCandidateAttestation } from "../../../src/lib/work-unit/candidate-attestation.js";
import { projectStandardReviewObligation } from "../../../src/scripts/review-gate/policy/standard-review-projection.js";
import { resolveReviewRouting } from "../../../src/scripts/review-gate/policy/routing.js";

import { writeSubmissionBoundary } from "../../../src/lib/store/kinds/review/integration-boundary/access.js";
import { createStandardReviewReservation, projectPublicationBoundary } from "../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { writeWorktreeMarker } from "../../../src/lib/git/worktree-marker.js";

/** Seed a published local stack, a native Candidate and reservation, and an isolated GitHub executable. */
export async function createNativeDeliveryReviewRepository(firstBranch = "member-1", sourceId = "delegated-agent") {
  const branches = [firstBranch, "member-2"];
  const h = await createReviewRepositoryHarness();
  onTestFinished(h.cleanup);
  const { cwd, exec: realExec } = h.native;
  const git = async (...args: string[]) => (await realExec("git", args, { cwd })).stdout.trim();
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"), `branch.base: main\nreview.standard_sources: [${sourceId}]\n`);
  await writeFile(join(cwd, ".gitignore"), ".arc/system/.internal/\n.arc/user/\n");
  await git("add", ".");
  await git("commit", "-m", "Configure delivery review");
  await git("push", "origin", "main");
  const base = await git("rev-parse", "HEAD"), baseTree = await git("rev-parse", "HEAD^{tree}");
  const heads: string[] = [], trees: string[] = [];
  for (const member of [1, 2]) {
    await git("switch", "-c", branches[member - 1]!);
    await writeFile(join(cwd, `member-${member}.ts`), `export const member${member} = true;\n`);
    await git("add", ".");
    await git("commit", "-m", `Implement member ${member}`);
    await git("push", "origin", branches[member - 1]!);
    heads.push(await git("rev-parse", "HEAD"));
    trees.push(await git("rev-parse", "HEAD^{tree}"));
  }
  const projectId = "123e4567-e89b-42d3-a456-426614174099";
  const project = await h.reference.seedProject(projectId);
  await git("config", "arc.identity", "andrew");
  const primary = await h.reference.seedMeta("example", { owner: "andrew", branch: null, workClass: "Light" }, { kind: "active" }, {
    branches: [{ repository: projectId, ref: "member-2", linkedAs: "adopted", excluded: [] }],
  });
  await writeWorktreeMarker(cwd, { spawnedByArc: false, spawningIdentity: "andrew", createdAt: "2026-10-20T18:00:00Z",
    createdFor: { kind: "work-unit", name: "example" } });
  const collected = await collectGitCandidateSubject({ cwd, name: "example", baseBranch: "main", exec: realExec });
  if (collected.status !== "collected") throw new Error(collected.detail);
  const attestation = createCandidateAttestation({ workUnit: "example", subject: collected.target.subject, baseRevision: collected.target.revision,
    attestedBy: "andrew", attestedAt: "2026-10-20T18:00:00Z", verificationEvidenceRef: "test://verified" });
  await h.reference.seedCandidate(primary.reference.owner, { schemaVersion: 1, semanticsVersion: "candidate-attestation/v1",
    subject: collected.target.subject, attestation, transitions: [], lineageAttestations: [] });
  const plan = deliveryStackPlanForWorkUnitFixture("example");
  const state = DeliveryStateV1Schema.parse({ ...deliveryStateFixture(plan),
    target: { ref: "refs/heads/main", coordinates: { head: base, tree: baseTree } },
    members: plan.members.map((member, i) => ({ deliverableId: member.deliverableId, ref: `refs/heads/${branches[i]}`,
      changeRequest: { providerId: "github", changeRequestId: String(41 + i) },
      coordinates: { base: i === 0 ? base : heads[i - 1], head: heads[i], tree: trees[i] } })) });
  const publisher = new RepositoryGitCommonStatePublisher(realExec, cwd);
  expect(await new RepositoryDeliveryPlanStore(publisher, DeliveryPlanV1Codec).publishCurrent(plan.planId, plan, null))
    .toMatchObject({ status: "ok" });
  const publishedState = await new RepositoryDeliveryStateStore(publisher).publish(plan.planId, state, 0);
  if (publishedState.status !== "ok") throw new Error(publishedState.reason);
  const obligation = projectStandardReviewObligation(resolveReviewRouting({}).decision);
  const reservation = createStandardReviewReservation({ candidateId: attestation.candidateId, sourceId,
    target: { kind: "delivery", repository: "owner/repo", workUnitId: "example", planId: plan.planId }, obligation });
  const boundary = projectPublicationBoundary({ workUnit: "example", branch: "member-2", candidateId: attestation.candidateId,
    candidateSubjectDigest: collected.target.subject.subjectDigest, reservation, changeRequest: null, readinessBinding: null }, 2);
  const access = { store: h.reference.store, owner: primary.reference.owner };
  await writeSubmissionBoundary(cwd, boundary, null, access);

  const bin = await mkdtemp(join(tmpdir(), "arc-native-delivery-gh-"));
  onTestFinished(() => rm(bin, { recursive: true, force: true }));
  onTestFinished(() => { vi.unstubAllEnvs(); });
  const pulls = heads.map((head, i) => ({ number: 41 + i, state: "open", merged: false, draft: true,
    head: { ref: branches[i], sha: head, repo: { full_name: "owner/repo" } },
    base: { ref: i === 0 ? "main" : firstBranch, repo: { full_name: "owner/repo" } } }));
  const pullsPath = join(bin, "pulls.json");
  await writeFile(pullsPath, JSON.stringify(pulls));
  await writeFile(join(bin, "gh"), `#!/usr/bin/env node\nconst args = process.argv.slice(2);\nconst pulls = JSON.parse(require("node:fs").readFileSync(${JSON.stringify(pullsPath)}, "utf8"));\n`
    + `let value;\nif (args[0] === 'pr' && args[1] === 'list') value = pulls.filter(p => p.head.ref === args[args.indexOf('--head') + 1]).map(p => ({number:p.number,url:'https://github.com/owner/repo/pull/'+p.number,state:p.merged?'MERGED':p.state.toUpperCase(),baseRefName:p.base.ref,headRefName:p.head.ref,headRefOid:p.head.sha}));\n`
    + `else if (args[0] === 'pr' && args[1] === 'checks') value = [];\n`
    + `else if (args[0] === 'repo' && args[1] === 'view') value = {nameWithOwner:'owner/repo'};\n`
    + `else if (args.includes('graphql')) value = {data:{repository:{pullRequest:{reviewDecision:null}}}};\n`
    + `else { const path = args.find(a => a.startsWith('repos/')); const match = /^repos\\/owner\\/repo\\/pulls\\/(\\d+)$/.exec(path ?? '');\n`
    + `if (match) value = pulls.find(p => p.number === Number(match[1]));\n`
    + `else if (path?.includes('/rules/branches/')) value = [[]];\n`
    + `else if (path?.includes('/branches/')) value = {}; }\n`
    + `if (value === undefined) {console.error('Unexpected gh request', args);process.exit(1);} console.log(JSON.stringify(value));\n`);
  await chmod(join(bin, "gh"), 0o755);
  vi.stubEnv("PATH", `${bin}${delimiter}${process.env.PATH ?? ""}`);
  await git("config", `url.${h.origin}.insteadOf`, "https://github.com/owner/repo.git");
  await git("remote", "set-url", "origin", "https://github.com/owner/repo.git");
  const updatePull = async (index: number, changes: { merged?: boolean; baseRef?: string }) => {
    const pull = pulls[index];
    if (pull === undefined) throw new Error("Unknown fixture member");
    if (changes.merged !== undefined) { pull.merged = changes.merged; pull.state = changes.merged ? "closed" : "open"; }
    if (changes.baseRef !== undefined) pull.base.ref = changes.baseRef;
    await writeFile(pullsPath, JSON.stringify(pulls));
  };
  return { ...h, cwd, realExec, git, primary, project, projectId, heads, branches, plan, state, boundary, obligation, access, updatePull, stateRevision: publishedState.value.revision };
}
