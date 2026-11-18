/** A native archived record and a clean linked holder checkout for removal and release exercises. */
import { chmod, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import { createAdoptionFixture } from "./adoption-fixture.js";
import { configureEngineCheckout } from "./engine-fixture.js";
import { projectionCommand } from "./command.js";
import { boundWorkUnitSubject } from "../bound-checkout.js";
import { makeMetaFixture } from "../../meta-fixture.js";
import { seed } from "../suite-tools.js";
import type { RefFixtureLayout } from "../ref-fixture.js";
import { ArchiveQuarterSchema, SlugSchema } from "../../../../src/lib/kernel/index.js";
import { recordReferences, OwnerIdentitySchema } from "../../../../src/lib/store/identity.js";
import { createRefStore } from "../../../../src/lib/store/create.js";
import { createDefaultRefStorePorts } from "../../../../src/lib/store/default-ports.js";
import { ensureWorktreeMarkerIgnored, nodeWorktreeMarkerIgnoreFs, writeWorktreeMarker } from "../../../../src/lib/git/worktree-marker.js";
import { checkWorktreeRemoval } from "../../../../src/lib/git/worktree-removal.js";
import { checkProjectionRemoval } from "../../../../src/lib/store/projection/removal-check.js";
import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";
import { locateProjection } from "../../../../src/lib/store/projection/location.js";
import { readProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";

export async function archiveRetirementFixture(owner = "andrew", layout: RefFixtureLayout = "default") {
  const h = await createAdoptionFixture({ owner, layout, placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } });
  const holder = await seed(h.f, recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: "retiring" })),
    makeMetaFixture("retiring", { owner: "andrew", state: "Active", currentWorkflow: "process-task-loop", workClass: "Light", priority: "P1" }),
    { kind: "active" });
  const checkout = join(h.f.root, ".arc-fixture", "retiring");
  await h.f.ports.exec("git", ["worktree", "add", "-b", "feat/retiring", checkout], { cwd: h.f.root });
  await configureEngineCheckout(checkout);
  await writeWorktreeMarker(checkout, { spawnedByArc: true, spawningIdentity: "andrew", createdAt: new Date(0).toISOString(),
    createdFor: boundWorkUnitSubject(holder) });
  await ensureWorktreeMarkerIgnored(checkout, h.f.ports.exec, nodeWorktreeMarkerIgnoreFs);
  await h.f.ports.exec("git", ["add", ".gitignore", ".arc/user/.npmignore"], { cwd: checkout });
  await h.f.ports.exec("git", ["commit", "-m", "Seed archive retirement checkout"], { cwd: checkout });
  const store = createRefStore(createDefaultRefStorePorts({ checkoutRoot: checkout, backingRepository: async () => null }));
  const input = { checkout, store }, identity = SlugSchema.parse("andrew");
  const context = { store, identity };
  expect((await projectionCommand(input, ["status"])).result).toMatchObject({ kind: "ready" });
  const path = Object.keys(h.projected.index.entries)[0]!;
  const disk = async () => {
    const location = await locateProjection(checkout, createProjectionEnginePorts(checkout));
    const found = await readProjectionIndex(location, true, { groups: "all" });
    if (found.kind !== "index") throw new Error("No usable archive retirement index");
    return { location, index: found.index };
  };
  const write = async (path: string, content: string) => {
    const entry = (await disk()).index.entries[path];
    if (entry?.kind === "record") await chmod(join(checkout, path), 0o644);
    await writeFile(join(checkout, path), entry?.kind === "record" ? renderStampedFile({ content, stamp: entry.base.blob }) : content);
  };
  const check = (from = h.f.root) => checkWorktreeRemoval({ checkoutPath: checkout, disposition: "remove",
    exec: (command, args, options) => h.f.ports.exec(command, args, { cwd: from, ...options }),
    check: target => checkProjectionRemoval(target, { store: from === checkout ? store : h.f.store, identity }),
  });
  expect(await check()).toEqual({ kind: "removable" });
  const openAndSave = async (path: string, content?: string) => {
    expect((await projectionCommand(input, ["edit", join(checkout, path)])).result).toMatchObject({ status: "ok" });
    if (content !== undefined) await write(path, content);
    expect((await projectionCommand(input, ["save"])).result).toMatchObject({ status: "ok" });
  };
  return { ...h, checkout, store, input, context, path, disk, write, check, openAndSave };
}
