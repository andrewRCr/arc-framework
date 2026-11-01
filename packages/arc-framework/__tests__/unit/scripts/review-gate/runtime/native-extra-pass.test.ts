/** Extra-pass judgments remain portable, immutable authority within their original reach. */
import { expect, it } from "vitest";
import { createReviewHarness } from "../../../../helpers/store/review-harness.js";
import { candidateFixture } from "../../../../helpers/store/tracked-write-fixture.js";
import { reviewDecisionKey } from "../../../../../src/lib/store/kinds/review/decision/key.js";
import { createReviewDecisionPort } from "../../../../../src/lib/store/kinds/review/decision/access.js";
import { createReviewOutcomePort } from "../../../../../src/lib/store/kinds/review/outcome/access.js";
import { createReviewEvidencePort } from "../../../../../src/lib/store/kinds/review/evidence/access.js";
import { recordNativeFrontlineSkip } from "../../../../../src/scripts/review-gate/runtime/native-frontline-window.js";
import { mapReviewReplayDecisions } from "../../../../../src/lib/store/kinds/review/mapping-replay-decisions.js";
import { projectCandidateReviewBoundary, IntegrationBoundaryLocusSchema } from "../../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { scriptGitExec } from "../../../../helpers/git-exec-fake.js";
import { resolveNativeExtraPassJudgment, resolveNativeInvocationExtraPassJudgment } from "../../../../../src/scripts/review-gate/runtime/native-extra-pass.js";
import { LaneSubjectLineageSchema } from "../../../../../src/scripts/review-gate/core/lane-admission.js";
import { createReviewTarget } from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";

async function fixture() {
  const h = createReviewHarness(), repositoryId = "123e4567-e89b-42d3-a456-426614174099", candidate = candidateFixture();
  await h.seedProject(repositoryId);
  const primary = await h.seedMeta("example");
  await h.seedCandidate(primary.reference.owner, candidate);
  return { ...h, owner: primary.reference.owner, input: { facts: {
    outcomes: createReviewOutcomePort(h.store, primary.reference.owner),
    evidence: createReviewEvidencePort(h.store, primary.reference.owner),
    decisions: createReviewDecisionPort(h.store, primary.reference.owner), readProjectId: h.projectId },
    repositoryId, policyTarget: { repository: "Owner/Repo", pullRequest: 41, headSha: "a".repeat(40) }, subject: { lineage: { kind: "candidate" as const, candidateId: candidate.attestation.candidateId },
      headSha: "a".repeat(40), subjectDigest: candidate.subject.subjectDigest }, lane: "standard" as const,
    completedPasses: 2, actor: "test-user", now: "2026-10-20T12:00:00Z" } };
}

it.each(["ceiling", "skip"] as const)("records a %s under the active identity derived from user.name", async kind => {
  const h = await fixture();
  const git = scriptGitExec([
    { match: ["config", "--null", "--get", "arc.identity"], responses: [{ failure: { exitCode: 1 } }] },
    { match: ["config", "--get", "user.name"], responses: [{ stdout: "Derived User\n" }] },
  ]);
  const invocation = { cwd: "/selected", exec: git.exec, store: h.store, workItem: h.owner };
  if (kind === "ceiling") await resolveNativeInvocationExtraPassJudgment(invocation, h.input.facts,
    { ...h.input, judgment: { ceilingOverride: { exhaustedPassCount: 2, nextPass: 3 } } });
  else await recordNativeFrontlineSkip({ invocation, facts: h.input.facts, repositoryId: h.input.repositoryId,
    lineage: h.input.subject.lineage, headSha: h.input.subject.headSha, now: h.input.now });
  expect(await h.input.facts.decisions.list()).toMatchObject({ status: "complete", records: [{ value: {
    decidedBy: "derived-user", choice: { kind: kind === "ceiling" ? "extra-pass" : "lane-skip" } } }] });
});

it("records one ceiling decision and carries its pass across later heads of the same Candidate", async () => {
  const h = await fixture();
  const first = await resolveNativeExtraPassJudgment({ ...h.input, judgment: { ceilingOverride: { exhaustedPassCount: 2, nextPass: 3 } } });
  const records = await h.input.facts.decisions.list();
  expect(records).toMatchObject({ status: "complete", records: [{ value: { subject: h.input.subject,
    lane: "standard", choice: { kind: "extra-pass", passCount: 2, precondition: { kind: "ceiling" } },
    decidedBy: "test-user", basis: null } }] });
  expect(first.judgment?.ceilingOverride?.decisionKey).toMatch(/^sha256:/u);
  const before = await h.store.version();
  const carried = await resolveNativeExtraPassJudgment({ ...h.input, subject: { ...h.input.subject, headSha: "b".repeat(40) } });
  expect(carried).toMatchObject({ judgment: { ceilingOverride: { exhaustedPassCount: 2, nextPass: 3,
    decisionKey: first.judgment?.ceilingOverride?.decisionKey } } });
  expect(await h.store.version()).toEqual(before);
  expect(await resolveNativeExtraPassJudgment({ ...h.input, subject: { ...h.input.subject,
    lineage: { kind: "candidate", candidateId: canonicalDigest({ successor: 1 }) } } })).toEqual({});
});

it.each([3, 4])("reads a ceiling grant at logical count %s without rewriting its authority", async completedPasses => {
  const h = await fixture();
  const first = await resolveNativeExtraPassJudgment({ ...h.input,
    judgment: { ceilingOverride: { exhaustedPassCount: 2, nextPass: 3 } } });
  const before = await h.store.version();
  expect(await resolveNativeExtraPassJudgment({ ...h.input, completedPasses })).toEqual(completedPasses === 3 ? first : {});
  expect(await h.store.version()).toEqual(before);
});

it("refuses a spent ceiling reference without replacing it", async () => {
  const h = await fixture();
  const first = await resolveNativeExtraPassJudgment({ ...h.input,
    judgment: { ceilingOverride: { exhaustedPassCount: 2, nextPass: 3 } } });
  const before = await h.store.version();
  await expect(resolveNativeExtraPassJudgment({ ...h.input, completedPasses: 4,
    judgment: { ceilingOverride: { exhaustedPassCount: 4, nextPass: 5,
      decisionKey: first.judgment?.ceilingOverride?.decisionKey } } })).rejects.toThrow("outside this target's reach");
  expect(await h.store.version()).toEqual(before);
});

it("records an additional pass at its exact head and reads it as spent after that logical pass finishes", async () => {
  const h = await fixture();
  const judgment = { additionalPassAuthorization: { headSha: h.input.subject.headSha,
    precedingProducerId: "producer-1", completedPasses: 2, nextPass: 3 } };
  const first = await resolveNativeExtraPassJudgment({ ...h.input, judgment });
  expect(await h.input.facts.decisions.list()).toMatchObject({ status: "complete", records: [{ value: {
    choice: { kind: "extra-pass", passCount: 2, precondition: { kind: "additional", precedingProducerId: "producer-1" } },
    decidedBy: "test-user", basis: null } }] });
  expect(first.judgment?.additionalPassAuthorization?.decisionKey).toMatch(/^sha256:/u);
  const before = await h.store.version();
  expect(await resolveNativeExtraPassJudgment({ ...h.input, judgment, now: "2026-10-20T13:00:00Z" })).toEqual(first);
  expect(await resolveNativeExtraPassJudgment(h.input)).toEqual(first);
  expect(await h.store.version()).toEqual(before);
  expect(await resolveNativeExtraPassJudgment({ ...h.input, subject: { ...h.input.subject, headSha: "b".repeat(40) } })).toEqual({});
  expect(await resolveNativeExtraPassJudgment({ ...h.input, completedPasses: 3 })).toEqual({});
});

it("resolves the later ceiling decision within the same Candidate's reach", async () => {
  const h = await fixture(), judgment = { ceilingOverride: { exhaustedPassCount: 2, nextPass: 3 } };
  const first = await resolveNativeExtraPassJudgment({ ...h.input, judgment });
  const second = await resolveNativeExtraPassJudgment({ ...h.input, judgment, now: "2026-10-20T13:00:00Z",
    subject: { ...h.input.subject, headSha: "b".repeat(40) } });
  expect(second.judgment?.ceilingOverride?.decisionKey).not.toBe(first.judgment?.ceilingOverride?.decisionKey);
  const before = await h.store.version();
  expect(await resolveNativeExtraPassJudgment(h.input)).toEqual(second);
  expect(await h.store.version()).toEqual(before);
});

it("leaves a withdrawn ceiling decision outside the resolved judgment", async () => {
  const h = await fixture();
  const first = await resolveNativeExtraPassJudgment({ ...h.input,
    judgment: { ceilingOverride: { exhaustedPassCount: 2, nextPass: 3 } } });
  const key = first.judgment?.ceilingOverride?.decisionKey;
  const grant = key === undefined ? null : await h.input.facts.decisions.read(key);
  if (grant === null || key === undefined) throw new Error("Expected the stored grant");
  await h.input.facts.decisions.create({ ...grant.value, decidedAt: "2026-10-20T13:00:00Z",
    choice: { kind: "withdrawal", decisionKey: key } });
  const before = await h.store.version();
  expect(await resolveNativeExtraPassJudgment(h.input)).toEqual({});
  expect(await h.store.version()).toEqual(before);
});

it.each(["frontline", "errand", "delivery-member"] as const)("keeps a %s ceiling grant on its decided target", async kind => {
  const h = await fixture(), headSha = h.input.subject.headSha;
  const lineage = LaneSubjectLineageSchema.parse(kind === "errand"
    ? { kind: "head-bound", vehicleKind: "errand", vehicleIdentity: "claim-1", headSha }
    : kind === "delivery-member" ? { kind, planId: "123e4567-e89b-42d3-a456-426614174000",
      deliverableId: canonicalDigest({ member: 1 }), workUnitId: "example" } : h.input.subject.lineage);
  const target = createReviewTarget({ schemaVersion: 2, semanticsVersion: "review-gate/v2",
    kind: kind === "delivery-member" ? "delivery-member" : "change-set", repositoryId: h.input.repositoryId,
    baseRef: "main", diffBaseSha: "c".repeat(40), diffBaseTree: "d".repeat(40), headSha, headTree: "e".repeat(40) });
  const input = { ...h.input, lane: kind === "frontline" ? "frontline" as const : "standard" as const,
    subject: { lineage, headSha, subjectDigest: kind === "frontline" ? h.input.subject.subjectDigest : target.targetId } };
  const first = await resolveNativeExtraPassJudgment({ ...input, judgment: { ceilingOverride: { exhaustedPassCount: 2, nextPass: 3 } } });
  expect(first.judgment?.ceilingOverride?.decisionKey).toMatch(/^sha256:/u);
  expect(await resolveNativeExtraPassJudgment(input)).toEqual(first);
  expect(await resolveNativeExtraPassJudgment({ ...input, subject: { ...input.subject,
    lineage: lineage.kind === "head-bound" ? { ...lineage, headSha: "b".repeat(40) } : lineage,
    headSha: "b".repeat(40) } })).toEqual({});
  if (kind !== "frontline") {
    const { targetId, ...coordinates } = target;
    void targetId;
    const moved = createReviewTarget({ ...coordinates, diffBaseSha: "e".repeat(40), diffBaseTree: "f".repeat(40) });
    expect(await resolveNativeExtraPassJudgment({ ...input, subject: { ...input.subject, subjectDigest: moved.targetId } })).toEqual(first);
  }
});

function fullGrant(kind: "ceiling" | "additional", target: { repository: string; pullRequest: number | null; headSha: string }) {
  return kind === "ceiling" ? { ceilingOverride: { target, lane: "standard" as const, exhaustedPassCount: 2, nextPass: 3 } }
    : { additionalPassAuthorization: { target, lane: "standard" as const, precedingProducerId: "producer-1", completedPasses: 2, nextPass: 3 } };
}

it.each(["ceiling", "additional"] as const)("validates a full %s target before recording, then accepts a repaired grant", async kind => {
  const h = await fixture(), before = await h.store.version();
  for (const target of [{ ...h.input.policyTarget, repository: "Owner/Other" },
    { ...h.input.policyTarget, pullRequest: 42 }, { ...h.input.policyTarget, headSha: "b".repeat(40) }]) {
    await expect(resolveNativeExtraPassJudgment({ ...h.input, ...fullGrant(kind, target) })).rejects.toThrow(/target.*retry/iu);
    expect(await h.store.version()).toEqual(before);
  }
  const result = await resolveNativeExtraPassJudgment({ ...h.input, ...fullGrant(kind, h.input.policyTarget) });
  expect(result.judgment).toHaveProperty(kind === "ceiling" ? "ceilingOverride" : "additionalPassAuthorization");
  expect(await h.input.facts.decisions.list()).toMatchObject({ status: "complete", records: [{ value: {
    choice: { precondition: { kind, targetBinding: { kind: "policy-target", repository: "Owner/Repo", pullRequest: 41 } } },
  } }] });
});

it.each(["ceiling", "additional"] as const)("limits stored full %s authority to its original repository and nullable PR", async kind => {
  for (const pullRequest of [null, 41]) {
    const h = await fixture(), target = { ...h.input.policyTarget, pullRequest }, input = { ...h.input, policyTarget: target };
    const first = await resolveNativeExtraPassJudgment({ ...input, ...fullGrant(kind, target) });
    const before = await h.store.version();
    expect(await resolveNativeExtraPassJudgment(input)).toEqual(first);
    expect(await resolveNativeExtraPassJudgment({ ...input, policyTarget: { ...target, pullRequest: 42 } })).toEqual({});
    expect(await resolveNativeExtraPassJudgment({ ...input, policyTarget: { ...target, repository: "Owner/Other" } })).toEqual({});
    expect(await resolveNativeExtraPassJudgment({ ...input, policyTarget: { ...target, repository: "owner/repo" } }))
      .toEqual(kind === "additional" ? first : {});
    expect(await h.store.version()).toEqual(before);
  }
});

it.each(["ceiling", "additional"] as const)("relays a recorded %s grant by its exact key without replacing its author", async kind => {
  const h = await fixture();
  const first = await resolveNativeExtraPassJudgment({ ...h.input, ...fullGrant(kind, h.input.policyTarget) });
  const field = kind === "ceiling" ? "ceilingOverride" : "additionalPassAuthorization";
  expect(first.judgment?.[field]?.decisionKey).toMatch(/^sha256:/u);
  const before = await h.store.version();
  expect(await resolveNativeExtraPassJudgment({ ...h.input, actor: undefined, judgment: first.judgment })).toEqual(first);
  expect(await resolveNativeExtraPassJudgment({ ...h.input, actor: "another-user", judgment: first.judgment })).toEqual(first);
  expect(await h.store.version()).toEqual(before);
  expect(await h.input.facts.decisions.list()).toMatchObject({ status: "complete", records: [{ value: { decidedBy: "test-user" } }] });
});

it.each(["ceiling", "additional"] as const)("refuses a missing %s decision reference without creating authority, and recovers with the correct key", async kind => {
  const h = await fixture();
  const first = await resolveNativeExtraPassJudgment({ ...h.input, ...fullGrant(kind, h.input.policyTarget) });
  const field = kind === "ceiling" ? "ceilingOverride" : "additionalPassAuthorization";
  const value = first.judgment?.[field];
  if (value === undefined) throw new Error("Expected the stored judgment");
  const before = await h.store.version();
  await expect(resolveNativeExtraPassJudgment({ ...h.input, actor: "another-user",
    judgment: { [field]: { ...value, decisionKey: canonicalDigest({ missing: true }) } } })).rejects.toThrow(/reference.*retry/iu);
  expect(await h.store.version()).toEqual(before);
  expect(await resolveNativeExtraPassJudgment({ ...h.input, actor: "another-user", judgment: first.judgment })).toEqual(first);
  expect(await h.store.version()).toEqual(before);
});

it("relays a decision without consulting configured identity", async () => {
  const h = await fixture();
  const first = await resolveNativeExtraPassJudgment({ ...h.input, ...fullGrant("ceiling", h.input.policyTarget) });
  const before = await h.store.version(), git = scriptGitExec([]);
  expect(await resolveNativeInvocationExtraPassJudgment({ cwd: "/selected", exec: git.exec }, h.input.facts,
    { ...h.input, judgment: first.judgment })).toEqual(first);
  expect(await h.store.version()).toEqual(before);
});

it.each(["kind", "lane", "candidate", "repository", "pr", "withdrawal", "supersession", "ordinal", "owner"] as const)(
  "refuses an invalid cited ceiling decision: %s", async invalid => {
    const h = await fixture();
    const first = await resolveNativeExtraPassJudgment({ ...h.input, ...fullGrant("ceiling", h.input.policyTarget) });
    const ceiling = first.judgment?.ceilingOverride;
    if (ceiling?.decisionKey === undefined) throw new Error("Expected recorded ceiling reference");
    let input = { ...h.input, actor: undefined, judgment: { ceilingOverride: ceiling } };
    if (invalid === "kind") {
      const other = await resolveNativeExtraPassJudgment({ ...h.input, ...fullGrant("additional", h.input.policyTarget) });
      input.judgment.ceilingOverride = { ...ceiling, decisionKey: other.judgment?.additionalPassAuthorization?.decisionKey };
    } else if (invalid === "lane") input = { ...input, lane: "frontline" as typeof input.lane };
    else if (invalid === "candidate") input = { ...input, subject: { ...input.subject,
      lineage: { kind: "candidate", candidateId: canonicalDigest({ other: true }) } } };
    else if (invalid === "repository") input.policyTarget = { ...input.policyTarget, repository: "Owner/Other" };
    else if (invalid === "pr") input.policyTarget = { ...input.policyTarget, pullRequest: 42 };
    else if (invalid === "withdrawal") {
      const record = await h.input.facts.decisions.read(ceiling.decisionKey);
      if (record === null) throw new Error("Expected grant");
      await h.input.facts.decisions.create({ ...record.value, choice: { kind: "withdrawal", decisionKey: ceiling.decisionKey } });
    } else if (invalid === "supersession") {
      await resolveNativeExtraPassJudgment({ ...h.input, ...fullGrant("ceiling", h.input.policyTarget),
        actor: "another-user", now: "2026-10-20T13:00:00Z" });
    } else if (invalid === "owner") {
      const other = await h.seedMeta("other");
      input.facts = { ...input.facts, decisions: createReviewDecisionPort(h.store, other.reference.owner) };
    } else input.judgment.ceilingOverride = { ...ceiling, exhaustedPassCount: 1, nextPass: 2 };
    const before = await h.store.version();
    await expect(resolveNativeExtraPassJudgment(input)).rejects.toThrow(/reference.*retry/iu);
    expect(await h.store.version()).toEqual(before);
  });

it.each(["ceiling", "additional"] as const)("refuses conflicting full and targetless %s references before writing", async kind => {
  const h = await fixture(), first = await resolveNativeExtraPassJudgment({ ...h.input, ...fullGrant(kind, h.input.policyTarget) });
  const field = kind === "ceiling" ? "ceilingOverride" : "additionalPassAuthorization";
  const full = fullGrant(kind, h.input.policyTarget)[field], value = first.judgment?.[field];
  if (full === undefined || value === undefined) throw new Error("Expected grant");
  const before = await h.store.version();
  await expect(resolveNativeExtraPassJudgment({ ...h.input, judgment: first.judgment,
    [field]: { ...full, decisionKey: canonicalDigest({ other: true }) } })).rejects.toThrow(/references disagree/iu);
  expect(await h.store.version()).toEqual(before);
});

it.each(["ceiling", "additional"] as const)("binds an imported targetless %s grant at use without adding policy coordinates", async kind => {
  const h = await fixture(), lineage = h.input.subject.lineage;
  const lanes = kind === "ceiling" ? { standard: { ceilingOverride: { exhaustedPassCount: 2, nextPass: 3 } } }
    : { standard: { additionalPassAuthorization: { headSha: h.input.subject.headSha,
      precedingProducerId: "producer-1", completedPasses: 2, nextPass: 3 } } };
  const token = Buffer.from(JSON.stringify({ lanes })).toString("base64url");
  const boundary = IntegrationBoundaryLocusSchema.parse({ ...projectCandidateReviewBoundary({ workUnit: "example",
    candidateId: lineage.candidateId, candidateSubjectDigest: h.input.subject.subjectDigest }), nextAction: {
      kind: "continue-pre-publication-review", command: `arc review pre-publication example --resume ${token}`, interactionText: "Resume review." } });
  const imported = mapReviewReplayDecisions(boundary, () => 0);
  expect(imported).toHaveLength(1);
  await h.input.facts.decisions.create(imported[0]!);
  const before = await h.store.version();
  const first = await resolveNativeExtraPassJudgment(h.input);
  expect(first.judgment).toHaveProperty(kind === "ceiling" ? "ceilingOverride" : "additionalPassAuthorization");
  expect(await resolveNativeExtraPassJudgment({ ...h.input,
    policyTarget: { ...h.input.policyTarget, repository: "Other/Project", pullRequest: null } })).toEqual(first);
  expect(await h.store.version()).toEqual(before);
  expect(await h.input.facts.decisions.list()).toMatchObject({ status: "complete", records: [{ value: {
    choice: { precondition: { targetBinding: { kind: "call-target" } } }, decidedBy: null, decidedAt: null } }] });
});

it.each(["head", "ordinal", "producer"] as const)("refuses an additional reference with mismatching %s", async invalid => {
  const h = await fixture(), first = await resolveNativeExtraPassJudgment({ ...h.input, ...fullGrant("additional", h.input.policyTarget) });
  const value = first.judgment?.additionalPassAuthorization;
  if (value === undefined) throw new Error("Expected additional reference");
  const headSha = invalid === "head" ? "b".repeat(40) : h.input.subject.headSha;
  const completedPasses = invalid === "ordinal" ? 3 : 2;
  const before = await h.store.version();
  await expect(resolveNativeExtraPassJudgment({ ...h.input, actor: undefined, completedPasses,
    policyTarget: { ...h.input.policyTarget, headSha }, subject: { ...h.input.subject, headSha },
    judgment: { additionalPassAuthorization: { ...value, headSha, completedPasses, nextPass: completedPasses + 1,
      precedingProducerId: invalid === "producer" ? "another-producer" : value.precedingProducerId } } })).rejects.toThrow(/reference.*retry/iu);
  expect(await h.store.version()).toEqual(before);
});

it.each(["ceiling", "additional"] as const)("keeps an older %s grant superseded after its successor is withdrawn", async kind => {
  const h = await fixture();
  const judgment = kind === "ceiling" ? { ceilingOverride: { exhaustedPassCount: 2, nextPass: 3 } }
    : { additionalPassAuthorization: { headSha: h.input.subject.headSha, completedPasses: 2, nextPass: 3, precedingProducerId: "producer-1" } };
  const first = await resolveNativeExtraPassJudgment({ ...h.input, judgment });
  const firstKey = kind === "ceiling" ? first.judgment?.ceilingOverride?.decisionKey : first.judgment?.additionalPassAuthorization?.decisionKey;
  if (firstKey === undefined) throw new Error("expected original grant");
  const original = await h.input.facts.decisions.read(firstKey);
  if (original === null) throw new Error("expected recorded grant");
  const latest = await h.input.facts.decisions.create({ ...original.value, decidedBy: "later-owner", decidedAt: "2026-10-20T13:00:00Z" });
  await h.input.facts.decisions.create({ ...latest.value, choice: { kind: "withdrawal", decisionKey: reviewDecisionKey(latest.value) } });
  expect(await resolveNativeExtraPassJudgment(h.input)).toEqual({});
  await expect(resolveNativeExtraPassJudgment({ ...h.input, now: "2026-10-20T15:00:00Z", judgment }))
    .rejects.toThrow(/superseded/i);
  const field = kind === "ceiling" ? "ceilingOverride" : "additionalPassAuthorization";
  await expect(resolveNativeExtraPassJudgment({ ...h.input, judgment: { [field]: { ...judgment[field], decisionKey: firstKey } } }))
    .rejects.toThrow(/superseded|withdrawn/i);
  const repaired = await h.input.facts.decisions.create({ ...latest.value, decidedBy: "current-owner", decidedAt: "2026-10-20T14:00:00Z" });
  expect(await resolveNativeExtraPassJudgment(h.input)).toMatchObject({
    judgment: { [field]: { decisionKey: reviewDecisionKey(repaired.value) } } });
});
