/** A follow overtaken inside its switch undoes the switch before its record goes, and a rerun finishes the undo. */
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { RecordReferenceSchema, type StoreMigrateResult } from "../../src/lib/store/index.js";
import { followFixture } from "../helpers/store/follow.js";
import { createRemoteMover, personal, provenance } from "../helpers/store/remote-move.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import { success } from "../helpers/store/suite-tools.js";

const written = "Written while the follow was paused.\n";

function pauseAt(boundary: string): (step: string) => Promise<void> {
  return async step => { if (step === boundary) throw new Error(`Paused at ${boundary}`); };
}

async function overtakenInsideSwitch(boundary: string, source: "code" | "backing" = "code") {
  const h = await followFixture(undefined, source), follower = h.follower;
  if (source === "backing") await follower.git(["config", "remote.backing.arc-state", "read"]);
  await expect(invokeStoreRemote(["backing", "push", "--json"], { cwd: follower.root, ports: { ...follower.ports, migrateStep: pauseAt(boundary) } }))
    .rejects.toThrow(`Paused at ${boundary}`);
  const mover = await createRemoteMover(h, h.destinationDirectory, "moving-back");
  expect((await invokeStoreMigrate(["--to", h.origin], mover.ports)).status).toBe("ok");
  const during = RecordReferenceSchema.parse({ ...personal, key: "during-follow.md" });
  success(await follower.store.write({ action: "put", reference: during, expected: null, content: written, provenance }));
  return { h, follower, during };
}

async function expectUndone({ h, follower }: Awaited<ReturnType<typeof overtakenInsideSwitch>>, result: StoreMigrateResult): Promise<void> {
  expect(result.status, JSON.stringify(result)).toBe("ok");
  if (result.status === "ok") expect(result.result.notices).toContainEqual(expect.objectContaining({ condition: expect.stringContaining("during its switch") }));
  expect(await follower.ports.backingRepository()).toBe(h.destinationDirectory);
  expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/"])).stdout).toBe("");
  const directories = await readdir(join(follower.root, ".git", "arc")).catch(() => []);
  for (const name of ["store-migrate-build", "store-migrate-old"]) expect(directories).not.toContain(name);
  const states = success(await follower.store.pull()).states.map(({ status }) => status);
  expect(states).not.toContain("move-incomplete");
  expect(states).not.toContain("move-unfinished");
}

it.each(["layout.rename", "layout.designation", "layout.deleted"])("undoes a follow's switch a move back overtook at %s", async boundary => {
  const overtaken = await overtakenInsideSwitch(boundary), { h, follower, during } = overtaken;
  await expectUndone(overtaken, await invokeStoreMigrate([], follower.ports));
  expect((await invokeStoreRemote(["--json"], { cwd: follower.root, ports: follower.ports })).result).toMatchObject({ status: "ok",
    result: { layout: "default", remotes: [expect.objectContaining({ name: "origin", role: "push" })] } });
  expect(success(await follower.store.read({ reference: during })).content).toBe(written);
  expect(success(await follower.store.push()).states).toEqual([]);
  expect((await h.remote("git", ["grep", "-F", written.trim(), "refs/arc/user/andrew/personal"])).stdout).toContain(written.trim());
}, 60_000);

it.each(["layout.rename", "layout.delete"])("finishes a follow's undo interrupted at its own %s", async boundary => {
  const overtaken = await overtakenInsideSwitch("layout.designation"), { follower, during } = overtaken;
  await expect(invokeStoreMigrate([], { ...follower.ports, migrateStep: pauseAt(boundary) })).rejects.toThrow(`Paused at ${boundary}`);
  await expectUndone(overtaken, await invokeStoreMigrate([], follower.ports));
  expect((await invokeStoreRemote(["--json"], { cwd: follower.root, ports: follower.ports })).result).toMatchObject({ status: "ok",
    result: { layout: "default", remotes: [expect.objectContaining({ name: "origin", role: "push" })] } });
  expect(success(await follower.store.read({ reference: during })).content).toBe(written);
}, 60_000);

it("returns a backing source it read when a follow answering push is overtaken between repointing backing and its role", async () => {
  const overtaken = await overtakenInsideSwitch("backing.repointed", "backing"), { h, follower, during } = overtaken;
  await expectUndone(overtaken, await invokeStoreMigrate([], follower.ports));
  expect((await follower.git(["remote", "get-url", "backing"])).stdout.trim()).toBe(h.origin);
  expect((await follower.git(["config", "remote.backing.arc-state"])).stdout.trim()).toBe("read");
  expect(success(await follower.store.read({ reference: during })).content).toBe(written);
}, 60_000);
