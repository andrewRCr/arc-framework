/** A real Git ref-lock fault proves failed-open capture return and retry through actual registrations. */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { expect, it, vi } from "vitest";
import { repairCliFixture, repairCli, cliRows } from "../helpers/repair-cli.js";
import { success } from "../helpers/store/suite-tools.js";
import { recordReferences } from "../../src/lib/store/identity.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { readWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { readRoutingReceipts } from "../../src/lib/inbox/receipts.js";
it("returns the capture and retires the failed claim after actual Git provisioning fails, then opens after ref-lock repair", async () => {
  const f = await repairCliFixture(), slug = "rollback-cli";
  await repairCli(f, ["errand", "queue", "set", "-"], { stdin: JSON.stringify({ schemaVersion: 1, members: [{ inbox: "project", id: "12345678" }] }) });
  const original = await cliRows(f, "project");
  const store = f.h.context.store, batch = store.batch.bind(store);
  const lockHolder = "Existing Git ref-lock holder\n";
  // The claim batch supplies the newly minted branch before Git tries to create it.
  const claim = vi.spyOn(store, "batch").mockImplementation(async request => {
    const result = await batch(request);
    if (result.status !== "ok") return result;
    const primary = request.writes.find(write => write.reference.kind === "work-item/record" && write.expected === null);
    const branch = primary?.action === "put" ? primary.links?.branches?.[0]?.ref : undefined;
    if (branch !== undefined) {
      const lock = join(f.cwd, ".git/refs/heads", `${branch}.lock`);
      await mkdir(dirname(lock), { recursive: true });
      await writeFile(lock, lockHolder, { flag: "wx" });
    }
    return result;
  });
  const failed = await repairCli(f, ["errand", "open", slug, "--from-inbox", "project:12345678", "--json"]);
  claim.mockRestore();
  expect(failed, JSON.stringify(failed)).toMatchObject({ exitCode: 1, result: { outcome: "error" } });
  expect(failed.stdout + failed.stderr).toContain("cannot lock ref");
  const rolledBack = success(await f.h.context.store.lookup({ kind: "slug", slug: SlugSchema.parse(slug) }));
  const record = success(await f.h.context.store.read({ reference: rolledBack.reference }));
  expect(record).toMatchObject({ placement: { kind: "completed" } });
  expect(await cliRows(f, slug)).toEqual([]);
  const retiredDescription = success(await f.h.context.store.read({ reference: recordReferences["work-item/description"](record.reference.owner) }));
  const returned = await cliRows(f, "project");
  expect(returned).toHaveLength(1);
  expect(returned[0]).toMatchObject({ id: original[0]?.id, title: original[0]?.title, fields: { Created: "2026-01-01" } });
  expect(returned[0]?.raw).toBe(original[0]?.raw);
  expect(returned[0]?.survivor).toBeUndefined();
  expect((await repairCli(f, ["errand", "queue", "--json"])).result).toMatchObject({ state: "listed", members: [] });
  const receipts = await readRoutingReceipts(f.h.context);
  if (receipts.status !== "ok") throw new Error(receipts.refusal.condition);
  const owner = record.reference.owner;
  if (owner.type !== "work-item" || owner.uid === undefined) throw new Error("Expected the retired Errand owner's UID");
  const uid = owner.uid, failedRef = `refs/heads/chore/${slug}-${uid.slice(0, 8)}`;
  const lock = join(f.cwd, ".git", `${failedRef}.lock`);
  expect(failed.stdout + failed.stderr).toContain(failedRef);
  expect(failed.stdout + failed.stderr).toContain(`${slug}-${uid.slice(0, 8)}.lock`);
  expect(failed.stdout + failed.stderr).toContain("File exists");
  expect(await readFile(lock, "utf8")).toBe(lockHolder);
  expect(receipts.result).toHaveLength(2);
  expect(receipts.result).toEqual(expect.arrayContaining([
    expect.objectContaining({ entryId: "12345678", source: { list: "project", section: "Inbox" }, destination: { list: uid, section: "Description" } }),
    expect.objectContaining({ entryId: "12345678", source: { list: uid, section: "Description" }, destination: { list: "project", section: "Inbox" } }),
  ]));
  expect(await readWorktreeMarker(f.cwd)).toEqual({ kind: "absent" });
  expect((await f.exec("git", ["branch", "--show-current"])).stdout.trim()).toBe("main");
  expect((await f.exec("git", ["for-each-ref", "--format=%(refname)", failedRef])).stdout).toBe("");
  expect((await f.exec("git", ["rev-parse", "HEAD"])).stdout).toBe(f.head);
  await rm(lock);
  const retry = await repairCli(f, ["errand", "open", slug, "--from-inbox", "project:12345678", "--json"]);
  expect(retry, JSON.stringify(retry)).toMatchObject({ result: { outcome: "applied" } });
  expect(await cliRows(f, "project")).toEqual([]);
  expect(await cliRows(f, slug)).toMatchObject([{ id: "12345678", title: original[0]?.title, fields: { Created: "2026-01-01" } }]);
  expect(success(await f.h.context.store.read({ reference: record.reference }))).toEqual(record);
  expect(success(await f.h.context.store.read({ reference: retiredDescription.reference }))).toEqual(retiredDescription);
  const active = success(await f.h.context.store.lookup({ kind: "slug", slug: SlugSchema.parse(slug) }));
  expect(active.reference.owner).not.toEqual(record.reference.owner);
  expect(await readWorktreeMarker(f.cwd)).toMatchObject({ kind: "present", marker: { createdFor: { kind: "errand", slug } } });
  const activeOwner = active.reference.owner;
  if (activeOwner.type !== "work-item" || activeOwner.uid === undefined) throw new Error("Expected the active Errand owner's UID");
  expect((await f.exec("git", ["branch", "--show-current"])).stdout.trim()).toBe(`chore/${slug}-${activeOwner.uid.slice(0, 8)}`);
  expect((await f.exec("git", ["rev-parse", "HEAD"])).stdout).toBe(f.head);
}, 30000);
