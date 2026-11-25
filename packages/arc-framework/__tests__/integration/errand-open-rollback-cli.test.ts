/** A real Git ref-lock fault proves failed-open capture return and retry through actual registrations. */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
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
  const lock = join(f.cwd, ".git/refs/heads/chore", `${slug}.lock`);
  await mkdir(join(f.cwd, ".git/refs/heads/chore"), { recursive: true });
  await writeFile(lock, "Existing Git ref-lock holder\n");
  const failed = await repairCli(f, ["errand", "open", slug, "--from-inbox", "project:12345678", "--json"]);
  expect(failed, JSON.stringify(failed)).toMatchObject({ exitCode: 1, result: { outcome: "error" } });
  expect(failed.stdout + failed.stderr).toContain("cannot lock ref");
  expect(failed.stdout + failed.stderr).toContain(`${slug}.lock`);
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
  const uid = record.reference.owner.type === "work-item" ? record.reference.owner.uid : undefined;
  expect(receipts.result).toHaveLength(2);
  expect(receipts.result).toEqual(expect.arrayContaining([
    expect.objectContaining({ entryId: "12345678", source: { list: "project", section: "Inbox" }, destination: { list: uid, section: "Description" } }),
    expect.objectContaining({ entryId: "12345678", source: { list: uid, section: "Description" }, destination: { list: "project", section: "Inbox" } }),
  ]));
  expect(await readWorktreeMarker(f.cwd)).toEqual({ kind: "absent" });
  expect((await f.exec("git", ["branch", "--show-current"])).stdout.trim()).toBe("main");
  expect((await f.exec("git", ["for-each-ref", "--format=%(refname)", `refs/heads/chore/${slug}`])).stdout).toBe("");
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
  expect((await f.exec("git", ["branch", "--show-current"])).stdout.trim()).toBe(`chore/${slug}`);
  expect((await f.exec("git", ["rev-parse", "HEAD"])).stdout).toBe(f.head);
}, 30000);
