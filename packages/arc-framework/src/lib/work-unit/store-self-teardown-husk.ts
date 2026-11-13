/** Retain one operationally retired self checkout using its existing evidence-bound husk stamp. */
import { checkWorktreeRemoval, describeRemovalRefusal, releaseWorktreeCheckout } from "../git/worktree-removal.js";
import type { WorktreeHuskStamp } from "../git/worktree-marker.js";
import { readWorktreeMarker } from "../git/worktree-marker.js";
import { scanRegisteredWorktrees } from "../git/worktree-roster.js";
import { isDeepStrictEqual } from "node:util";
import { resolve } from "node:path";
import { withWorktreeOperationLock } from "./worktree-operation-lock.js";
import { ownerHolderRequest } from "./locus-ports.js";
import { readRemoteBranchOid } from "./rename-identity.js";
import { nodeReconcileWorkUnitWorktreeFs, reconcileUserSurfacesForRemoval } from "./mutators/reconcile-work-unit-worktree.js";
import type { StoreRetirementEvidence } from "./store-retirement-evidence.js";
import { nativeHuskOwnerMatches } from "./store-retirement-husk.js";
import type { TeardownContext, TeardownResult } from "./verbs/teardown.js";

type Husk = NonNullable<Extract<TeardownResult, { status: "torn-down" }>["husk"]>;
interface Input { ctx: TeardownContext; path: string; primaryPath: string; evidence: StoreRetirementEvidence }

/** Persist with the claim intact, then stamp and detach its exact marker and checkout generation. */
export async function createStoreSelfTeardownHusk(input: Input): Promise<{ husk: Husk; stamp: WorktreeHuskStamp }> {
  const { ctx, path, evidence } = input;
  if (ctx.readTeardownSelection === undefined || ctx.teardownWorktree?.husk === undefined) {
    throw new Error("Self-teardown requires its exact marker/topology transaction; repair that boundary and retry teardown.");
  }
  const subject = { kind: "work-unit" as const, name: evidence.name, uid: ownerHolderRequest(evidence.record).uid };
  const selected = await ctx.readTeardownSelection({ checkoutPath: path, subject });
  if (selected.kind !== "clear") throw new Error(selected.message);
  const branch = selected.checkout.branch;
  if (selected.checkout.primary || selected.checkout.detached || branch === null) {
    throw new Error("Self-teardown requires the selected branched linked checkout; inspect its registration and retry.");
  }
  const fs = ctx.worktreeFs ?? nodeReconcileWorkUnitWorktreeFs;
  const removal = { exec: ctx.exec, checkoutPath: path, folderExists: (target: string) => fs.directoryExists(target) };
  const check = await checkWorktreeRemoval({ ...removal, disposition: "remove", check: ctx.projectionRemovalSlots?.check });
  if (check.kind === "refused") throw new Error(describeRemovalRefusal(check));
  if (check.kind === "missing") throw new Error("The self checkout is missing; inspect its registration and retry from the primary.");
  const stamp: WorktreeHuskStamp = {
    sha: selected.checkout.head, at: new Date((ctx.now ?? Date.now)()).toISOString(), subject, branch,
    authorization: evidence.rule === "discard" ? "discard-confirmed" : "merged-preserved",
    evidence: evidence.evidence, remoteRef: await observedRemoteProof(ctx, branch),
  };
  await reconcileUserSurfacesForRemoval({ exec: ctx.exec, chdir: ctx.chdir, fs }, path);
  const persisted = await ctx.projectionRemovalSlots?.persist(path);
  if (persisted?.kind === "refused") throw new Error(persisted.remedy.text);
  await evidence.revalidate();
  await ctx.teardownWorktree.husk({ expectedSelection: selected, stamp,
    revalidateLocal: async () => {
      await evidence.revalidate();
      const fresh = await checkWorktreeRemoval({ ...removal, disposition: "remove", check: ctx.projectionRemovalSlots?.check });
      if (fresh.kind !== "removable") throw new Error(fresh.kind === "refused" ? describeRemovalRefusal(fresh)
        : "The checkout disappeared before terminal detach; retry from the primary.");
    },
    detachProjection: async () => { await ctx.exec("git", ["switch", "--detach", stamp.sha], { cwd: path }); },
  });
  return { husk: { worktreePath: path, subject, branch, stamped: true, outcome: "created" }, stamp };
}

/** Finish a repeatable projection release only while the exact terminal checkout is protected. */
export async function releaseStoreTerminalHusk(input: Input & {
  stamp: WorktreeHuskStamp; revalidateSelection?: () => Promise<void>;
}): Promise<void> {
  const { ctx, path, primaryPath, evidence, stamp } = input;
  if (ctx.projectionRemovalSlots === undefined) return;
  const expected = await (ctx.readMarker ?? readWorktreeMarker)(path);
  const revalidate = async (): Promise<void> => {
    await evidence.revalidate();
    await input.revalidateSelection?.();
    const marker = await (ctx.readMarker ?? readWorktreeMarker)(path);
    const scan = await (ctx.scanWorktrees ?? scanRegisteredWorktrees)(ctx.exec);
    if (!scan.ok) throw new Error(scan.message);
    const matches = scan.worktrees.filter(row => resolve(row.path) === resolve(path)), row = matches[0];
    if (!isDeepStrictEqual(marker, expected) || marker.kind !== "present" || !nativeHuskOwnerMatches(marker.marker, evidence)
      || !isDeepStrictEqual(marker.marker.husk, stamp) || matches.length !== 1 || row?.primary !== false
      || !row.detached || row.branch !== null || row.head !== stamp.sha) {
      throw new Error("The terminal husk generation changed before projection release; inspect it and retry its exact teardown.");
    }
  };
  const release = async (): Promise<void> => {
    const result = await releaseWorktreeCheckout({ exec: ctx.exec, checkoutPath: path,
      primaryWorktreePath: primaryPath, slots: ctx.projectionRemovalSlots });
    if (result.kind !== "released") throw new Error(describeRemovalRefusal(result.check));
  };
  await revalidate();
  if (ctx.readTeardownSelection !== undefined && ctx.teardownWorktree !== undefined) {
    const selected = await ctx.readTeardownSelection({ checkoutPath: path, subject: stamp.subject });
    if (selected.kind !== "clear") throw new Error(selected.message);
    await ctx.teardownWorktree.retire({ expectedSelection: selected, revalidateLocal: revalidate, retireProjection: release });
  } else {
    await withWorktreeOperationLock({ exec: ctx.exec, cwd: primaryPath,
      operation: async () => { await revalidate(); await release(); } });
  }
}

async function observedRemoteProof(ctx: TeardownContext, branch: string): Promise<WorktreeHuskStamp["remoteRef"]> {
  const remotes = await ctx.exec("git", ["remote"]);
  if (!remotes.stdout.split(/\s+/u).includes("origin")) return null;
  const oid = await readRemoteBranchOid(ctx.exec, "origin", branch);
  // The snapshot grants no remote deletion; current store/ref-set checks decide that separately.
  return oid === null ? null : { remote: "origin", oid, disposition: "retain" };
}
