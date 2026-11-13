/** A real work-unit branch used as the flip, admitted before its deletion commit. */
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { windowFixture } from "./fixture.js";
import { checkFixture } from "./check.js";
import { writeWorktreeMarker } from "../../../src/lib/git/worktree-marker.js";
import { saveImportPersonal } from "../store/import-fixture.js";
import { invokeStoreRemote } from "../store/remote-command.js";

/** Check and import a flip with all, no checkout, or only fetched/host coordinates. */
export async function lastReadFixture(mode: "checkout" | "no-checkout" | "no-local" = "checkout") {
  const source = await windowFixture(), branch = "feat/alpha";
  const head = (await source.git("git", ["rev-parse", branch])).stdout.trim();
  const request = { number: 7, headBranch: branch, baseBranch: "main" };
  const h = { ...source, flip: { branch, head, pullRequest: 7 },
    pullRequests: { open: [request], flip: { ...request, autoMergeArmed: false } } };
  await writeFile(h.listingPath, JSON.stringify(h.pullRequests));
  const checkout = mode === "checkout" ? join(h.root, ".arc-fixture/flip-checkout") : null;
  if (checkout) {
    await h.git("git", ["worktree", "add", checkout, branch]); await h.git("git", ["worktree", "lock", checkout]);
    await writeWorktreeMarker(checkout, { spawnedByArc: true, spawningIdentity: "andrew", createdAt: "2026-01-01T00:00:00.000Z",
      createdFor: { kind: "work-unit", name: "alpha" } });
  }
  if (mode === "no-local") await h.git("git", ["branch", "-D", branch]);
  const checked = await checkFixture(h);
  if (checked.exit !== 0) throw new Error(checked.report);
  await saveImportPersonal(h.root, false);
  const published = await invokeStoreRemote(["origin", "push"], { cwd: h.root });
  if (published.result.status !== "ok") throw new Error(JSON.stringify(published));
  const imported = await h.migrate();
  if (imported.status !== "ok") throw new Error(JSON.stringify(imported));
  return { ...h, checkout, mode };
}

/** Produce and optionally publish one real deletion commit without changing the admitted checkout inventory. */
export async function deleteWindowFile(h: Awaited<ReturnType<typeof lastReadFixture>>, publish = true): Promise<string> {
  const cwd = h.checkout ?? h.root;
  if (!h.checkout) await h.git("git", h.mode === "no-local" ? ["checkout", "--detach", `origin/${h.flip.branch}`]
    : ["checkout", h.flip.branch]);
  await h.git("git", ["rm", ".arc/active/tasks-alpha.md"], { cwd });
  await h.git("git", ["commit", "-m", "Delete tracked operational state"], { cwd });
  const tip = (await h.git("git", ["rev-parse", "HEAD"], { cwd })).stdout.trim();
  if (publish) await h.git("git", ["push", "origin", `HEAD:refs/heads/${h.flip.branch}`], { cwd });
  if (!h.checkout) await h.git("git", ["checkout", "main"]);
  return tip;
}
