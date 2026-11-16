/** Release keeps the index its second check published when a later step of that check fails. */
import { afterEach, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempDir } from "../../../helpers/integration.js";
import { projectedRetirement, retirementFixtureRoots as roots } from "../../../helpers/store/projection-retirement.js";
import { readProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { endProjection, startProjection } from "../../../../src/lib/store/projection/engine.js";
import { parseStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import type { SecondCheckInput } from "../../../../src/lib/store/projection/second-check.js";

/** Whether the second check fails right after its first publication, where its returned-alias cleanup runs. */
const cleanup = vi.hoisted(() => ({ failing: false }));
vi.mock("../../../../src/lib/store/projection/second-check.js", async original => {
  const actual = await original<typeof import("../../../../src/lib/store/projection/second-check.js")>();
  return { ...actual, runSecondCheck: (input: SecondCheckInput) => actual.runSecondCheck(!cleanup.failing ? input : {
    ...input, onPublished: published => {
      input.onPublished?.(published);
      throw Object.assign(new Error("Returned alias cleanup failed."), { code: "EACCES" });
    } }) };
});

afterEach(async () => { cleanup.failing = false; for (const root of roots.splice(0)) await cleanupTempDir(root); });

it("keeps the second check's published index when release fails after that publication, then releases on retry", async () => {
  const h = await projectedRetirement();
  const command = { checkout: h.checkout, store: h.store };
  expect(await startProjection(command)).toMatchObject({ kind: "ready" });
  await endProjection(command);
  cleanup.failing = true;
  const checkout = h.checkout.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  expect(await h.release()).toMatchObject({ kind: "refused", remedy: { text: expect.stringMatching(
    new RegExp(`Returned alias cleanup failed.*Release already removed projected files from ${checkout}`, "su")) } });
  cleanup.failing = false;
  // The second check dropped the removed entry when it published; release keeps that index, its state cleared.
  const disk = await readProjectionIndex(h.location, true, { groups: "all" });
  if (disk.kind !== "index") throw new Error("Release left no projection index");
  expect(disk.index.state).toBeNull();
  expect(disk.index.entries[h.path]).toBeUndefined();
  await expect(readFile(join(h.checkout, h.path))).rejects.toMatchObject({ code: "ENOENT" });
  expect(await startProjection(command)).toMatchObject({ kind: "ready" });
  await endProjection(command);
  expect(parseStampedFile(await readFile(join(h.checkout, h.path), "utf8")).content).toBe(h.record.content);
  expect(await h.release()).toEqual({ kind: "released" });
});
