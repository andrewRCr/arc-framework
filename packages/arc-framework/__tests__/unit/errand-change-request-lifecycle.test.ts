/** Developer-authenticated change-request lifecycle truth. */

import { describe, expect, it } from "vitest";

import {
  createGhChangeRequestLifecyclePort,
  transientTailRetirementTransform,
  type ChangeRequestLifecycleConfiguration,
  type ChangeRequestLifecycleEvidence,
  type TransientIdentityTailRecord,
  TransientIdentityRecordV3Schema,
} from "../../src/lib/errand/index.js";
import type { GitExec } from "../../src/lib/git/exec.js";

const configured: ChangeRequestLifecycleConfiguration = {
  repositoryRef: "owner/repo",
  hostRef: "github.com",
  baseRef: "main",
};
const changeRequest = {
  ...configured,
  headRef: "chore/fix-output",
  headSha: "a".repeat(40),
};

function ghResult(records: unknown[]): GitExec {
  return async () => ({ stdout: JSON.stringify(records), stderr: "" });
}

function pull(overrides: Record<string, unknown> = {}) {
  return {
    number: 7,
    state: "OPEN",
    baseRefName: "main",
    headRefName: "chore/fix-output",
    headRefOid: "a".repeat(40),
    reviewDecision: "",
    ...overrides,
  };
}

describe("GitHub change-request lifecycle port", () => {
  it("reports requested work only for an exact open head with changes requested", async () => {
    const port = createGhChangeRequestLifecyclePort(ghResult([pull({ reviewDecision: "CHANGES_REQUESTED" })]));
    await expect(port.read(configured, changeRequest)).resolves.toMatchObject({
      kind: "requested-work",
      changeRequest,
    });
  });

  it.each([
    ["OPEN", "open"],
    ["MERGED", "merged"],
    ["CLOSED", "closed-unmerged"],
  ] as const)("maps exact %s host state to %s", async (state, expected) => {
    const port = createGhChangeRequestLifecyclePort(ghResult([pull({ state })]));
    await expect(port.read(configured, changeRequest)).resolves.toMatchObject({ kind: expected, changeRequest });
  });

  it("distinguishes moved heads, missing requests, and ambiguous exact matches", async () => {
    await expect(createGhChangeRequestLifecyclePort(ghResult([
      pull({ headRefOid: "b".repeat(40) }),
    ])).read(configured, changeRequest)).resolves.toMatchObject({ kind: "changed-head" });
    await expect(createGhChangeRequestLifecyclePort(ghResult([])).read(configured, changeRequest))
      .resolves.toMatchObject({ kind: "missing" });
    await expect(createGhChangeRequestLifecyclePort(ghResult([pull(), pull({ number: 8 })]))
      .read(configured, changeRequest)).resolves.toMatchObject({ kind: "ambiguous" });
    let query = 0;
    const movedRef: GitExec = async () => ({
      stdout: JSON.stringify(query++ === 0 ? [] : [pull({ headRefName: "chore/renamed" })]),
      stderr: "",
    });
    await expect(createGhChangeRequestLifecyclePort(movedRef).read(configured, changeRequest))
      .resolves.toMatchObject({ kind: "changed-head" });
  });

  it("fails closed for coordinate mismatch, malformed host data, and gh failure", async () => {
    await expect(createGhChangeRequestLifecyclePort(ghResult([pull()])).read(
      { ...configured, repositoryRef: "other/repo" },
      changeRequest,
    )).resolves.toMatchObject({ kind: "ambiguous" });
    await expect(createGhChangeRequestLifecyclePort(ghResult([pull()])).read(
      { ...configured, baseRef: "release" },
      changeRequest,
    )).resolves.toMatchObject({ kind: "ambiguous" });
    await expect(createGhChangeRequestLifecyclePort(ghResult([{ state: "OPEN" }]))
      .read(configured, changeRequest)).resolves.toMatchObject({ kind: "ambiguous" });
    const failed: GitExec = async () => { throw new Error("authentication required"); };
    await expect(createGhChangeRequestLifecyclePort(failed).read(configured, changeRequest))
      .resolves.toMatchObject({ kind: "unreachable" });
  });
});

function lifecycle(kind: "merged" | "closed-unmerged" | "open"): ChangeRequestLifecycleEvidence {
  return { kind, changeRequest } as ChangeRequestLifecycleEvidence;
}

describe("transient change-request tail retirement", () => {
  const groom = TransientIdentityRecordV3Schema.parse({
    version: 3,
    kind: "groom",
    slug: "groom-alpha",
    claimId: "1".repeat(32),
    anchorStub: "alpha",
    members: ["alpha"],
    openedBaseHead: "b".repeat(40),
    protection: "full",
    branch: "chore/groom-alpha",
    state: "awaiting-merge",
    changeRequest: { ...changeRequest, headRef: "chore/groom-alpha" },
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-20T00:01:00.000Z",
  }) as TransientIdentityTailRecord;

  it("finalizes only exact merged truth and replays retirement idempotently", () => {
    const exact = lifecycle("merged");
    const evidence = { ...exact, changeRequest: groom.changeRequest } as ChangeRequestLifecycleEvidence;
    const transform = transientTailRetirementTransform({ previous: groom, action: "finalize", lifecycle: evidence });
    expect(transform(new Map([[groom.slug, groom]]))).toMatchObject({ kind: "applied", value: null });
    expect(transform(new Map())).toMatchObject({ kind: "idempotent", value: null });
    expect(transientTailRetirementTransform({
      previous: groom,
      action: "finalize",
      lifecycle: { ...evidence, kind: "open" } as ChangeRequestLifecycleEvidence,
    })(new Map([[groom.slug, groom]]))).toMatchObject({ kind: "refused" });
  });

  it("permits explicit abandonment only for exact closed-unmerged truth", () => {
    const exact = { kind: "closed-unmerged", changeRequest: groom.changeRequest } as ChangeRequestLifecycleEvidence;
    expect(transientTailRetirementTransform({ previous: groom, action: "abandon", lifecycle: exact })(
      new Map([[groom.slug, groom]]),
    )).toMatchObject({ kind: "applied" });
    expect(transientTailRetirementTransform({
      previous: groom,
      action: "abandon",
      lifecycle: { ...exact, changeRequest } as ChangeRequestLifecycleEvidence,
    })(new Map([[groom.slug, groom]]))).toMatchObject({ kind: "refused" });
  });
});
