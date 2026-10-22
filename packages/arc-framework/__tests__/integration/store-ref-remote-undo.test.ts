/** A remote move overtaken inside its switch undoes the switch before its record goes, and a rerun finishes the undo. */
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { RecordReferenceSchema, type StoreMigrateResult } from "../../src/lib/store/index.js";
import { oppositeMoveFixture, personal, provenance } from "../helpers/store/remote-move.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import { success } from "../helpers/store/suite-tools.js";

const written = "Written while the move was paused.\n";

function pauseAt(boundary: string): (step: string) => Promise<void> {
  return async step => { if (step === boundary) throw new Error(`Paused at ${boundary}`); };
}

async function overtakenInsideSwitch(boundary: string) {
  const h = await oppositeMoveFixture();
  await expect(invokeStoreMigrate(["--to", h.to], { ...h.ports, migrateStep: pauseAt(boundary) })).rejects.toThrow(`Paused at ${boundary}`);
  expect((await invokeStoreMigrate(["--to", h.origin], h.peerPorts)).status).toBe("ok");
  const during = RecordReferenceSchema.parse({ ...personal, key: "during-switch.md" });
  success(await h.store.write({ action: "put", reference: during, expected: null, content: written, provenance }));
  return { h, during };
}

async function expectUndone({ h, during }: Awaited<ReturnType<typeof overtakenInsideSwitch>>, result: StoreMigrateResult): Promise<void> {
  expect(result.status, JSON.stringify(result)).toBe("ok");
  if (result.status === "ok") expect(result.result.notices).toContainEqual(expect.objectContaining({ condition: expect.stringContaining("during its switch") }));
  expect(await h.ports.backingRepository()).toBeNull();
  expect((await invokeStoreRemote(["--json"], { cwd: h.a.root, ports: h.ports })).result).toMatchObject({ status: "ok",
    result: { layout: "default", remotes: [expect.objectContaining({ name: "origin", role: "push" })] } });
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/"])).stdout).toBe("");
  const directories = await readdir(join(h.a.root, ".git", "arc")).catch(() => []);
  for (const name of ["store", "store-migrate-build", "store-migrate-old"]) expect(directories).not.toContain(name);
  expect(success(await h.store.pull()).states).toEqual([]);
  expect(success(await h.store.read({ reference: during })).content).toBe(written);
  expect(success(await h.store.push()).states).toEqual([]);
  expect((await h.remote("git", ["grep", "-F", written.trim(), "refs/arc/user/andrew/personal"])).stdout).toContain(written.trim());
}

it.each(["layout.rename", "layout.designation", "layout.deleted"])("undoes a switch a move back overtook at %s", async boundary => {
  const overtaken = await overtakenInsideSwitch(boundary);
  await expectUndone(overtaken, await invokeStoreMigrate([], overtaken.h.ports));
}, 60_000);

it.each(["layout.rename", "layout.delete"])("finishes an undo interrupted at its own %s", async boundary => {
  const overtaken = await overtakenInsideSwitch("layout.designation"), { h } = overtaken;
  await expect(invokeStoreMigrate([], { ...h.ports, migrateStep: pauseAt(boundary) })).rejects.toThrow(`Paused at ${boundary}`);
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout.trim()).toBe("refs/arc/tmp/migrate/move");
  await expectUndone(overtaken, await invokeStoreMigrate([], h.ports));
}, 60_000);
