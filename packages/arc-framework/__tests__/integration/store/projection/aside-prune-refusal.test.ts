/** A refused prune of empty aside scaffolding never fails the swap, sweep, or copy deletion that called it. */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createEngineFixture } from "../../../helpers/store/projection/engine-fixture.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { success, update } from "../../../helpers/store/suite-tools.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import { parseStampedFile } from "../../../../src/lib/store/projection/stamp.js";

const busy = vi.hoisted(() => ({ refusals: 0 }));
vi.mock("node:fs", async original => {
  const actual = await original<typeof import("node:fs")>();
  return { ...actual,
    rmdirSync: (...args: Parameters<typeof actual.rmdirSync>) => {
      // A directory in use, as Windows reports it, under the aside folder alone.
      if (String(args[0]).replaceAll("\\", "/").includes("/projection/aside")) {
        busy.refusals += 1;
        throw Object.assign(new Error("EBUSY: resource busy or locked, rmdir"), { code: "EBUSY" });
      }
      actual.rmdirSync(...args);
    },
  };
});

const directories: string[] = [];
afterEach(async () => { busy.refusals = 0; await removeGitBackedDirs(directories.splice(0)); });

async function asideFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true }).catch(() => []);
  return entries.filter(entry => entry.isFile()).map(entry => entry.name);
}

it("refreshes, sweeps, and deletes spent copies while every aside folder refuses removal", async () => {
  const h = await createEngineFixture(directories);
  const command = { store: h.store, checkout: h.checkout, ports: h.ports };
  expect(await startProjection(command)).toMatchObject({ kind: "ready" });
  await endProjection(command);
  success(await h.store.write(update(h, h.record, "opening\nrefreshed\nclosing\n")));
  for (let round = 0; round < 2; round += 1) {
    expect(await startProjection(command)).toMatchObject({ kind: "ready" });
    await endProjection(command);
  }
  expect(parseStampedFile(await readFile(join(h.checkout, h.path), "utf8")).content).toBe("opening\nrefreshed\nclosing\n");
  expect(busy.refusals).toBeGreaterThan(0);
  expect(await asideFiles(join(h.checkout, ".arc/system/.local/projection/aside"))).toEqual([]);
  expect((await h.disk()).entries[h.path]).toMatchObject({ pending: false, copies: [] });
}, 60_000);
