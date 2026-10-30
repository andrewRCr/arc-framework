/** From a free primary, Candidate continuation over a real ref backend takes a completed work unit's exact generation. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";
import { RecordReferenceSchema, recordReferences, type OwnerIdentity, type Store, type WritePlacement }
  from "../../src/lib/store/index.js";
import { createProjectIdentityReader } from "../../src/lib/store/project-identity.js";
import { renderMetaFile } from "../../src/lib/store/kinds/meta/writers.js";
import { writeCandidateRecord } from "../../src/lib/store/kinds/review/candidate/access.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { canonicalDigest } from "../../src/lib/kernel/canonical/canonical-json.js";
import { createCandidateAttestation, createCandidateSubjectSnapshot } from "../../src/lib/work-unit/candidate-attestation.js";
import { collectGitCandidateSubject } from "../../src/lib/work-unit/git-candidate-subject.js";
import { handleCandidateApplicabilityResolve } from "../../src/handlers/candidate.js";
import { resolveCandidateMutationGeneration } from "../../src/handlers/candidate-mutation-owner.js";
import { readRespondCandidate } from "../../src/scripts/review-gate/runtime/respond-candidate-selection.js";

const projectId = "45678901-2345-4345-8345-23456789abcd";
const completed: WritePlacement = { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") };

async function primaryCheckout() {
  const f = await refSyncFixture();
  const { root: cwd, exec, store } = f.a;
  const git = async (...args: string[]) => (await exec("git", args, { cwd })).stdout.trim();
  success(await store.write({ action: "put", expected: null, content: JSON.stringify({ projectId }),
    reference: RecordReferenceSchema.parse({ kind: "project-registry/identity", owner: { type: "project", name: "project" } }),
    provenance: { verb: "seed", lifecycleAction: "create" } }));
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"), "branch.base: main\n");
  await writeFile(join(cwd, ".gitignore"), ".arc/system/.internal/\n.arc/user/\n");
  await git("add", ".");
  await git("commit", "-m", "Configure project");
  return { cwd, exec, store, git, invocation: { cwd, exec, store, projectId: createProjectIdentityReader(store) } };
}

// Start a work unit, archiving it unless it stays live.
async function generation(store: Store, name: string, live = false): Promise<OwnerIdentity> {
  const written = success(await store.write({ action: "put", expected: null, placement: { kind: "active" },
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name } }),
    content: renderMetaFile(name, { state: "Active", owner: "andrew", workClass: "Light", currentWorkflow: "process-task-loop" }),
    provenance: { verb: "start", lifecycleAction: "activate" } }));
  if (live) return written.reference.owner;
  const created = success(await store.read({ reference: written.reference }));
  success(await store.write({ action: "put", expected: created.version, placement: completed, reference: created.reference,
    content: renderMetaFile(name, { state: "Shipped", owner: "andrew", workClass: "Light", currentWorkflow: null, branch: null }),
    provenance: { verb: "archive", lifecycleAction: "archive" } }));
  return created.reference.owner;
}

function applicabilityRequest() {
  const subject = createCandidateSubjectSnapshot([{ path: "src/example.ts", mode: "100644",
    digest: canonicalDigest({ source: "candidate" }), treatment: "reviewable" }]);
  return { schemaVersion: 1, expectedRecordVersion: canonicalDigest({ version: 1 }), candidateId: canonicalDigest({ candidate: 1 }),
    priorTarget: { revision: "a".repeat(40), subject }, currentTarget: { revision: "b".repeat(40), subject },
    currentBase: "b".repeat(40), projectionDigest: canonicalDigest({ projection: 1 }),
    residualDigest: canonicalDigest({ residual: 1 }), selectedBy: "andrew", choice: "covered" };
}

it("refuses from a free primary a slug two completed generations share, and continues the other once one is renamed",
  async () => {
    const { store, invocation } = await primaryCheckout();
    const first = await generation(store, "example"), second = await generation(store, "example");
    const request = applicabilityRequest();
    let output = "";
    await handleCandidateApplicabilityResolve("example", "-", undefined, { readText: async () => JSON.stringify(request),
      write: text => { output += text; }, setExitCode: () => undefined }, invocation);
    expect(JSON.parse(output)).toMatchObject({ state: "execution-unavailable", reason: "execution-failed",
      detail: "`example` names more than one completed work unit.",
      remedy: { argv: ["arc", "candidate", "applicability", "resolve", "example", "-"], stdin: request,
        text: expect.stringContaining("Rename one of them to a free slug, then retry") } });

    const stored = success(await store.read({ reference: recordReferences["work-item/meta"](first) }));
    success(await store.write({ action: "put", expected: stored.version, placement: completed, content: stored.content,
      reference: RecordReferenceSchema.parse({ ...stored.reference, owner: { ...stored.reference.owner, name: "renamed" } }),
      provenance: { verb: "rename", lifecycleAction: "rename" } }));
    expect(await resolveCandidateMutationGeneration(store, "example", "unowned")).toEqual(second);
  }, 60_000);

it("reads from a free primary the bound completed generation's Candidate beside another completed work unit's, and "
  + "never a live namesake's", async () => {
  const { cwd, exec, store, git, invocation } = await primaryCheckout();
  await git("switch", "-c", "feat/example");
  await writeFile(join(cwd, "feature.txt"), "reviewed\n");
  await git("add", "feature.txt");
  await git("commit", "-m", "Implement feature");
  const collected = await collectGitCandidateSubject({ cwd, name: "example", baseBranch: "main", exec });
  if (collected.status !== "collected") throw new Error(collected.detail);
  await git("switch", "main");
  const candidate = (workUnit: string, attestedAt: string) => ({ schemaVersion: 1 as const,
    semanticsVersion: "candidate-attestation/v1" as const, subject: collected.target.subject,
    attestation: createCandidateAttestation({ workUnit, subject: collected.target.subject, baseRevision: collected.target.revision,
      attestedBy: "andrew", attestedAt, verificationEvidenceRef: "test://verified" }), transitions: [], lineageAttestations: [] });
  const ended = await generation(store, "example"), other = await generation(store, "other");
  const live = await generation(store, "example", true);
  const endedRecord = candidate("example", "2026-10-30T12:00:00Z"), liveRecord = candidate("example", "2026-10-30T13:00:00Z");
  await writeCandidateRecord(cwd, "example", endedRecord, null, { store, owner: ended });
  await writeCandidateRecord(cwd, "other", candidate("other", "2026-10-30T12:30:00Z"), null, { store, owner: other });
  await writeCandidateRecord(cwd, "example", liveRecord, null, { store, owner: live });
  const read = (workItem: OwnerIdentity, record: typeof endedRecord) => readRespondCandidate({ ...invocation, workItem },
    { kind: "candidate", candidateId: record.attestation.candidateId });

  expect(await read(ended, endedRecord)).toEqual({ workUnit: "example", record: endedRecord });
  expect(await read(live, liveRecord)).toBeNull();
}, 60_000);
