/** Promotion replaces the Errand role and preserves its exact code cut. */
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { expect, it } from "vitest";

import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import {
  ERRAND_TIMEOUT_MS, errandRepository, markerPath, openErrand, primaryReference, resultJson, workItemUid, type ErrandRepository,
} from "../helpers/store-errand-fixture.js";

async function promotionSource(repo: ErrandRepository, slug: string, isolate = false) {
  const opened = await openErrand(repo, slug, "--intent", "Retain the Errand's description", ...(isolate ? ["--isolate"] : []));
  const holder = opened.checkout;
  const source = await repo.read(primaryReference(slug));
  const description = await repo.read(recordReferences["work-item/description"](source.reference.owner));
  const sourceBranch = await repo.git(["branch", "--show-current"], holder);
  const marker = await readFile(markerPath(holder), "utf8");
  await writeFile(join(holder, "errand-work.txt"), "Original Errand work\n");
  await repo.git(["add", "errand-work.txt"], holder);
  await repo.git(["commit", "-m", "Keep Errand work"], holder);
  const cut = await repo.git(["rev-parse", "HEAD"], holder);
  return { holder, source, description, sourceBranch, marker, cut, uid: workItemUid(source), claimId: opened.subject.claimId };
}

function promote(slug: string, name: string, floor: "derivation" | "scale"): string[] {
  return ["errand", "promote", slug, "--name", name, "--type", "feat", "--floor", floor, "--class", "Light", "--json"];
}

function metaReference(name: string) {
  return recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name }));
}

it.each(["derivation", "scale"] as const)("preserves a conflicting branch and cuts the promoted %s branch at the Errand head", async floor => {
  const repo = await errandRepository();
  const slug = "promote-work";
  const name = "continued-work";
  const branch = `feat/${name}`;
  const { holder, source, description, sourceBranch, marker, cut, uid, claimId } = await promotionSource(repo, slug);
  const args = promote(slug, name, floor);
  await repo.git(["branch", branch, "main"]);
  const refs = await repo.git(["show-ref", "--heads"]);
  expect(resultJson(await repo.arc(args, holder), 1)).toMatchObject({ outcome: "refused",
    recommendedPromptText: expect.stringContaining(`target branch ${branch} already exists`) });
  expect(await repo.read(source.reference)).toEqual(source);
  expect(await repo.read(description.reference)).toEqual(description);
  await expect(repo.read(metaReference(name))).rejects.toThrow(/not-found/u);
  expect(await readFile(markerPath(holder), "utf8")).toBe(marker);
  expect(await repo.git(["branch", "--show-current"], holder)).toBe(sourceBranch);
  expect(await repo.git(["show-ref", "--heads"])).toBe(refs);

  await repo.git(["branch", "-m", branch, "preserved-target"]);
  expect(resultJson(await repo.arc(args, holder))).toMatchObject({ outcome: "applied", branch, checkoutPath: holder,
    settlement: { state: "settled", identity: "retired" } });
  const meta = await repo.read(metaReference(name));
  expect(workItemUid(meta)).toBe(uid);
  expect(meta.fields).toMatchObject({ state: floor === "derivation" ? "Planning" : "Active", promotionReceipt: `errand-v1/${slug}/${claimId}` });
  expect(meta.links?.branches).toEqual(expect.arrayContaining([
    expect.objectContaining({ ref: sourceBranch, linkedAs: "created" }),
    expect.objectContaining({ ref: branch, linkedAs: "created", excluded: [] }),
  ]));
  const retained = await repo.read(recordReferences["work-item/description"](meta.reference.owner));
  expect(retained.content).toBe(description.content);
  expect(retained.version).toBe(description.version);
  expect(await repo.git(["rev-parse", "refs/heads/preserved-target"])).toBe(repo.base);
  expect(await repo.git(["rev-parse", `refs/heads/${sourceBranch}`])).toBe(cut);
  expect(await repo.git(["rev-parse", "HEAD"], holder)).toBe(cut);
  expect(await repo.git(["branch", "--show-current"], holder)).toBe(branch);
  expect(JSON.parse(await readFile(markerPath(holder), "utf8"))).toMatchObject({ spawnedByArc: false, createdFor: { kind: "work-unit", name, uid } });
}, ERRAND_TIMEOUT_MS);

it("recovers the recorded cut after a ref lock and captures the Errand work through task close", async () => {
  const repo = await errandRepository();
  const slug = "interrupted-promotion";
  const name = "recovered-work";
  const branch = `feat/${name}`;
  const { holder, description, sourceBranch, marker, cut, uid, claimId } = await promotionSource(repo, slug);
  const args = promote(slug, name, "scale");
  const workRef = `refs/arc/work/${uid}`;
  const beforeRole = await repo.git(["rev-parse", workRef]);
  const lock = join(repo.root, ".git", "refs", "heads", "feat", `${name}.lock`);
  await mkdir(dirname(lock), { recursive: true });
  await writeFile(lock, "External Git ref lock\n");
  expect(resultJson(await repo.arc(args, holder), 1)).toMatchObject({ outcome: "error",
    error: { message: expect.stringContaining(`${name}.lock`) } });
  const role = await repo.read(metaReference(name));
  const roleTip = await repo.git(["rev-parse", workRef]);
  expect(roleTip).not.toBe(beforeRole);
  expect(await repo.git(["merge-base", beforeRole, roleTip])).toBe(beforeRole);
  expect(JSON.parse(await repo.git(["show", `${beforeRole}:errand-${uid}.json`]))).toMatchObject({ slug, claimId, branch: sourceBranch });
  expect(workItemUid(role)).toBe(uid);
  expect(role.fields).toMatchObject({ state: "Active", promotionReceipt: `errand-v1/${slug}/${claimId}` });
  expect(await readFile(markerPath(holder), "utf8")).toBe(marker);
  expect(await repo.git(["branch", "--show-current"], holder)).toBe(sourceBranch);
  expect(await repo.git(["rev-parse", "HEAD"], holder)).toBe(cut);
  expect(await repo.git(["branch", "--list", branch])).toBe("");
  await rm(lock);

  await repo.git(["config", "arc.identity", "another-user"]);
  expect(resultJson(await repo.arc(args, holder), 1)).toMatchObject({ outcome: "refused", reason: "identity-conflict",
    recommendedPromptText: expect.stringContaining("owned by test-user") });
  expect(await repo.read(role.reference)).toEqual(role);
  expect(await readFile(markerPath(holder), "utf8")).toBe(marker);
  expect(await repo.git(["rev-parse", "HEAD"], holder)).toBe(cut);
  expect(await repo.git(["branch", "--list", branch])).toBe("");
  await repo.git(["config", "arc.identity", "test-user"]);

  await writeFile(join(holder, "errand-work.txt"), "Original Errand work\nLater source work\n");
  await repo.git(["add", "errand-work.txt"], holder);
  await repo.git(["commit", "-m", "Keep later source work separately"], holder);
  const moved = await repo.git(["rev-parse", "HEAD"], holder);
  await repo.git(["branch", branch, "main"]);
  const refs = await repo.git(["show-ref", "--heads"]);
  expect(resultJson(await repo.arc(args, holder), 1)).toMatchObject({ outcome: "refused",
    recommendedPromptText: expect.stringMatching(/branch conflict.*recorded.*repair.*retry/isu) });
  expect(await repo.read(role.reference)).toEqual(role);
  expect(await readFile(markerPath(holder), "utf8")).toBe(marker);
  expect(await repo.git(["show-ref", "--heads"])).toBe(refs);
  expect(await repo.git(["branch", "--show-current"], holder)).toBe(sourceBranch);
  await repo.git(["branch", "-m", branch, "preserved-conflict"]);

  expect(resultJson(await repo.arc(args, holder))).toMatchObject({ outcome: "applied", branch, checkoutPath: holder,
    settlement: { state: "settled", identity: "retired" } });
  expect(await repo.read(role.reference)).toEqual(role);
  expect(await repo.git(["rev-parse", workRef])).toBe(roleTip);
  const retained = await repo.read(recordReferences["work-item/description"](role.reference.owner));
  expect(retained.content).toBe(description.content);
  expect(retained.version).toBe(description.version);
  expect(await repo.git(["rev-parse", "HEAD"], holder)).toBe(cut);
  expect(await repo.git(["branch", "--show-current"], holder)).toBe(branch);
  expect(await repo.git(["rev-parse", `refs/heads/${sourceBranch}`])).toBe(moved);
  expect(await repo.git(["rev-parse", "refs/heads/preserved-conflict"])).toBe(repo.base);
  expect(JSON.parse(await readFile(markerPath(holder), "utf8"))).toMatchObject({ spawnedByArc: false, createdFor: { kind: "work-unit", name, uid } });
  expect(resultJson(await repo.arc(args, holder))).toMatchObject({ outcome: "idempotent", branch, checkoutPath: holder });

  const tasks = recordReferences["work-item/task-list"](role.reference.owner);
  await repo.put(tasks, `# Task List: ${name}\n\n### \`[ ]\` **1.1 Finish the useful change**\n\n- _Goal:_ Keep the useful change.\n\n    - \`[ ]\` **1.1.a Preserve the Errand work**\n`);
  const closed = await repo.arc(["task", "close"], holder);
  expect(closed.exitCode, closed.stdout + closed.stderr).toBe(0);
  expect(closed.stdout + closed.stderr).toContain(`Captured ${cut}.`);
  expect((await repo.read(tasks)).content).toContain("`[x]` **1.1.a Preserve the Errand work**");
  const captured = Object.values((await repo.read(role.reference)).links?.taskCaptures ?? {}).flat();
  expect(captured.map(entry => entry.sha)).toEqual([cut]);
  expect(await repo.git(["rev-parse", "HEAD"], holder)).toBe(cut);
}, ERRAND_TIMEOUT_MS);

it.each([false, true])("requires exact foreign confirmation and settles the Errand's own checkout (isolated=%s)", async isolate => {
  const repo = await errandRepository();
  const slug = "foreign-promotion";
  const name = "confirmed-work";
  const { holder, source, description, sourceBranch, marker, cut, uid, claimId } = await promotionSource(repo, slug, isolate);
  const caller = isolate ? repo.root : join(repo.root, ".arc-checkouts", "other-caller");
  if (!isolate) await repo.git(["worktree", "add", "--detach", caller, "main"]);
  const args = promote(slug, name, "derivation");
  const generation = `errand-v1/${slug}/${claimId}`;
  const refs = await repo.git(["show-ref", "--heads"]);
  const roster = await repo.git(["worktree", "list", "--porcelain"]);
  expect(resultJson(await repo.arc(args, caller), 1)).toMatchObject({ outcome: "confirmation-required", checkoutPath: holder, generation });
  expect(await repo.read(source.reference)).toEqual(source);
  expect(await readFile(markerPath(holder), "utf8")).toBe(marker);
  expect(await repo.git(["show-ref", "--heads"])).toBe(refs);
  const confirmed = [...args, "--confirm-foreign-generation", generation];

  const competing = markerPath(caller);
  await mkdir(dirname(competing), { recursive: true });
  const competingBytes = JSON.stringify({ spawnedByArc: false, spawningIdentity: "test-user", createdAt: "2026-01-01T00:00:00Z",
    createdFor: { kind: "work-unit", name, uid } });
  await writeFile(competing, competingBytes);
  expect(resultJson(await repo.arc(confirmed, caller), 1)).toMatchObject({ outcome: "refused",
    recommendedPromptText: expect.stringContaining(caller) });
  expect(await repo.read(source.reference)).toEqual(source);
  expect(await repo.read(description.reference)).toEqual(description);
  expect(await readFile(markerPath(holder), "utf8")).toBe(marker);
  expect(await readFile(competing, "utf8")).toBe(competingBytes);
  expect(await repo.git(["worktree", "list", "--porcelain"])).toBe(roster);
  expect(await repo.git(["show-ref", "--heads"])).toBe(refs);
  expect(await repo.git(["branch", "--show-current"], holder)).toBe(sourceBranch);

  await rm(competing);
  expect(resultJson(await repo.arc(confirmed, caller))).toMatchObject({ outcome: "applied", checkoutPath: holder,
    allocation: isolate ? "spawned" : "primary", branch: `feat/${name}` });
  const meta = await repo.read(metaReference(name));
  expect(workItemUid(meta)).toBe(uid);
  expect(await repo.git(["branch", "--show-current"], holder)).toBe(`feat/${name}`);
  expect(await repo.git(["rev-parse", "HEAD"], holder)).toBe(cut);
  expect(await repo.git(["rev-parse", "HEAD"], caller)).toBe(repo.base);
  expect(JSON.parse(await readFile(markerPath(holder), "utf8"))).toMatchObject({
    spawnedByArc: isolate, createdFor: { kind: "work-unit", name, uid },
  });
  await expect(access(competing)).rejects.toMatchObject({ code: "ENOENT" });
}, ERRAND_TIMEOUT_MS);
