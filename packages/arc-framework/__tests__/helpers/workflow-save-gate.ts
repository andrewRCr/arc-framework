/** Apply the save criteria stated in a workflow to real CLI and checkout evidence. */
import { spawn } from "node:child_process";
import { once } from "node:events";
import { appendFile, readFile, rm } from "node:fs/promises";
import { join, relative } from "node:path";
import { expect } from "vitest";
import type { StatusResult } from "../../src/commands/status/types.js";
import { createRefStore } from "../../src/lib/store/create.js";
import { createDefaultRefStorePorts } from "../../src/lib/store/default-ports.js";
import { startProjection } from "../../src/lib/store/projection/engine.js";
import { createProjectionEnginePorts } from "../../src/lib/store/projection/engine-ports.js";
import { readProjectionIndex } from "../../src/lib/store/projection/index-file.js";
import { locateProjection } from "../../src/lib/store/projection/location.js";
import type { ProjectionStatus } from "../../src/lib/store/projection/status.js";
import { LIFECYCLE_IDENTITY, type lifecycleRepository } from "./store-lifecycle-fixture.js";

type Repository = Awaited<ReturnType<typeof lifecycleRepository>>;

/** Read the ready projection reported by the built CLI. */
export async function readReadyProjection(h: Repository): Promise<Extract<ProjectionStatus, { kind: "ready" }>> {
  const result = await h.run(["status", "--json"]);
  expect(result.exitCode, result.output).toBe(0);
  const { projection } = JSON.parse(result.stdout) as StatusResult;
  if (!projection.ok || projection.value.kind !== "ready") throw new Error("Expected a ready projection");
  return projection.value;
}

/** Read the projection conditions for the supplied paths when the workflow directs that check. */
export async function workflowSaveBlocked(h: Repository, gate: string, paths: readonly string[]): Promise<boolean> {
  if (!gate.includes("arc status --json")) return false;
  const { files, copies } = await readReadyProjection(h);
  const edited = new Set(paths.map(path => relative(h.repo, path).replaceAll("\\", "/")));
  if (gate.includes("`files`") && files.some(file => edited.has(file.path))) return true;
  if (gate.includes("`copies`") && copies.some(copy => copy.path !== null && edited.has(copy.path))) return true;
  if (/\b(?:no|without)\s+(?:unresolved\s+)?(?:ARC\s+)?conflict\s+(?:blocks|markers)\b/iu.test(gate)) {
    const content = await Promise.all(paths.map(path => readFile(path, "utf8")));
    if (content.some(file => /^<{7,} .*\[arc-conflict: /mu.test(file))) return true;
  }
  return false;
}

/** Leave a late edit in a real retained copy after its projected path acquires a newer edit. */
export async function retainLateEdit(h: Repository, path: string, edit: string): Promise<() => Promise<void>> {
  const ports = createProjectionEnginePorts(h.repo);
  const location = await locateProjection(h.repo, ports);
  const store = createRefStore({ ...createDefaultRefStorePorts({ checkoutRoot: h.repo, backingRepository: async () => null }),
    identity: async () => LIFECYCLE_IDENTITY });
  const previous = spawn(process.execPath, ["--version"], { stdio: "ignore" });
  const { pid } = previous;
  await once(previous, "exit");
  if (pid === undefined) throw new Error("Expected an exited projection writer's PID");
  await appendFile(path, "\nFirst checkout edit.\n");
  expect(await startProjection({ store, checkout: h.repo, ports: () => ({ ...ports,
    writer: async () => ({ ...await ports.writer(), pid, processInstance: "previous-command" }),
  }) })).toMatchObject({ kind: "ready" });
  const read = await readProjectionIndex(location, true, { groups: "all" });
  const original = relative(h.repo, path).replaceAll("\\", "/");
  const entry = read.kind === "index" ? read.index.entries[original] : undefined;
  const copy = entry?.kind === "record" ? entry.copies[0] : undefined;
  if (copy === undefined) throw new Error("Expected an aside copy after replacing the projected file");
  const aside = join(h.repo, copy.name);
  await appendFile(aside, `\n${edit}\n`);
  await appendFile(path, "\nNewer checkout edit.\n");
  const saved = await h.run(["save"]);
  expect(saved.exitCode, saved.output).toBe(0);
  expect(await readFile(aside, "utf8")).toContain(edit);
  const { files, copies } = await readReadyProjection(h);
  expect(files).not.toContainEqual(expect.objectContaining({ path: original }));
  expect(copies).toContainEqual(expect.objectContaining({ path: original, copy: copy.name }));
  return async () => {
    await appendFile(path, `\n${edit}\n`);
    await rm(aside);
    const retried = await h.run(["save"]);
    expect(retried.exitCode, retried.output).toBe(0);
    expect((await readReadyProjection(h)).copies).not.toContainEqual(expect.objectContaining({ copy: copy.name }));
  };
}
