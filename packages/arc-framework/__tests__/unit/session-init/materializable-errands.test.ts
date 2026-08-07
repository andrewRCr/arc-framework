/** Exact ordinary-v3 materialization projections. */

import { describe, expect, it } from "vitest";

import type { TransientIdentityRecord } from "../../../src/lib/errand/identity-record.js";
import { findMaterializableErrands } from "../../../src/lib/session-init/materializable-errands.js";

const HEAD = "a".repeat(40);

function paused(over: Record<string, unknown> = {}): TransientIdentityRecord {
  return {
    version: 3, slug: "fix-typo", claimId: "c".repeat(32),
    createdAt: "2026-07-21T00:00:00.000Z", updatedAt: "2026-07-21T00:01:00.000Z",
    kind: "errand", purpose: "errand", intent: "fix typo", branch: "chore/fix-typo",
    origin: "inbox", originEntry: "Fix typo",
    state: "paused", savedHead: HEAD, changeRequest: null, ...over,
  } as TransientIdentityRecord;
}

describe("findMaterializableErrands", () => {
  it("projects exact paused and requested-work awaiting generations", () => {
    const awaiting = paused({
      slug: "review", branch: "chore/review", state: "awaiting-merge", savedHead: null,
      changeRequest: {
        repositoryRef: "owner/repo", hostRef: "github", baseRef: "main",
        headRef: "chore/review", headSha: "b".repeat(40),
      },
    });
    const result = findMaterializableErrands({
      records: [paused(), awaiting],
      remoteTips: new Map([
        ["chore/fix-typo", HEAD],
        ["chore/review", "b".repeat(40)],
      ]),
      locallyPresentBranches: new Set(),
    });

    expect(result.candidates).toEqual([
      {
        slug: "fix-typo", claimId: "c".repeat(32), branch: "chore/fix-typo", expectedHead: HEAD,
        state: "paused", originEntry: "Fix typo",
      },
      {
        slug: "review", claimId: "c".repeat(32), branch: "chore/review", expectedHead: "b".repeat(40),
        state: "awaiting-merge", originEntry: "Fix typo",
      },
    ]);
  });

  it("excludes open, malformed awaiting, and locally present identities", () => {
    const result = findMaterializableErrands({
      records: [paused({ state: "open", savedHead: null }), paused({
        state: "awaiting-merge", savedHead: null,
        changeRequest: {
          repositoryRef: "owner/repo", hostRef: "github", baseRef: "main",
          headRef: "chore/other", headSha: HEAD,
        },
      })],
      remoteTips: new Map([["chore/fix-typo", HEAD]]),
      locallyPresentBranches: new Set(["chore/fix-typo"]),
    });

    expect(result.candidates).toEqual([]);
  });

  it("does not derive a recordless candidate and sorts projections stably by slug", () => {
    const result = findMaterializableErrands({
      records: [paused({ slug: "z", branch: "chore/z" }), paused({ slug: "a", branch: "chore/a" })],
      remoteTips: new Map([
        ["chore/z", HEAD],
        ["chore/a", HEAD],
      ]),
      locallyPresentBranches: new Set(),
    });

    expect(result.candidates.map((candidate) => candidate.slug)).toEqual(["a", "z"]);
  });

  it("excludes an identity whose expected head differs from the live remote tip", () => {
    const result = findMaterializableErrands({
      records: [paused()],
      remoteTips: new Map([["chore/fix-typo", "b".repeat(40)]]),
      locallyPresentBranches: new Set(),
    });

    expect(result.candidates).toEqual([]);
  });
});
