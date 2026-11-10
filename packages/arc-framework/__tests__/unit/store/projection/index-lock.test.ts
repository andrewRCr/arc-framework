/** A late partition mismatch is contained while the projection lease still owns its checkout. */
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it, vi } from "vitest";
import { ProjectionPartitionMismatch } from "../../../../src/lib/store/projection/index-memory.js";
import { withProjectionLock } from "../../../../src/lib/store/projection/lock.js";

const observation = vi.hoisted(() => ({ partition: "", lock: "", heldAtDelete: false }));
vi.mock("node:fs/promises", async original => {
  const actual = await original<typeof import("node:fs/promises")>();
  return { ...actual, unlink: async (path: string) => {
    if (path === observation.partition) {
      await actual.access(observation.lock);
      observation.heldAtDelete = true;
    }
    return actual.unlink(path);
  } };
});
const directories: string[] = [];
afterEach(async () => { observation.partition = ""; observation.lock = ""; observation.heldAtDelete = false;
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });

it.each([true, false])("contains a late mismatch, with invalidation set to %s", async invalidatePartition => {
  const gitDir = await mkdtemp(join(tmpdir(), "arc-projection-index-lock-"));
  directories.push(gitDir);
  const location = { gitDir, commonDir: gitDir, primary: true, stateDir: join(gitDir, "arc-projection") };
  await mkdir(location.stateDir);
  const name = `index-${"a".repeat(40)}`;
  observation.partition = join(location.stateDir, name);
  observation.lock = join(location.stateDir, "lock");
  await writeFile(observation.partition, "bad partition");
  await writeFile(join(location.stateDir, "index"), "header preserved");
  const result = await withProjectionLock(location, async () => {
    throw new ProjectionPartitionMismatch(name, location);
  }, { invalidatePartition });
  expect(result).toMatchObject({ status: "mismatch", partition: name });
  expect(observation.heldAtDelete).toBe(invalidatePartition);
  if (invalidatePartition) await expect(access(observation.partition)).rejects.toMatchObject({ code: "ENOENT" });
  else await access(observation.partition);
  await access(join(location.stateDir, "index"));
  await expect(access(observation.lock)).rejects.toMatchObject({ code: "ENOENT" });
});
