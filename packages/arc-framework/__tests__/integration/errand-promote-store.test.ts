/** Interrupted role promotion retains its exact code cut against real local branch state. */
import { afterEach, expect, it } from "vitest";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createTempRepo, cleanupTempDir, makeGitExec } from "../helpers/integration.js";
import { makeGitProcessError } from "../helpers/git-exec-fake.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { createStorePromotionSteps } from "../../src/lib/errand/promote-store.js";
import { promoteOrdinaryErrand } from "../../src/lib/errand/promote.js";

let root: string | undefined;
afterEach(async () => { if (root !== undefined) await cleanupTempDir(root); root = undefined; });
it.each([false, true])("recovers the original role-write cut after source movement and repaired target conflict=%s", async (conflict) => {
  root = await createTempRepo(); const cwd = root, git = makeGitExec(cwd);
  await git("git", ["commit", "--allow-empty", "-m", "base"]);
  const base = (await git("git", ["rev-parse", "HEAD"])).stdout.trim();
  await git("git", ["switch", "-c", "chore/errand-source"]);
  await writeFile(join(cwd, "work"), "original work\n"); await git("git", ["add", "work"]);
  await git("git", ["commit", "-m", "original work"]);
  const cut = (await git("git", ["rev-parse", "HEAD"])).stdout.trim();
  const h = createLifecycleHarness(), claimId = "a".repeat(32);
  const primary = await h.seed(recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: "errand-source" })),
    JSON.stringify({ version: 3, slug: "errand-source", claimId, createdAt: "2026-10-14T00:00:00Z", updatedAt: "2026-10-14T00:00:00Z",
      kind: "errand", purpose: "errand", owner: "test-user", intent: "Useful work", branch: "chore/errand-source", origin: "description", originEntry: null,
      state: "open", savedHead: null, changeRequest: null }), { kind: "active" },
    { branches: [{ repository: "repo", ref: "chore/errand-source", linkedAs: "created", excluded: [] }] });
  let failCut = true, settled = false;
  const exec: typeof git = async (command, args, options) => {
    if (failCut && args[0] === "branch" && args[1] === "feat/example") {
      failCut = false; throw makeGitProcessError({ command, args, exitCode: 128, stderr: "interrupted cut" });
    }
    return git(command, args, options);
  };
  const options = { slug: "errand-source", name: "example", type: "feat", floor: "derivation" as const, owner: "test-user", identity: "test-user",
    class: "Light", store: h.store, exec, cwd, repository: "repo",
    checkout: async () => ({ kind: "ready" as const, checkoutPath: cwd, allocation: "primary" as const, parentCheckoutPath: null }) };
  const run = () => promoteOrdinaryErrand({ ...options, protection: "full", dependencies: {
    ...createStorePromotionSteps(options), settleInbox: async (frame) => frame,
    settleOccupancy: async (frame) => { settled = true; return frame; },
  } });
  expect(await run()).toMatchObject({ outcome: "error" });
  const meta = lifecycleSuccess(await h.store.read({ reference: primary.reference }));
  await writeFile(join(cwd, "work"), "later work\n"); await git("git", ["add", "work"]); await git("git", ["commit", "-m", "later work"]);
  const moved = (await git("git", ["rev-parse", "HEAD"])).stdout.trim();
  if (conflict) {
    await git("git", ["branch", "feat/example", base]);
    expect(await run()).toMatchObject({ outcome: "refused", recommendedPromptText: expect.stringMatching(/repair.*retry/isu) });
    expect(settled).toBe(false);
    expect((await git("git", ["rev-parse", "refs/heads/feat/example"])).stdout.trim()).toBe(base);
    expect((await git("git", ["rev-parse", "HEAD"])).stdout.trim()).toBe(moved);
    await git("git", ["branch", "-D", "feat/example"]);
    await git("git", ["branch", "feat/example", cut]);
  }
  expect(await run()).toMatchObject({ outcome: "idempotent", settlement: { state: "settled" } });
  expect(settled).toBe(true);
  expect((await git("git", ["symbolic-ref", "HEAD"])).stdout.trim()).toBe("refs/heads/feat/example");
  expect((await git("git", ["rev-parse", "HEAD"])).stdout.trim()).toBe(cut);
  expect((await git("git", ["rev-parse", "refs/heads/chore/errand-source"])).stdout.trim()).toBe(moved);
  expect(lifecycleSuccess(await h.store.read({ reference: primary.reference }))).toEqual(meta);
}, 30_000);
