/** First-parent branch inspection for retrofit delivery authoring. */

import {
  affectedPaths,
  resolveChangeSet,
  type ChangeSet,
  type RawGitExec,
} from "../change-facts.js";

/** One exact first-parent transition and its contribution classification. */
export interface DeliveryBranchStep {
  readonly commit: string;
  readonly predecessor: string;
  readonly parents: readonly string[];
  readonly classification: "contribution" | "ambient-base-absorb";
  readonly changeSet: ChangeSet;
  readonly cumulativePaths: readonly string[];
}

/** Complete pinned branch facts used by retrofit authoring. */
export interface InspectedDeliveryBranch {
  readonly status: "inspected";
  readonly base: string;
  readonly head: string;
  readonly originalDivergence: { readonly predecessor: string; readonly commit: string };
  readonly steps: readonly DeliveryBranchStep[];
  readonly contributionStepIds: readonly string[];
}

/** Typed refusal from branch graph or change-fact inspection. */
export type InspectDeliveryBranchRefusal = {
  readonly status: "refused";
  readonly reason:
    | "git-coordinate-unresolved"
    | "base-not-ancestor"
    | "divergence-boundary-missing"
    | "divergence-boundary-ambiguous"
    | "first-parent-history-malformed"
    | "ambient-purity-unproven"
    | "change-facts-unknown";
};

/** Inspect one selected base line and branch head. */
export async function inspectDeliveryBranch(input: {
  readonly exec: RawGitExec;
  readonly base: string;
  readonly head: string;
}): Promise<InspectedDeliveryBranch | InspectDeliveryBranchRefusal> {
  let base: string;
  let head: string;
  let baseReachable: Set<string>;
  let headReachable: Set<string>;
  let firstParent: string[];
  try {
    [base, head] = await Promise.all([
      gitLine(input.exec, ["rev-parse", "--verify", `${input.base}^{commit}`]),
      gitLine(input.exec, ["rev-parse", "--verify", `${input.head}^{commit}`]),
    ]);
    [baseReachable, headReachable, firstParent] = await Promise.all([
      gitLines(input.exec, ["rev-list", base]).then((lines) => new Set(lines)),
      gitLines(input.exec, ["rev-list", head]).then((lines) => new Set(lines)),
      gitLines(input.exec, ["rev-list", "--first-parent", head]),
    ]);
  } catch {
    return { status: "refused", reason: "git-coordinate-unresolved" };
  }
  if (!headReachable.has(base)) return { status: "refused", reason: "base-not-ancestor" };

  const candidates = firstParent.flatMap((commit, index) => {
    const predecessor = firstParent[index + 1];
    return !baseReachable.has(commit) && predecessor !== undefined && baseReachable.has(predecessor)
      ? [{ index, commit, predecessor }]
      : [];
  });
  if (candidates.length === 0) {
    return { status: "refused", reason: "divergence-boundary-missing" };
  }
  if (candidates.length > 1) {
    return { status: "refused", reason: "divergence-boundary-ambiguous" };
  }
  const boundary = candidates[0];
  if (boundary === undefined) return { status: "refused", reason: "divergence-boundary-missing" };
  const commits = firstParent.slice(0, boundary.index + 1).reverse();
  const cumulative = new Set<string>();
  const steps: DeliveryBranchStep[] = [];

  for (const commit of commits) {
    let parents: string[];
    try {
      const record = await gitLines(input.exec, ["rev-list", "--parents", "-n", "1", commit]);
      const fields = record[0]?.split(" ") ?? [];
      if (fields[0] !== commit) {
        return { status: "refused", reason: "first-parent-history-malformed" };
      }
      parents = fields.slice(1);
    } catch {
      return { status: "refused", reason: "first-parent-history-malformed" };
    }
    const predecessor = parents[0];
    if (predecessor === undefined) {
      return { status: "refused", reason: "first-parent-history-malformed" };
    }
    const changeSet = await resolveChangeSet(input.exec, predecessor, commit);
    if (changeSet.changeSet === "unknown") {
      return { status: "refused", reason: "change-facts-unknown" };
    }
    const classification = await classifyStep(input.exec, commit, parents, baseReachable);
    if (classification === null) {
      return { status: "refused", reason: "ambient-purity-unproven" };
    }
    if (classification === "contribution") {
      for (const path of affectedPaths(changeSet.changes)) cumulative.add(path);
    }
    steps.push({
      commit,
      predecessor,
      parents,
      classification,
      changeSet,
      cumulativePaths: sortCanonicalBytes(cumulative),
    });
  }
  if (steps[0]?.predecessor !== boundary.predecessor) {
    return { status: "refused", reason: "first-parent-history-malformed" };
  }
  return {
    status: "inspected",
    base,
    head,
    originalDivergence: { predecessor: boundary.predecessor, commit: boundary.commit },
    steps,
    contributionStepIds: steps
      .filter((step) => step.classification === "contribution")
      .map((step) => step.commit),
  };
}

async function classifyStep(
  exec: RawGitExec,
  commit: string,
  parents: readonly string[],
  baseReachable: ReadonlySet<string>,
): Promise<DeliveryBranchStep["classification"] | null> {
  if (parents.length === 1) return "contribution";
  if (parents.length !== 2) return null;
  const secondParent = parents[1];
  if (secondParent === undefined || !baseReachable.has(secondParent)) return "contribution";
  try {
    const [expectedTreeOutput, actualTree] = await Promise.all([
      gitLines(exec, ["merge-tree", "--write-tree", parents[0] ?? "", secondParent]),
      gitLine(exec, ["rev-parse", `${commit}^{tree}`]),
    ]);
    const expectedTree = expectedTreeOutput.find((line) => /^[0-9a-f]{40,64}$/u.test(line));
    return expectedTree === actualTree ? "ambient-base-absorb" : null;
  } catch {
    return null;
  }
}

async function gitLine(exec: RawGitExec, args: string[]): Promise<string> {
  const lines = await gitLines(exec, args);
  if (lines.length !== 1 || lines[0] === undefined) throw new Error("unexpected Git output");
  return lines[0];
}

async function gitLines(exec: RawGitExec, args: string[]): Promise<string[]> {
  const { stdout } = await exec(args);
  return new TextDecoder("utf-8", { fatal: true }).decode(stdout).trim().split(/\r?\n/u).filter(Boolean);
}

function sortCanonicalBytes(values: Iterable<string>): string[] {
  return [...values].sort((left, right) => Buffer.from(left).compare(Buffer.from(right)));
}
