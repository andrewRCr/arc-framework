/** Compensation requires the exact owned spawn generation, including its original bytes. */
import { afterEach, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claimSpawnedWorktree, requireSpawnedWorktreeClaim } from "../../../src/lib/work-unit/spawned-worktree-claim.js";
import { resolveWorktreeMarkerPath } from "../../../src/lib/git/worktree-marker.js";

let path: string | undefined;
afterEach(async () => { if (path !== undefined) await rm(path, { recursive: true, force: true }); path = undefined; });

it.each(["no-receipt", "absent", "malformed", "reformatted", "external"] as const)("refuses compensation with %s ownership evidence", async (kind) => {
  path = await mkdtemp(join(tmpdir(), "spawn-claim-"));
  const expected = await claimSpawnedWorktree(path, { wuName: "demo", spawningIdentity: "starter", now: 0 });
  const markerPath = resolveWorktreeMarkerPath(path);
  if (kind === "absent") await rm(markerPath);
  if (kind === "malformed") await writeFile(markerPath, "invalid marker");
  if (kind === "reformatted") await writeFile(markerPath, JSON.stringify(JSON.parse(expected.toString())));
  if (kind === "external") await writeFile(markerPath, JSON.stringify({ ...JSON.parse(expected.toString()), spawnedByArc: false }));
  const before = await readFile(markerPath).catch(() => null);
  await expect(requireSpawnedWorktreeClaim(path, kind === "no-receipt" ? undefined : expected)).rejects.toThrow("ownership marker generation");
  expect(await readFile(markerPath).catch(() => null)).toEqual(before);
});
