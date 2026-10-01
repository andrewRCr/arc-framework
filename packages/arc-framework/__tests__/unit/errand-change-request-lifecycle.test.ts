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
import { resolveChangeRequestLifecycleConfiguration } from "../../src/lib/errand/change-request-lifecycle.js";
import type { GitExec } from "../../src/lib/git/exec.js";
import { scriptGitExec } from "../helpers/git-exec-fake.js";

function parseTransientIdentityTailRecord(value: unknown): TransientIdentityTailRecord {
  const parsed = TransientIdentityRecordV3Schema.parse(value);
  if (parsed.state !== "awaiting-merge") throw new Error("expected a change-request tail record");
  return parsed;
}

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

describe("change-request lifecycle configuration", () => {
  it.each([
    ["ssh://git@git.example.com:2222/owner/repo.git", "git.example.com"],
    ["https://git.example.com:8443/owner/repo.git", "git.example.com"],
    ["git@github.com:owner/repo.git", "github.com"],
  ])("normalizes the repository host from %s", async (url, hostRef) => {
    const exec: GitExec = async () => ({ stdout: url, stderr: "" });

    await expect(resolveChangeRequestLifecycleConfiguration(exec, "main")).resolves.toEqual({
      repositoryRef: "owner/repo",
      hostRef,
      baseRef: "main",
    });
  });
});

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
    const { exec } = scriptGitExec([
      { command: "gh", match: { predicate: (args) => args[0] === "pr" && args.includes("--head") },
        responses: [{ stdout: "[]", stderr: "" }] },
      { command: "gh", match: { predicate: (args) => args[0] === "pr" && args.includes("--search") },
        responses: [{ stdout: JSON.stringify([pull({ headRefName: "chore/renamed" })]), stderr: "" }] },
    ]);
    await expect(createGhChangeRequestLifecyclePort(exec).read(configured, changeRequest))
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
    await expect(createGhChangeRequestLifecyclePort(ghResult([
      pull({ state: "MERGED", headRefOid: "b".repeat(40) }),
    ])).read(configured, changeRequest)).resolves.toMatchObject({ kind: "ambiguous" });
    const failed: GitExec = async () => { throw new Error("authentication required"); };
    await expect(createGhChangeRequestLifecyclePort(failed).read(configured, changeRequest))
      .resolves.toMatchObject({ kind: "unreachable" });
  });
});

describe("transient change-request tail retirement", () => {
  const groom = parseTransientIdentityTailRecord({
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
  });

  it("finalizes only exact merged truth and replays retirement idempotently", () => {
    const evidence = { kind: "merged", changeRequest: groom.changeRequest } as ChangeRequestLifecycleEvidence;
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
