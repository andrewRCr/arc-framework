/** Driver Git writes: a hookless scratch clone of the copy's mirror, and syncs from the mirror into the copy. */
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { ExecResult, GitExec } from "../../lib/git/exec.js";
import { isCompletedGitFailure, isGitProcessError } from "../../lib/git/process-error.js";
import { readWindowCheckouts, type WindowCheckout } from "./checkouts.js";
import { readWindowBuildFindings } from "./seals.js";
import { readWindowRefTip } from "./git.js";
import type { WindowCopyBounds } from "./copy-safety.js";

/** The copy's bounds and the driver's own folder beside its checkouts, holding the scratch clone. */
export interface WindowRehearsalLayout extends WindowCopyBounds { workspace: string; scratch: string }
/** Rebuild the primary copy's CLI when its source has moved past its build. */
export type WindowRehearsalRebuild = (primary: string) => Promise<void>;

const identity: readonly (readonly [string, string])[] = [["user.name", "ARC rehearsal"],
  ["user.email", "rehearsal@example.invalid"], ["commit.gpgsign", "false"], ["tag.gpgsign", "false"]];
/** Git configuration arguments giving a commit written in the copy the driver's identity, unsigned. */
export const rehearsalIdentityArgs: readonly string[] = identity.flatMap(([key, value]) => ["-c", `${key}=${value}`]);

/** Every write the driver makes reaches the copy through the mirror, except a plant held apart from it. */
export class WindowRehearsalSync {
  private readonly pending = new Set<string>();
  private readonly forced = new Set<string>();
  private readonly apart = new Set<string>();

  /** Bind the copy, its Git boundary, and the primary copy's rebuild. */
  constructor(readonly layout: WindowRehearsalLayout, private readonly exec: GitExec,
    private readonly rebuild: WindowRehearsalRebuild) {}

  /** Recreate the scratch clone from the mirror, with an empty hook directory and the driver's identity. */
  async open(): Promise<void> {
    const hooks = join(this.layout.workspace, "no-hooks");
    await rm(this.layout.scratch, { recursive: true, force: true });
    await mkdir(hooks, { recursive: true });
    await this.exec("git", ["clone", "--quiet", "--no-hardlinks", "--", this.layout.mirror, this.layout.scratch],
      { cwd: this.layout.workspace });
    for (const [key, value] of [["core.hooksPath", hooks], ...identity]) await this.scratch(["config", "--local", key, value]);
  }

  /** Run Git in the scratch clone. */
  scratch(args: string[]): Promise<ExecResult> { return this.exec("git", args, { cwd: this.layout.scratch }); }

  /** Run Git in one of the copy's checkouts. */
  copy(cwd: string, args: string[]): Promise<ExecResult> { return this.exec("git", args, { cwd }); }

  /** Start a scratch branch at a mirror revision, fresh from the mirror. */
  async checkout(branch: string, from = `origin/${branch}`): Promise<void> {
    await this.scratch(["fetch", "--quiet", "--prune", "origin"]);
    await this.scratch(["checkout", "--quiet", "--force", "-B", branch, from]);
  }

  /** Push a scratch revision to a mirror branch; the next sync carries it into the copy, replacing it when forced. */
  async publish(branch: string, revision: string, force = false): Promise<void> {
    await this.scratch(["push", "--quiet", ...force ? ["--force"] : [], "origin", `${revision}:refs/heads/${branch}`]);
    this.pending.add(branch);
    if (force) this.forced.add(branch);
  }

  /** Carry the copy's local branch to a mirror branch, fetching it into the scratch clone from the copy. */
  async publishLocal(branch: string, target = branch): Promise<void> {
    await this.scratch(["fetch", "--quiet", "--no-tags", "--", this.layout.repo, `+refs/heads/${branch}:refs/rehearsal/${branch}`]);
    await this.publish(target, `refs/rehearsal/${branch}`);
  }

  /** Publish the copy's local branch where it is ahead of the mirror; refuse a pair that diverged. */
  async carryLocal(branch: string): Promise<void> {
    const io = { repo: this.layout.repo, exec: this.exec };
    const [local, mirror] = await Promise.all([readWindowRefTip(io, `refs/heads/${branch}`),
      readWindowRefTip(io, `refs/remotes/origin/${branch}`)]);
    if (local === null || local === mirror) return;
    if (mirror !== null && !await this.isAncestor(mirror, local)) {
      if (await this.isAncestor(local, mirror)) return;
      throw new Error(`The copy's ${branch} and the mirror's have diverged.`);
    }
    await this.publishLocal(branch);
  }

  /** Keep a branch's local copy where a plant written in the copy left it. */
  holdApart(branch: string): void { this.apart.add(branch); this.pending.delete(branch); this.forced.delete(branch); }

  /** Push a scratch revision to a mirror branch alone, holding the copy's side of the branch apart. */
  async publishMirrorOnly(branch: string, revision: string): Promise<void> {
    await this.scratch(["push", "--quiet", "--force", "origin", `${revision}:refs/heads/${branch}`]);
    this.holdApart(branch);
  }

  /** Write a commit over a ref's tip in the copy, its tree unchanged, and hold the ref's branch apart from the mirror. */
  async plantInCopy(cwd: string, branch: string, message: string): Promise<{ previous: string; tip: string }> {
    const ref = `refs/heads/${branch}`;
    const previous = (await this.copy(cwd, ["rev-parse", "--verify", `${ref}^{commit}`])).stdout.trim();
    const tip = (await this.copy(cwd, [...rehearsalIdentityArgs, "commit-tree", `${previous}^{tree}`, "-p", previous, "-m", message])).stdout.trim();
    await this.copy(cwd, ["update-ref", ref, tip, previous]);
    this.holdApart(branch);
    return { previous, tip };
  }

  /** Move a branch held apart back to a tip in the copy alone, and let later syncs carry it again. */
  async restoreInCopy(cwd: string, branch: string, tip: string): Promise<void> {
    await this.copy(cwd, ["update-ref", `refs/heads/${branch}`, tip]);
    this.release(branch);
  }

  /** Let the next sync carry a branch held apart. */
  release(branch: string): void { this.apart.delete(branch); }

  /** Fetch the mirror into the copy, then carry each changed branch to its checkout or local copy. */
  async sync(): Promise<void> {
    await this.copy(this.layout.repo, ["fetch", "--quiet", "--prune", "origin"]);
    const checkouts = await readWindowCheckouts({ repo: this.layout.repo, exec: this.exec });
    const moved: WindowCheckout[] = [];
    for (const branch of [...this.pending].filter(branch => !this.apart.has(branch)).sort()) {
      const tip = await readWindowRefTip({ repo: this.layout.repo, exec: this.exec }, `refs/remotes/origin/${branch}`);
      if (tip === null) throw new Error(`The mirror holds no ${branch}.`);
      const holders = checkouts.filter(checkout => checkout.branch === branch);
      for (const holder of holders) if (await this.fastForward(holder, branch, tip)) moved.push(holder);
      if (holders.length === 0) await this.setLocal(branch, tip, this.forced.has(branch));
      this.pending.delete(branch); this.forced.delete(branch);
    }
    await this.settleBuilds(checkouts, moved);
  }

  /** Reset a branch on the mirror and in the copy, a checkout holding it included. */
  async reset(branch: string, tip: string): Promise<void> {
    const carrier = "refs/rehearsal/reset";
    await this.copy(this.layout.repo, ["update-ref", carrier, tip]);
    try {
      await this.scratch(["fetch", "--quiet", "--", this.layout.repo, `+${carrier}:${carrier}`]);
    } finally {
      await this.copy(this.layout.repo, ["update-ref", "-d", carrier]);
    }
    await this.scratch(["push", "--quiet", "--force", "origin", `${carrier}:refs/heads/${branch}`]);
    await this.copy(this.layout.repo, ["fetch", "--quiet", "--prune", "origin"]);
    const checkouts = await readWindowCheckouts({ repo: this.layout.repo, exec: this.exec });
    const holders = checkouts.filter(checkout => checkout.branch === branch);
    for (const holder of holders) await this.copy(holder.path, ["reset", "--quiet", "--hard", tip]);
    if (holders.length === 0) await this.copy(this.layout.repo, ["update-ref", `refs/heads/${branch}`, tip]);
    this.release(branch); this.pending.delete(branch);
    await this.settleBuilds(checkouts, holders);
  }

  private async fastForward(holder: WindowCheckout, branch: string, tip: string): Promise<boolean> {
    if (holder.head === tip) return false;
    if (!await this.isAncestor(holder.head, tip)) {
      throw new Error(`The checkout ${holder.path} holding ${branch} cannot fast-forward to the mirror's tip.`);
    }
    await this.copy(holder.path, ["merge", "--quiet", "--ff-only", tip]);
    return true;
  }

  private async setLocal(branch: string, tip: string, replace: boolean): Promise<void> {
    const local = await readWindowRefTip({ repo: this.layout.repo, exec: this.exec }, `refs/heads/${branch}`);
    if (!replace && local !== null && local !== tip && !await this.isAncestor(local, tip)) {
      throw new Error(`The copy's ${branch} holds commits the mirror's tip lacks.`);
    }
    await this.copy(this.layout.repo, ["update-ref", `refs/heads/${branch}`, tip]);
  }

  private async settleBuilds(checkouts: readonly WindowCheckout[], moved: readonly WindowCheckout[]): Promise<void> {
    for (const checkout of moved.filter(checkout => !checkout.primary)) await removeBuild(checkout.path);
    const stale = new Set((await readWindowBuildFindings(checkouts)).map(finding => finding.subject));
    for (const checkout of checkouts) {
      if (!stale.has(join(checkout.path, "packages", "arc-framework", "dist", "cli.js"))) continue;
      if (checkout.primary) await this.rebuild(checkout.path);
      else await removeBuild(checkout.path);
    }
  }

  /** Whether one commit is an ancestor of another in the copy; any failure but a completed "no" refuses. */
  async isAncestor(ancestor: string, descendant: string): Promise<boolean> {
    try {
      await this.exec("git", ["--no-replace-objects", "merge-base", "--is-ancestor", ancestor, descendant],
        { cwd: this.layout.repo, objectAccess: "local-only" });
      return true;
    } catch (error) {
      if (isGitProcessError(error) && isCompletedGitFailure(error) && error.exitCode === 1) return false;
      throw error;
    }
  }
}

async function removeBuild(checkout: string): Promise<void> {
  await rm(join(checkout, "packages", "arc-framework", "dist"), { recursive: true, force: true });
}
