/** Exact Git coordinates attributable to one provider-reported delivery landing. */

import type { GitExec } from "../git/exec.js";
import { observeDeliveryEligibilityRef } from "./git-eligibility.js";
import type { DeliveryMemberCoordinatesV1, DeliveryTargetCoordinatesV1 } from "./schema.js";

export interface DeliveryLandingResultCoordinates {
  readonly predecessor: DeliveryTargetCoordinatesV1;
  readonly member: DeliveryTargetCoordinatesV1;
}

function objectIds(stdout: string): string[] | null {
  const fields = stdout.trim().split(/\s+/u);
  return fields.length > 0 && fields.every((field) => /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(field))
    ? fields
    : null;
}

/** Materialize an exact merge result and derive its strategy-specific landing predecessor. */
export async function observeGitDeliveryLandingResult(input: {
  readonly exec: GitExec;
  readonly cwd: string;
  readonly remote: string;
  readonly resultHead: string;
  readonly strategy: "merge" | "rebase" | "squash";
  readonly beforeMember: DeliveryMemberCoordinatesV1;
}): Promise<DeliveryLandingResultCoordinates | null> {
  try {
    await input.exec("git", ["fetch", "--no-write-fetch-head", input.remote, input.resultHead], {
      cwd: input.cwd,
    });
  } catch {
    return null;
  }
  const localOnlyExec: GitExec = (command, args, options) => input.exec(command, args, {
    ...options,
    cwd: input.cwd,
    objectAccess: "local-only",
  });
  const member = await observeDeliveryEligibilityRef(localOnlyExec, input.resultHead);
  if (member === null || member.head !== input.resultHead) return null;

  let predecessorHead: string;
  try {
    if (input.strategy === "rebase") {
      const countResult = await localOnlyExec("git", [
        "rev-list", "--count", `${input.beforeMember.base}..${input.beforeMember.head}`,
      ]);
      const count = Number.parseInt(countResult.stdout.trim(), 10);
      if (!Number.isSafeInteger(count) || count <= 0) return null;
      const predecessor = await localOnlyExec("git", [
        "rev-parse", "--verify", `${input.resultHead}~${count}^{commit}`,
      ]);
      predecessorHead = predecessor.stdout.trim();
    } else {
      const parentResult = await localOnlyExec("git", ["rev-list", "--parents", "-n", "1", input.resultHead]);
      const parents = objectIds(parentResult.stdout);
      if (parents === null || parents[0] !== input.resultHead) return null;
      if (input.strategy === "merge") {
        if (parents.length !== 3 || parents[2] !== input.beforeMember.head) return null;
      } else if (parents.length !== 2) return null;
      const firstParent = parents[1];
      if (firstParent === undefined) return null;
      predecessorHead = firstParent;
    }
  } catch {
    return null;
  }
  const predecessor = await observeDeliveryEligibilityRef(localOnlyExec, predecessorHead);
  return predecessor === null || predecessor.head !== predecessorHead
    ? null
    : { predecessor, member };
}
