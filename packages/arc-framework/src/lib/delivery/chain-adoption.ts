/** Append-only ancestry adoption for the originating delivery branch. */

import type { RawGitExec } from "../change-facts.js";
import type { DeliveryChainContainmentInput, DeliveryChainContainmentResult } from "./chain-containment.js";
import { classifyGitDeliveryChainContainment } from "./chain-containment.js";

const decoder = new TextDecoder("utf-8", { fatal: true });
const objectId = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;

function text(bytes: Uint8Array): string | null {
  try {
    return decoder.decode(bytes).trim();
  } catch {
    return null;
  }
}

async function observeCommit(exec: RawGitExec, ref: string): Promise<string | null> {
  try {
    const value = text((await exec(
      ["rev-parse", "--verify", `${ref}^{commit}`],
      { objectAccess: "local-only" },
    )).stdout);
    return value !== null && objectId.test(value) ? value : null;
  } catch {
    return null;
  }
}

async function isExactAdoption(input: DeliveryChainAdoptionInput, head: string): Promise<boolean> {
  try {
    const [treeResult, parentsResult] = await Promise.all([
      input.exec(["rev-parse", `${head}^{tree}`], { objectAccess: "local-only" }),
      input.exec(["rev-list", "--parents", "-n", "1", head], { objectAccess: "local-only" }),
    ]);
    const parents = text(parentsResult.stdout)?.split(" ");
    return text(treeResult.stdout) === input.top.tree
      && parents?.length === 3
      && parents[0] === head
      && parents[1] === input.top.head
      && parents[2] === input.highestMember.head;
  } catch {
    return false;
  }
}

async function classifySameHighestAdoption(
  input: DeliveryChainAdoptionInput,
  head: string,
): Promise<"same-highest" | "different" | "unavailable"> {
  try {
    const parents = text((await input.exec(
      ["rev-list", "--parents", "-n", "1", head],
      { objectAccess: "local-only" },
    )).stdout)?.split(" ");
    if (parents === undefined || parents[0] !== head || !parents.every((parent) => objectId.test(parent))) {
      return "unavailable";
    }
    return parents.length === 3 && parents[2] === input.highestMember.head
      ? "same-highest"
      : "different";
  } catch {
    return "unavailable";
  }
}

/** Exact originating ref and containment coordinates for one adoption attempt. */
export interface DeliveryChainAdoptionInput extends DeliveryChainContainmentInput {
  readonly exec: RawGitExec;
  readonly topRef: string;
}

/** Closed adoption result with the new top coordinate on success. */
export type DeliveryChainAdoptionResult =
  | { readonly status: "adopted"; readonly head: string; readonly tree: string }
  | DeliveryChainContainmentResult
  | {
      readonly status: "refused";
      readonly reason: "top-ref-invalid" | "top-moved" | "adoption-unavailable";
    };

/** Adopt one contained member beneath the stable originating branch. */
export async function adoptGitDeliveryChain(
  input: DeliveryChainAdoptionInput,
): Promise<DeliveryChainAdoptionResult> {
  if (!input.topRef.startsWith("refs/heads/") || input.topRef.startsWith("refs/heads/delivery/")
    || /[\0\r\n]/u.test(input.topRef)) {
    return { status: "refused", reason: "top-ref-invalid" };
  }
  const containment = await classifyGitDeliveryChainContainment(input);
  if (containment.status !== "contained") return containment;
  const current = await observeCommit(input.exec, input.topRef);
  if (current === null) return { status: "refused", reason: "adoption-unavailable" };
  if (current !== input.top.head) {
    return await isExactAdoption(input, current)
      ? { status: "adopted", head: current, tree: input.top.tree }
      : { status: "refused", reason: "top-moved" };
  }
  const currentAdoption = await classifySameHighestAdoption(input, current);
  if (currentAdoption === "unavailable") {
    return { status: "refused", reason: "adoption-unavailable" };
  }
  if (currentAdoption === "same-highest") {
    return { status: "adopted", head: current, tree: input.top.tree };
  }
  let commit: string | null;
  try {
    commit = text((await input.exec([
      "commit-tree", input.top.tree,
      "-p", input.top.head,
      "-p", input.highestMember.head,
      "-m", "Adopt delivery member ancestry",
    ], { objectAccess: "local-only" })).stdout);
  } catch {
    return { status: "refused", reason: "adoption-unavailable" };
  }
  if (commit === null || !objectId.test(commit)) {
    return { status: "refused", reason: "adoption-unavailable" };
  }
  try {
    await input.exec(["update-ref", input.topRef, commit, input.top.head], { objectAccess: "local-only" });
  } catch {
    const raced = await observeCommit(input.exec, input.topRef);
    return raced !== null && await isExactAdoption(input, raced)
      ? { status: "adopted", head: raced, tree: input.top.tree }
      : { status: "refused", reason: "top-moved" };
  }
  return await observeCommit(input.exec, input.topRef) === commit
    ? { status: "adopted", head: commit, tree: input.top.tree }
    : { status: "refused", reason: "adoption-unavailable" };
}
