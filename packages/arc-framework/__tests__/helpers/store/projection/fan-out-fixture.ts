/** Native linked projections ready for a command's store-triggered fan-out. */
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "vitest";
import { configureEngineCheckout, createEngineFixture } from "./engine-fixture.js";
import { seedProjection } from "./seeded-projection.js";
import type { KindId } from "../../../../src/lib/store/catalog.js";
import type { Store } from "../../../../src/lib/store/contract.js";
import type { ProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";
import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";
import { TASK_LIST_REGISTRATION } from "../../../../src/lib/store/kinds/task-list/registration.js";
import { resolveArcPath } from "../../../../src/lib/layout/index.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import { readProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { createRecordRenderer } from "../../../../src/lib/store/projection/record-render.js";
import { createProjectionProtection } from "../../../../src/lib/store/projection/protection.js";
import { withFanOut } from "../../../../src/lib/store/projection/with-fan-out.js";
import { createProjectionFanOutDependencies } from "../../../../src/lib/store/projection/fan-out-binding.js";

export async function createFanOutFixture(directories: string[], options: { content?: string; workItem?: boolean; kind?: KindId; path?: string; store?: (store: Store) => Store;
  ports?: (ports: ProjectionEnginePorts) => ProjectionEnginePorts } = {}) {
  const h = await createEngineFixture(directories, { content: options.content, kind: options.kind, path: options.path, ...(options.workItem ? { kind: "work-item/task-list",
    path: ".arc/active/current/tasks-work-item-one.md",
    registryOverrides: { "work-item/task-list": { parser: TASK_LIST_REGISTRATION.parser } } } : {}) });
  await h.exec("git", ["commit", "--allow-empty", "-m", "Seed code"], { cwd: h.checkout });
  const parent = await mkdtemp(join(tmpdir(), "arc-fan-out-")); directories.push(parent);
  const checkout = join(parent, "linked");
  await h.exec("git", ["worktree", "add", "--detach", checkout], { cwd: h.checkout });
  const siblingPath = options.workItem ? resolveArcPath({ kind: "work-unit-artifact", slug: h.record.reference.owner.name,
    artifact: "tasks", placement: { kind: "active", scope: { kind: "project", location: { kind: "another" } } } }) : h.path;
  const sibling = await seedProjection({ store: h.store, checkout, files: [{ path: siblingPath, reference: h.record.reference }],
    renderer: target => createRecordRenderer({ store: h.store, protection: createProjectionProtection({ store: h.store,
      checkout: target, identity: SlugSchema.parse("andrew"), exec: h.exec }) }) });
  await configureEngineCheckout(checkout);
  const siblingInput = { store: h.store, checkout, location: sibling.location, ports: () => createProjectionEnginePorts(checkout) };
  expect(await startProjection(siblingInput)).toMatchObject({ kind: "ready" });
  await endProjection(siblingInput);
  const store = withFanOut(options.store?.(h.store) ?? h.store, createProjectionFanOutDependencies(h.checkout));
  const input = { store, checkout: h.checkout, location: h.location, ports: () => options.ports?.(h.ports()) ?? h.ports() };
  expect(await startProjection(input)).toMatchObject({ kind: "ready" });
  return { h, sibling, siblingPath, store, input,
    file: () => readFile(join(checkout, siblingPath), "utf8"),
    disk: async () => {
      const disk = await readProjectionIndex(sibling.location, true, { groups: "all" });
      if (disk.kind !== "index") throw new Error("Sibling index unavailable");
      return disk.index;
    } };
}
