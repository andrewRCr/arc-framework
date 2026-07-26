import { describe, expect, it, vi } from "vitest";

import {
  resolveLocalReviewAuthority,
} from "../../../../../../src/scripts/review-gate/hosts/local/review-authority.js";

describe("local review actor authority", () => {
  it("uses the canonical work-unit owner and requires the active identity to match", async () => {
    const readLiveContext = vi.fn(async () => ({
      activeIdentity: "andrew",
      workUnit: { identity: "review-surface-binding", owner: "andrew" },
      errand: null,
    }));
    const resolveRuntimeBinding = vi.fn(async () => ({
      kind: "arc-cli",
      identity: "arc-cli/0.1.0",
    }));

    await expect(resolveLocalReviewAuthority(
      { evaluatorIdentity: "fresh-reviewer" },
      { readLiveContext, resolveRuntimeBinding },
    )).resolves.toEqual({
      vehicle: { kind: "work-unit", identity: "review-surface-binding" },
      authorIdentity: "andrew",
      evaluatorIdentity: "fresh-reviewer",
      attestationRuntimeKind: "arc-cli",
      runtimeIdentity: "arc-cli/0.1.0",
      attestationMechanism: "local-attestation",
    });
    expect(readLiveContext).toHaveBeenCalledOnce();
    expect(resolveRuntimeBinding).toHaveBeenCalledOnce();

    readLiveContext.mockResolvedValueOnce({
      activeIdentity: "different-owner",
      workUnit: { identity: "review-surface-binding", owner: "andrew" },
      errand: null,
    });
    await expect(resolveLocalReviewAuthority(
      { evaluatorIdentity: "fresh-reviewer" },
      { readLiveContext, resolveRuntimeBinding },
    )).rejects.toThrow(/active-identity-owner-mismatch/u);
  });

  it("uses the active ARC identity as an Errand author", async () => {
    await expect(resolveLocalReviewAuthority(
      { evaluatorIdentity: "fresh-reviewer" },
      {
        readLiveContext: async () => ({
          activeIdentity: "andrew",
          workUnit: null,
          errand: { identity: "repair-review-state" },
        }),
        resolveRuntimeBinding: async () => ({
          kind: "arc-cli",
          identity: "arc-cli/0.1.0",
        }),
      },
    )).resolves.toMatchObject({
      vehicle: { kind: "errand", identity: "repair-review-state" },
      authorIdentity: "andrew",
    });
  });

  it("rejects self-review and derives runtime identity only from the installed binding", async () => {
    const resolveRuntimeBinding = vi.fn(async () => ({
      kind: "arc-cli",
      identity: "arc-cli/0.1.0",
    }));
    const dependencies = {
      readLiveContext: async () => ({
        activeIdentity: "andrew",
        workUnit: { identity: "review-surface-binding", owner: "andrew" },
        errand: null,
      }),
      resolveRuntimeBinding,
    };

    await expect(resolveLocalReviewAuthority(
      { evaluatorIdentity: "andrew" },
      dependencies,
    )).rejects.toThrow(/author-evaluator-must-differ/u);
    expect(resolveRuntimeBinding).not.toHaveBeenCalled();
    expect(Object.keys({ evaluatorIdentity: "fresh-reviewer" })).toEqual(["evaluatorIdentity"]);
  });
});
