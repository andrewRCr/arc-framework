/** Recovery guidance for a verified fix submitted before it was committed. */

import { describe, expect, it } from "vitest";

import { LocalTargetDerivationError } from "../../../../../src/scripts/review-gate/hosts/local/repository-target.js";
import {
  RespondCommandError,
  UnchangedVerifiedFixTargetError,
} from "../../../../../src/scripts/review-gate/runtime/respond-command.js";
import { uncommittedVerifiedFixRemedy } from "../../../../../src/scripts/review-gate/runtime/respond-remedy.js";

const verifiedFixRequest = {
  schemaVersion: 1,
  source: { kind: "attested-local", operationId: "local-operation" },
  verifiedFix: { applicability: "focused", verificationEvidenceRefs: ["verification://focused-fix"] },
};

describe("uncommittedVerifiedFixRemedy", () => {
  it("names commit-then-replay and carries the exact request for a dirty verified-fix submission", () => {
    expect(uncommittedVerifiedFixRemedy(new LocalTargetDerivationError("dirty-worktree"), verifiedFixRequest))
      .toEqual({
        invariant: expect.stringContaining("clean committed head"),
        text: expect.stringMatching(/Commit the fix .* then replay the response .*`arc review respond -`\.$/u),
        argv: ["arc", "review", "respond", "-"],
        stdin: verifiedFixRequest,
      });
  });

  it("asks for the approved fix to be applied first when the exact target never changed", () => {
    const remedy = uncommittedVerifiedFixRemedy(new UnchangedVerifiedFixTargetError(), verifiedFixRequest);

    expect(remedy).toMatchObject({
      text: expect.stringMatching(/^A verified fix .* Apply the approved fix if it is not in place, commit it /u),
      argv: ["arc", "review", "respond", "-"],
      stdin: verifiedFixRequest,
    });
    expect(uncommittedVerifiedFixRemedy(new LocalTargetDerivationError("dirty-worktree"), verifiedFixRequest)?.text)
      .not.toContain("Apply the approved fix");
  });

  it.each([
    ["a dirty worktree", new LocalTargetDerivationError("dirty-worktree")],
    ["an unchanged target", new UnchangedVerifiedFixTargetError()],
  ])("drops the spent supersession from the replay after %s", (_label, error) => {
    const supersedingRequest = {
      ...verifiedFixRequest,
      supersedes: { predecessorDispositionSetId: `sha256:${"a".repeat(64)}`, expectedFixPaths: ["src/fix.ts"] },
    };

    expect(uncommittedVerifiedFixRemedy(error, supersedingRequest)?.stdin).toEqual(verifiedFixRequest);
    expect(supersedingRequest).toHaveProperty("supersedes");
  });

  it("names nothing for a dirty worktree when the request carries no verified fix", () => {
    const withoutFix = { schemaVersion: verifiedFixRequest.schemaVersion, source: verifiedFixRequest.source };

    expect(uncommittedVerifiedFixRemedy(new LocalTargetDerivationError("dirty-worktree"), withoutFix))
      .toBeUndefined();
  });

  it.each(["non-commit-head", "unresolved-base", "ambiguous-merge-base"] as const)(
    "names nothing for a verified fix refused on %s",
    (reason) => {
      expect(uncommittedVerifiedFixRemedy(new LocalTargetDerivationError(reason), verifiedFixRequest))
        .toBeUndefined();
    },
  );

  it("names nothing for a failure that is neither refusal, whatever its message", () => {
    expect(uncommittedVerifiedFixRemedy(new Error("dirty-worktree"), verifiedFixRequest)).toBeUndefined();
    expect(uncommittedVerifiedFixRemedy(
      new RespondCommandError("invalid-input", "a verified fix requires its exact approved response record"),
      verifiedFixRequest,
    )).toBeUndefined();
  });
});
