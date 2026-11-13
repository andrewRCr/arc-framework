/** Retain one operationally retired self checkout using its existing evidence-bound husk stamp. */
import { checkWorktreeRemoval, describeRemovalRefusal, releaseWorktreeCheckout } from "../git/worktree-removal.js";
import type { WorktreeHuskStamp } from "../git/worktree-marker.js";
import { ownerHolderRequest } from "./locus-ports.js";
import { readRemoteBranchOid } from "./rename-identity.js";
import { nodeReconcileWorkUnitWorktreeFs, reconcileUserSurfacesForRemoval } from "./mutators/reconcile-work-unit-worktree.js";
import type { StoreRetirementEvidence } from "./store-retirement-evidence.js";
import { unlockTerminalHusk } from "./terminal-husk-unlock.js";
import type { TeardownContext, TeardownResult } from "./verbs/teardown.js";

type Husk = NonNullable<Extract<TeardownResult, { status: "torn-down" }>["husk"]>;
interface Input { ctx: TeardownContext; path: string; primaryPath: string; evidence: StoreRetirementEvidence }

/** Persist and release the projection before detaching its exact marker and checkout generation. */
export async function createStoreSelfTeardownHusk(input: Input): Promise<{ husk: Husk; notice: string | null }> {
  const { ctx, path, primaryPath, evidence } = input;
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
  const released = await releaseWorktreeCheckout({ ...removal, primaryWorktreePath: primaryPath, slots: ctx.projectionRemovalSlots });
  if (released.kind !== "released") throw new Error(describeRemovalRefusal(released.check));
  await evidence.revalidate();
  await ctx.teardownWorktree.husk({ expectedSelection: selected, stamp,
    revalidateLocal: async () => {
      await evidence.revalidate();
      // The projection has been released; only the still-live Git checkout is checked again.
      const fresh = await checkWorktreeRemoval({ ...removal, disposition: "remove" });
      if (fresh.kind !== "removable") throw new Error(fresh.kind === "refused" ? describeRemovalRefusal(fresh)
        : "The checkout disappeared after projection release; retry from the primary.");
    },
    detachProjection: async () => { await ctx.exec("git", ["switch", "--detach", stamp.sha], { cwd: path }); },
  });
  return { husk: { worktreePath: path, subject, branch, stamped: true, outcome: "created" },
    notice: await unlockTerminalHusk(ctx, path, stamp) };
}

async function observedRemoteProof(ctx: TeardownContext, branch: string): Promise<WorktreeHuskStamp["remoteRef"]> {
  const remotes = await ctx.exec("git", ["remote"]);
  if (!remotes.stdout.split(/\s+/u).includes("origin")) return null;
  const oid = await readRemoteBranchOid(ctx.exec, "origin", branch);
  // The snapshot grants no remote deletion; current store/ref-set checks decide that separately.
  return oid === null ? null : { remote: "origin", oid, disposition: "retain" };
}
