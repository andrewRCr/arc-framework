/** A same-name backing undo restores its source evidence before exposing that source again. */
import { expect, it } from "vitest";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { switchFixture, createRemoteMover, personal, provenance } from "../helpers/store/remote-move.js";
import { followFixture } from "../helpers/store/follow.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import { success } from "../helpers/store/suite-tools.js";

const written = "Written while a backing switch was pending.\n";
const pause = async (step: string) => { if (step === "backing.repointed") throw new Error("Paused after backing repoint"); };

async function pendingBackingUndo(kind: "move" | "follow") {
  if (kind === "move") {
    const h = await switchFixture("backing", "backing");
    const side = { ...h.a, ports: h.ports, store: h.store };
    await expect(invokeStoreMigrate(["--to", h.to], { ...side.ports, migrateStep: pause })).rejects.toThrow("Paused after backing repoint");
    return { h, side, pointerAfterUndo: h.origin };
  }
  const h = await followFixture(undefined, "backing"), side = h.follower;
  await expect(invokeStoreRemote(["backing", "push", "--json"], { cwd: side.root,
    ports: { ...side.ports, migrateStep: pause } })).rejects.toThrow("Paused after backing repoint");
  return { h, side, pointerAfterUndo: h.destinationDirectory };
}

type BackingSide = Awaited<ReturnType<typeof pendingBackingUndo>>["side"];

async function comparisonHeads(side: BackingSide, copied: boolean): Promise<string[]> {
  const rows: string[] = [];
  for (const part of ["tracking", "seen"] as const) {
    const root = copied ? `refs/arc/tmp/migrate/copied/${part}/`
      : part === "tracking" ? "refs/arc-remotes/backing/" : "refs/arc/tmp/seen/backing/";
    const args = ["for-each-ref", "--format=%(refname) %(objectname)", root];
    const result = copied ? await side.exec("git", args) : await side.git(args);
    rows.push(...result.stdout.split("\n").filter(Boolean).map(row => `${part}/${row.slice(root.length)}`));
  }
  return rows.sort();
}

it.each(["move", "follow"] as const)("restores source comparison heads through an interrupted same-backing %s undo", async kind => {
  const { h, side, pointerAfterUndo } = await pendingBackingUndo(kind);
  const expected = await comparisonHeads(side, true);
  expect(expected.some(row => /^(tracking|seen)\/project\/registry /u.test(row))).toBe(true);
  expect(await comparisonHeads(side, false)).toEqual(expected);
  await side.git(["fetch", "--no-tags", "--no-filter", "--refmap=", h.destinationDirectory,
    "refs/arc/project/registry:refs/arc-remotes/backing/project/registry"]);
  expect(await comparisonHeads(side, false)).not.toEqual(expected);
  const during = RecordReferenceSchema.parse({ ...personal, key: "during-same-backing.md" });
  success(await side.store.write({ action: "put", reference: during, expected: null, content: written, provenance }));
  const mover = await createRemoteMover(h, h.destinationDirectory, "same-backing-mover");
  expect((await invokeStoreMigrate(["--to", h.origin], mover.ports)).status).toBe("ok");
  const ports = { ...side.ports, migrateStep: async (step: string) => {
    if (step !== "backing.repointed") return;
    expect((await side.git(["config", "--get", "remote.backing.url"])).stdout.trim()).toBe(h.origin);
    expect(await comparisonHeads(side, false)).toEqual(expected);
    throw new Error("Paused with restored source evidence");
  } };
  await expect(invokeStoreMigrate([], ports)).rejects.toThrow("Paused with restored source evidence");
  expect((await side.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout.trim())
    .toBe("refs/arc/tmp/migrate/move");
  expect(await comparisonHeads(side, false)).toEqual(expected);
  const undone = await invokeStoreMigrate([], side.ports);
  expect(undone.status, JSON.stringify(undone)).toBe("ok");
  if (undone.status === "ok") expect(undone.result.notices).toContainEqual(expect.objectContaining({ condition: expect.stringContaining("undone") }));
  expect(await side.ports.backingRepository()).toBe(pointerAfterUndo);
  expect((await side.git(["config", "--get", "remote.backing.arc-state"])).stdout.trim()).toBe("push");
  expect(await comparisonHeads(side, false)).toEqual(expected);
  expect((await side.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/"])).stdout).toBe("");
  expect(success(await side.store.read({ reference: during })).content).toBe(written);
  if (kind === "follow") await side.ports.writeBackingRepository?.(h.origin);
  const published = success(await side.store.push());
  expect(published.publishes.some(result => result.status === "pushed" || result.status === "reconciled")).toBe(true);
  expect(published.publishes.every(result => result.status !== "failed")).toBe(true);
  expect((await h.remote("git", ["grep", "-F", written.trim(), "refs/arc/user/andrew/personal"])).stdout).toContain(written.trim());
}, 60_000);
