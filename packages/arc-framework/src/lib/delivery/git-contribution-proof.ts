/** Byte-preserving Git acquisition for delivery contribution identity. */

import type { RawGitExec } from "../change-facts.js";
import {
  compareDeliveryContribution,
  encodeDeliveryContributionPatch,
  type DeliveryContributionCoordinate,
  type DeliveryContributionEndpoints,
  type DeliveryContributionProofResult,
} from "./contribution-proof.js";

const decoder = new TextDecoder("utf-8", { fatal: true });
const objectId = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;

function text(bytes: Uint8Array): string | null {
  try {
    return decoder.decode(bytes).trim();
  } catch {
    return null;
  }
}

async function verifyCoordinate(exec: RawGitExec, coordinate: DeliveryContributionCoordinate): Promise<boolean> {
  try {
    const [head, tree] = await Promise.all([
      exec(["rev-parse", "--verify", `${coordinate.head}^{commit}`], { objectAccess: "local-only" }),
      exec(["rev-parse", `${coordinate.head}^{tree}`], { objectAccess: "local-only" }),
    ]);
    return text(head.stdout) === coordinate.head && text(tree.stdout) === coordinate.tree;
  } catch {
    return false;
  }
}

async function isLinearRange(exec: RawGitExec, predecessor: string, member: string): Promise<boolean> {
  try {
    await exec(["merge-base", "--is-ancestor", predecessor, member], { objectAccess: "local-only" });
    const result = await exec(["rev-list", "--parents", `${predecessor}..${member}`], {
      objectAccess: "local-only",
    });
    const lines = text(result.stdout)?.split("\n").filter(Boolean) ?? [];
    return lines.length > 0 && lines.every((line) => {
      const fields = line.split(" ");
      return fields.length === 2 && fields.every((field) => objectId.test(field));
    });
  } catch {
    return false;
  }
}

/** Acquire and compare exact aggregate patches for four already-pinned Git endpoints. */
export async function proveGitDeliveryContribution(input: DeliveryContributionEndpoints & {
  readonly exec: RawGitExec;
}): Promise<DeliveryContributionProofResult> {
  const coordinates = [
    input.before.predecessor, input.before.member, input.after.predecessor, input.after.member,
  ];
  if (!(await Promise.all(coordinates.map(async (coordinate) => verifyCoordinate(input.exec, coordinate))))
    .every(Boolean)) return { status: "refused", reason: "patch-evidence-invalid" };
  if (input.before.member.tree === input.after.member.tree) {
    return compareDeliveryContribution(input);
  }
  const [beforeLinear, afterLinear] = await Promise.all([
    isLinearRange(input.exec, input.before.predecessor.head, input.before.member.head),
    isLinearRange(input.exec, input.after.predecessor.head, input.after.member.head),
  ]);
  if (!beforeLinear || !afterLinear) return { status: "refused", reason: "patch-evidence-invalid" };
  try {
    const formatResult = await input.exec(["rev-parse", "--show-object-format"]);
    const objectFormat = text(formatResult.stdout);
    if (objectFormat !== "sha1" && objectFormat !== "sha256") {
      return { status: "refused", reason: "patch-evidence-invalid" };
    }
    const args = (predecessor: string, member: string) => [
      "diff", "--binary", "--full-index", "--no-renames", "--no-ext-diff",
      "--src-prefix=a/", "--dst-prefix=b/", predecessor, member,
    ];
    const [beforePatch, afterPatch] = await Promise.all([
      input.exec(args(input.before.predecessor.head, input.before.member.head), { objectAccess: "local-only" }),
      input.exec(args(input.after.predecessor.head, input.after.member.head), { objectAccess: "local-only" }),
    ]);
    return compareDeliveryContribution({
      ...input,
      beforePatch: encodeDeliveryContributionPatch(objectFormat, beforePatch.stdout),
      afterPatch: encodeDeliveryContributionPatch(objectFormat, afterPatch.stdout),
    });
  } catch {
    return { status: "refused", reason: "patch-evidence-invalid" };
  }
}
