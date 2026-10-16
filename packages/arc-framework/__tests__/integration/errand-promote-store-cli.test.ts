/** Registered promotion preserves exact Store/Git generations through refusal and interrupted recovery. */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { repairCliFixture, repairCli } from "../helpers/repair-cli.js";
import { success } from "../helpers/store/suite-tools.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { recordReferences } from "../../src/lib/store/identity.js";
import { ParsedMetaRecordSchema } from "../../src/lib/active/meta-schema.js";
import { readWorktreeMarker } from "../../src/lib/git/worktree-marker.js";

async function openedFixture(slug: string) {
  const f = await repairCliFixture();
  const opened = await repairCli(f, ["errand", "open", slug, "--intent", "Keep the useful Errand work", "--json"]);
  expect(opened).toMatchObject({ result: { outcome: "applied" } });
  await writeFile(join(f.cwd, "errand-work.txt"), "Useful Errand work\n");
  await f.exec("git", ["add", "errand-work.txt"]);
  await f.exec("git", ["commit", "-m", "Useful Errand work"]);
  const cut = (await f.exec("git", ["rev-parse", "HEAD"])).stdout.trim();
  const store = f.h.context.store;
  const reference = success(await store.lookup({ kind: "slug", slug: SlugSchema.parse(slug) })).reference;
  const primary = success(await store.read({ reference }));
  const description = success(await store.read({ reference: recordReferences["work-item/description"](reference.owner) }));
  return { ...f, store, cut, primary, description, marker: await readWorktreeMarker(f.cwd), slug };
}
function promoteArgs(slug: string, name: string, floor = "derivation") {
  return ["errand", "promote", slug, "--name", name, "--type", "feat", "--floor", floor, "--class", "Light", "--json"];
}

it.each(["derivation", "scale"] as const)("promotes through registered %s options after preserving a conflicting branch", async floor => {
  const f = await openedFixture(`cli-promote-${floor}`), name = `grown-${floor}`;
  const version = success(await f.store.version());
  await f.exec("git", ["branch", `feat/${name}`, "main"]);
  const refused = await repairCli(f, promoteArgs(f.slug, name, floor));
  expect(refused).toMatchObject({ exitCode: 1, result: { outcome: "refused", recommendedPromptText: expect.stringContaining(`target branch feat/${name} already exists`) } });
  expect(success(await f.store.version())).toBe(version);
  expect(success(await f.store.read({ reference: f.primary.reference }))).toEqual(f.primary);
  expect(success(await f.store.read({ reference: f.description.reference }))).toEqual(f.description);
  expect(await readWorktreeMarker(f.cwd)).toEqual(f.marker);
  expect((await f.exec("git", ["branch", "--show-current"])).stdout.trim()).toBe(`chore/${f.slug}`);
  expect((await f.exec("git", ["rev-parse", "HEAD"])).stdout.trim()).toBe(f.cut);
  await f.exec("git", ["branch", "-m", `feat/${name}`, `preserved-${name}`]);

  const promoted = await repairCli(f, promoteArgs(f.slug, name, floor));
  expect(promoted).toMatchObject({ result: { outcome: "applied", branch: `feat/${name}`, checkoutPath: f.cwd, allocation: "primary", settlement: { state: "settled", originEntry: null } } });
  const target = success(await f.store.lookup({ kind: "slug", slug: SlugSchema.parse(name) })).reference;
  const meta = success(await f.store.read({ reference: target }));
  expect(target).toMatchObject({ kind: "work-item/meta", owner: { ...f.primary.reference.owner, name } });
  expect(ParsedMetaRecordSchema.parse(meta.fields)).toMatchObject({ state: floor === "derivation" ? "Planning" : "Active", owner: "test-user", workClass: "Light", promotionReceipt: expect.stringContaining(`errand-v1/${f.slug}/`) });
  expect(meta.links?.branches).toEqual(expect.arrayContaining([
    expect.objectContaining({ repository: f.primary.links?.branches?.[0]?.repository, ref: `chore/${f.slug}`, linkedAs: "created" }),
    expect.objectContaining({ repository: f.primary.links?.branches?.[0]?.repository, ref: `feat/${name}`, linkedAs: "created", excluded: [] }),
  ]));
  expect(success(await f.store.lookup({ kind: "slug", slug: SlugSchema.parse(f.slug) })).reference).toEqual(target);
  expect(success(await f.store.read({ reference: f.description.reference }))).toEqual({ ...f.description, reference: recordReferences["work-item/description"](target.owner) });
  expect((await f.exec("git", ["branch", "--show-current"])).stdout.trim()).toBe(`feat/${name}`);
  expect((await f.exec("git", ["rev-parse", "HEAD"])).stdout.trim()).toBe(f.cut);
  expect((await f.exec("git", ["rev-parse", `refs/heads/chore/${f.slug}`])).stdout.trim()).toBe(f.cut);
  expect((await f.exec("git", ["rev-parse", `refs/heads/preserved-${name}`])).stdout.trim()).toBe(f.head.trim());
  expect(await readWorktreeMarker(f.cwd)).toMatchObject({ kind: "present", marker: { spawnedByArc: false, createdFor: { kind: "work-unit", name } } });
}, 30_000);

it("recovers a registered promotion's recorded cut after a real ref lock and repaired branch conflict", async () => {
  const f = await openedFixture("cli-promote-recovery"), name = "grown-recovery";
  const lock = join(f.cwd, ".git", "refs", "heads", "feat", `${name}.lock`);
  await mkdir(join(f.cwd, ".git", "refs", "heads", "feat"), { recursive: true });
  await writeFile(lock, "External ref lock\n");
  const interrupted = await repairCli(f, promoteArgs(f.slug, name));
  expect(interrupted).toMatchObject({ exitCode: 1, result: { outcome: "error", error: { message: expect.stringContaining(`${name}.lock`) } } });
  const target = success(await f.store.lookup({ kind: "slug", slug: SlugSchema.parse(name) })).reference;
  const landed = success(await f.store.read({ reference: target }));
  expect(target).toMatchObject({ kind: "work-item/meta", owner: { ...f.primary.reference.owner, name } });
  expect(await readWorktreeMarker(f.cwd)).toEqual(f.marker);
  expect((await f.exec("git", ["branch", "--show-current"])).stdout.trim()).toBe(`chore/${f.slug}`);
  expect((await f.exec("git", ["rev-parse", "HEAD"])).stdout.trim()).toBe(f.cut);
  expect((await f.exec("git", ["branch", "--list", `feat/${name}`])).stdout.trim()).toBe("");
  await rm(lock);
  await writeFile(join(f.cwd, "errand-work.txt"), "Useful Errand work\nLater source work\n");
  await f.exec("git", ["add", "errand-work.txt"]); await f.exec("git", ["commit", "-m", "Later source work"]);
  const moved = (await f.exec("git", ["rev-parse", "HEAD"])).stdout.trim();
  await f.exec("git", ["branch", `feat/${name}`, "main"]);
  const version = success(await f.store.version());
  const refused = await repairCli(f, promoteArgs(f.slug, name));
  expect(refused).toMatchObject({ exitCode: 1, result: { outcome: "refused", recommendedPromptText: expect.stringMatching(/branch conflict.*recorded.*repair.*retry/isu) } });
  expect(success(await f.store.version())).toBe(version);
  expect(success(await f.store.read({ reference: target }))).toEqual(landed);
  expect(await readWorktreeMarker(f.cwd)).toEqual(f.marker);
  await f.exec("git", ["branch", "-m", `feat/${name}`, "preserved-recovery-conflict"]);

  const recovered = await repairCli(f, promoteArgs(f.slug, name));
  expect(recovered).toMatchObject({ result: { outcome: "applied", branch: `feat/${name}`, checkoutPath: f.cwd, settlement: { state: "settled", identity: "retired", originEntry: null } } });
  expect(success(await f.store.read({ reference: target }))).toEqual(landed);
  expect(success(await f.store.read({ reference: f.description.reference }))).toEqual({ ...f.description, reference: recordReferences["work-item/description"](target.owner) });
  expect((await f.exec("git", ["branch", "--show-current"])).stdout.trim()).toBe(`feat/${name}`);
  expect((await f.exec("git", ["rev-parse", "HEAD"])).stdout.trim()).toBe(f.cut);
  expect((await f.exec("git", ["rev-parse", `refs/heads/chore/${f.slug}`])).stdout.trim()).toBe(moved);
  expect((await f.exec("git", ["rev-parse", "refs/heads/preserved-recovery-conflict"])).stdout.trim()).toBe(f.head.trim());
  expect(await readWorktreeMarker(f.cwd)).toMatchObject({ kind: "present", marker: { spawnedByArc: false, createdFor: { kind: "work-unit", name } } });
}, 30_000);
