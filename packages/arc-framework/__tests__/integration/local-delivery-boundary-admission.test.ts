/** Native delivery admission retains the stored boundary version across production status validation. */
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { expect, it, vi } from "vitest";
import { createReviewRepositoryHarness } from "../helpers/store/review-differential.js";
import { deliveryStackPlanForWorkUnitFixture } from "../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../fixtures/delivery-state.js";
import { DeliveryStateV1Schema } from "../../src/lib/delivery/schema.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { RepositoryDeliveryPlanStore, RepositoryDeliveryStateStore } from "../../src/lib/delivery/local-stores.js";
import { DeliveryPlanV1Codec } from "../../src/lib/delivery/plan.js";
import { collectGitCandidateSubject } from "../../src/lib/work-unit/git-candidate-subject.js";
import { createCandidateAttestation } from "../../src/lib/work-unit/candidate-attestation.js";
import { createStandardReviewReservation, projectPublicationBoundary, IntegrationBoundaryLocusV2Schema } from "../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { writeSubmissionBoundary, readSubmissionBoundaryVersioned } from "../../src/lib/store/kinds/review/integration-boundary/access.js";
import { projectStandardReviewObligation } from "../../src/scripts/review-gate/policy/standard-review-projection.js";
import { resolveReviewRouting } from "../../src/scripts/review-gate/policy/routing.js";
import { resolveReviewStatus } from "../../src/scripts/review-gate/status.js";
import { createReviewStatusPort } from "../../src/scripts/review-gate/status-composition.js";
import { createLocalPrepareDependencies } from "../../src/scripts/review-gate/runtime/local-prepare-composition.js";
import type { GitExec } from "../../src/lib/git/exec.js";

it("rejects a moved native boundary during delivery admission and succeeds after a stable retry", async ({ onTestFinished }) => {
  const h = await createReviewRepositoryHarness();
  onTestFinished(h.cleanup);
  const { cwd, exec: realExec } = h.native;
  const git = async (...args: string[]) => (await realExec("git", args, { cwd })).stdout.trim();
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"), "branch.base: main\nreview.standard_sources: [delegated-agent]\n");
  await writeFile(join(cwd, ".gitignore"), ".arc/system/.internal/\n.arc/user/\n");
  await git("add", ".");
  await git("commit", "-m", "Configure delivery review");
  await git("push", "origin", "main");
  const base = await git("rev-parse", "HEAD"), baseTree = await git("rev-parse", "HEAD^{tree}");
  const heads: string[] = [], trees: string[] = [];
  for (const member of [1, 2]) {
    await git("switch", "-c", `member-${member}`);
    await writeFile(join(cwd, `member-${member}.ts`), `export const member${member} = true;\n`);
    await git("add", ".");
    await git("commit", "-m", `Implement member ${member}`);
    await git("push", "origin", `member-${member}`);
    heads.push(await git("rev-parse", "HEAD"));
    trees.push(await git("rev-parse", "HEAD^{tree}"));
  }
  const projectId = "123e4567-e89b-42d3-a456-426614174099";
  await h.reference.seedProject(projectId);
  const primary = await h.reference.seedMeta("example", { branch: null });
  const collected = await collectGitCandidateSubject({ cwd, name: "example", baseBranch: "main", exec: realExec });
  if (collected.status !== "collected") throw new Error(collected.detail);
  const attestation = createCandidateAttestation({ workUnit: "example", subject: collected.target.subject, baseRevision: base,
    attestedBy: "andrew", attestedAt: "2026-10-20T18:00:00Z", verificationEvidenceRef: "test://verified" });
  await h.reference.seedCandidate(primary.reference.owner, { schemaVersion: 1, semanticsVersion: "candidate-attestation/v1",
    subject: collected.target.subject, attestation, transitions: [], lineageAttestations: [] });
  const plan = deliveryStackPlanForWorkUnitFixture("example");
  const state = DeliveryStateV1Schema.parse({ ...deliveryStateFixture(plan),
    target: { ref: "refs/heads/main", coordinates: { head: base, tree: baseTree } },
    members: plan.members.map((member, i) => ({ deliverableId: member.deliverableId, ref: `refs/heads/member-${i + 1}`,
      changeRequest: { providerId: "github", changeRequestId: String(41 + i) },
      coordinates: { base: i === 0 ? base : heads[i - 1], head: heads[i], tree: trees[i] } })) });
  const publisher = new RepositoryGitCommonStatePublisher(realExec, cwd);
  expect(await new RepositoryDeliveryPlanStore(publisher, DeliveryPlanV1Codec).publishCurrent(plan.planId, plan, null))
    .toMatchObject({ status: "ok" });
  expect(await new RepositoryDeliveryStateStore(publisher).publish(plan.planId, state, 0)).toMatchObject({ status: "ok" });
  const obligation = projectStandardReviewObligation(resolveReviewRouting({}).decision);
  const reservation = createStandardReviewReservation({ candidateId: attestation.candidateId, sourceId: "delegated-agent",
    target: { kind: "delivery", repository: "owner/repo", workUnitId: "example", planId: plan.planId }, obligation });
  const boundary = projectPublicationBoundary({ workUnit: "example", branch: "member-2", candidateId: attestation.candidateId,
    candidateSubjectDigest: collected.target.subject.subjectDigest, reservation, changeRequest: null, readinessBinding: null }, 2);
  const access = { store: h.reference.store, owner: primary.reference.owner };
  await writeSubmissionBoundary(cwd, boundary, null, access);

  const bin = await mkdtemp(join(tmpdir(), "arc-native-delivery-gh-"));
  onTestFinished(() => rm(bin, { recursive: true, force: true }));
  onTestFinished(() => { vi.unstubAllEnvs(); });
  const pulls = heads.map((head, i) => ({ number: 41 + i, state: "open", merged: false, draft: true,
    head: { ref: `member-${i + 1}`, sha: head, repo: { full_name: "owner/repo" } },
    base: { ref: i === 0 ? "main" : "member-1", repo: { full_name: "owner/repo" } } }));
  await writeFile(join(bin, "gh"), `#!/usr/bin/env node\nconst args = process.argv.slice(2);\nconst pulls = ${JSON.stringify(pulls)};\n`
    + `let value;\nif (args[0] === 'pr' && args[1] === 'list') value = pulls.filter(p => p.head.ref === args[args.indexOf('--head') + 1]).map(p => ({number:p.number,url:'https://github.com/owner/repo/pull/'+p.number,state:'OPEN',baseRefName:p.base.ref,headRefName:p.head.ref,headRefOid:p.head.sha}));\n`
    + `else if (args[0] === 'pr' && args[1] === 'checks') value = [];\n`
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
  let moveBoundary = false;
  const exec: GitExec = async (command, args, options) => {
    if (moveBoundary && command === "git" && args[0] === "ls-remote") {
      moveBoundary = false;
      const current = await readSubmissionBoundaryVersioned(cwd, "example", access);
      if (current.boundary === null) throw new Error("Expected the native boundary");
      await writeSubmissionBoundary(cwd, IntegrationBoundaryLocusV2Schema.parse({ ...current.boundary,
        nextAction: { ...current.boundary.nextAction, interactionText: `${current.boundary.nextAction.interactionText} Retry after observation.` } }), current.version, access);
    }
    return realExec(command, args, options);
  };
  const input = { ...h.native, exec, workItem: primary.reference.owner };
  const status = await resolveReviewStatus({ target: { repository: "owner/repo", headRef: "member-1", headSha: heads[0]! },
    coverage: "complete", sourceId: "delegated-agent" }, createReviewStatusPort(input));
  expect(status, JSON.stringify(status)).toMatchObject({ nextAction: "review-local-prepare" });
  if (status.nextAction !== "review-local-prepare") throw new Error(JSON.stringify(status));
  const dependencies = createLocalPrepareDependencies(input);
  expect(await dependencies.validateDeliveryAdmission(status.action)).toEqual(obligation);
  moveBoundary = true;
  await expect(dependencies.validateDeliveryAdmission(status.action)).rejects.toThrow(
    "Local delivery-member review authority changed during admission validation.");
  expect(moveBoundary).toBe(false);
  expect(await dependencies.validateDeliveryAdmission(status.action)).toEqual(obligation);
}, 60_000);
