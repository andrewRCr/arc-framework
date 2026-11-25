/** A command binds another checkout without lending it the command's claim, configuration, or ports. */
import { mkdtemp, readFile, access, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { bindProjectionRoot, refreshProjectionRootLayout } from "../../../../src/lib/store/projection/engine-binding.js";
import { createHistoryMemo } from "../../../../src/lib/store/projection/base-recovery.js";
import { readProjectionConfiguration } from "../../../../src/lib/store/projection/configuration.js";
import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";
import { withProjectionLock } from "../../../../src/lib/store/projection/lock.js";
import { bindReadOnlyProjectionRoot } from "../../../../src/lib/store/projection/engine-read-only.js";
import { resolveProjectionActor } from "../../../../src/lib/store/projection/engine-actor.js";
import { beginProjectionCommand, projectionProcessState } from "../../../../src/lib/store/projection/process-state.js";
import { notifyCheckoutChange } from "../../../../src/lib/git/checkout-change.js";
import { identifyArcFileAddress } from "../../../../src/lib/layout/index.js";
import { readCheckoutLayoutContext } from "../../../../src/lib/store/checkout-layout.js";
import { renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { success } from "../../../helpers/store/suite-tools.js";
import { writeWorktreeMarker } from "../../../../src/lib/git/worktree-marker.js";
import { META_REGISTRATION } from "../../../../src/lib/store/kinds/meta/registration.js";
import { makeMetaFixture } from "../../../helpers/meta-fixture.js";
import { configureEngineCheckout, createEngineFixture } from "../../../helpers/store/projection/engine-fixture.js";
import { seedProjection } from "../../../helpers/store/projection/seeded-projection.js";
import { seed } from "../../../helpers/store/suite-tools.js";
import { boundWorkUnitSubject } from "../../../helpers/store/bound-checkout.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

async function sibling() {
  beginProjectionCommand();
  const h = await createEngineFixture(directories, { registryOverrides: { "work-item/meta": { parser: META_REGISTRATION.parser } } });
  await h.exec("git", ["commit", "--allow-empty", "-m", "initial"], { cwd: h.checkout });
  const parent = await mkdtemp(join(tmpdir(), "arc-projection-binding-")); directories.push(parent);
  const checkout = join(parent, "target");
  await h.exec("git", ["worktree", "add", "-b", "target", checkout], { cwd: h.checkout });
  const projected = await seedProjection({ store: h.store, checkout, files: [{ path: h.path, reference: h.record.reference }] });
  await configureEngineCheckout(checkout);
  const primary = await seed(h, h.reference("work-item/meta", "target"), makeMetaFixture("work-item-target", {
    owner: "andrew", state: "Active", workClass: "Light", priority: "P1", currentWorkflow: "process-task-loop",
  }));
  await writeWorktreeMarker(checkout, { spawnedByArc: true, spawningIdentity: "andrew", createdAt: "2026-11-10T00:00:00Z",
    createdFor: boundWorkUnitSubject(primary) });
  await writeFile(join(checkout, ".arc/system/arc-config.yml"), "layout.active: flat\n");
  projectionProcessState().command = { checkout: h.checkout, store: h.store };
  const ports = createProjectionEnginePorts(checkout);
  const configuration = await readProjectionConfiguration(ports.exec, checkout);
  return { h, ...projected, ports, configuration, primary };
}

it("captures a sibling's claim and configuration from its own checkout without registering a retirement binding", async () => {
  const target = await sibling();
  const roots = projectionProcessState().roots;
  const before = [...roots];
  const result = await withProjectionLock(target.location, async session => {
    let gitCalls = 0;
    const ports = { ...target.ports, exec: async (...args: Parameters<typeof target.ports.exec>) => { gitCalls++; return target.ports.exec(...args); } };
    const root = await bindProjectionRoot({ checkout: target.checkout, store: target.h.store, location: target.location,
      configuration: target.configuration, ports, actor: "andrew@machine", history: createHistoryMemo(target.h.store),
      session, register: false });
    expect(gitCalls).toBe(0);
    expect(root.checkout).toBe(target.checkout);
    expect(root.claim).toBe(target.primary.reference.owner.name);
    expect(root.layoutActive).toBe("flat");
    expect(await root.context.captureLocal?.(target.h.path, "file")).toMatchObject({ status: "ok", result: {
      identity: "andrew", binding: target.h.record.reference, local: { claim: target.primary.reference.owner.name,
        layoutActive: "flat", marker: { kind: "current", subject: boundWorkUnitSubject(target.primary) } },
    } });
    expect([...roots]).toEqual(before);
  });
  expect(result.status).toBe("done");
});

async function bindTarget(target: Awaited<ReturnType<typeof sibling>>, register = true) {
  return withProjectionLock(target.location, session => bindProjectionRoot({ checkout: target.checkout, store: target.h.store,
    location: target.location, configuration: target.configuration, ports: target.ports, actor: "andrew@machine",
    history: createHistoryMemo(target.h.store), session, register }));
}

it("takes in the sibling's metadata edit under the sibling's own active claim", async () => {
  const target = await sibling();
  const path = ".arc/active/meta-work-item-target.md";
  const projected = await seedProjection({ store: target.h.store, checkout: target.checkout,
    files: [{ path, reference: target.primary.reference }] });
  const entry = projected.index.entries[path];
  if (entry?.kind !== "record") throw new Error("missing projected metadata");
  const content = target.primary.content + "\nIndependent metadata correction.\n";
  await writeFile(join(target.checkout, path), renderStampedFile({ content, stamp: entry.base.blob }));
  const result = await withProjectionLock(target.location, async session => {
    const root = await bindProjectionRoot({ checkout: target.checkout, store: target.h.store, location: target.location,
      configuration: target.configuration, ports: target.ports, actor: "andrew@machine", history: createHistoryMemo(target.h.store), session, register: false });
    return root.takeIn({ checkout: target.checkout, path, copy: null, entry, base: { kind: "stamp", stamp: entry.base.blob } });
  });
  expect(result).toMatchObject({ status: "done", value: { answer: "taken-in" } });
  expect(success(await target.h.store.read({ reference: target.primary.reference })).content).toBe(content);
});

it("refreshes a held root's layout in place and drops its old path when the checkout moves", async () => {
  const target = await sibling();
  await readCheckoutLayoutContext(target.checkout);
  const bound = await bindTarget(target);
  if (bound.status !== "done") throw new Error("binding failed");
  const root = bound.value;
  root.copies.push({ path: target.h.path, copy: "kept-copy" });
  await writeWorktreeMarker(target.checkout, { spawnedByArc: true, spawningIdentity: "andrew", createdAt: "2026-11-10T00:00:00Z",
    createdFor: boundWorkUnitSubject(await seed(target.h, target.h.reference("work-item/meta", "next"), makeMetaFixture("work-item-next", {
      owner: "andrew", state: "Active", workClass: "Light", priority: "P1", currentWorkflow: "process-task-loop" }))) });
  await readCheckoutLayoutContext(target.checkout);
  await writeFile(join(target.checkout, ".arc/system/arc-config.yml"), "layout.active: nested\n");
  const notRegistered = await bindTarget(target, false);
  expect(notRegistered).toMatchObject({ status: "done", value: { claim: "work-item-next", layoutActive: "nested" } });
  await refreshProjectionRootLayout(root);
  expect(projectionProcessState().roots.get(target.checkout)).toBe(root);
  expect(root).toMatchObject({ claim: "work-item-next", layoutActive: "nested", copies: [{ copy: "kept-copy" }] });
  expect(projectionProcessState().roots.get(target.checkout)).toBe(root);
  notifyCheckoutChange({ kind: "move", from: target.checkout, to: target.checkout + "-moved" });
  expect(projectionProcessState().roots.has(target.checkout)).toBe(false);
  expect(projectionProcessState().diagnostics.at(-1)?.mark.reason).toContain("moved");
});

it("resolves the command actor through its located common directory and shares it with sibling bindings", async () => {
  const target = await sibling();
  beginProjectionCommand();
  const identity = target.configuration.identity;
  if (identity.status !== "identified") throw new Error("identity missing");
  const actor = await resolveProjectionActor(target.h.ports(), target.location, identity.identity);
  expect(actor).toMatch(/^andrew@[a-f0-9-]{36}$/);
  expect(await resolveProjectionActor({ ...target.ports, actor: async () => { throw new Error("actor must be shared"); } },
    target.location, identity.identity)).toBe(actor);
  expect((await readFile(join(target.location.commonDir, "arc/user/andrew/.internal/.machine-id"), "utf8")).trim()).toBe(actor.split("@")[1]);
});

it("prepares a read-only take-in without sending, taking a lease, registering, or creating a machine id", async () => {
  const target = await sibling();
  beginProjectionCommand();
  const entry = target.index.entries[target.h.path];
  if (entry?.kind !== "record") throw new Error("missing record");
  const edited = renderStampedFile({ content: "read-only edit\n", stamp: entry.base.blob });
  await writeFile(join(target.checkout, target.h.path), edited);
  const version = success(await target.h.store.version());
  const roots = [...projectionProcessState().roots];
  const root = await bindReadOnlyProjectionRoot({ checkout: target.checkout, store: target.h.store, location: target.location,
    configuration: target.configuration, ports: target.ports, history: createHistoryMemo(target.h.store) });
  expect(root.context.actor).toBe("andrew");
  expect(await root.takeIn({ checkout: target.checkout, path: target.h.path, copy: null, entry,
    base: { kind: "stamp", stamp: entry.base.blob } })).toMatchObject({ kind: "ready" });
  expect(success(await target.h.store.version())).toBe(version);
  expect(await readFile(join(target.checkout, target.h.path), "utf8")).toBe(edited);
  expect([...projectionProcessState().roots]).toEqual(roots);
  await expect(access(join(target.location.commonDir, "arc/user/andrew/.internal/.machine-id"))).rejects.toMatchObject({ code: "ENOENT" });
  await expect(access(join(target.location.stateDir, "lock"))).rejects.toMatchObject({ code: "ENOENT" });
});


it("keeps serialization failures provisional and prepares again after the edit is repaired", async () => {
  const target = await sibling();
  const entry = target.index.entries[target.h.path];
  if (entry?.kind !== "record") throw new Error("missing record");
  const root = await bindReadOnlyProjectionRoot({ checkout: target.checkout, store: target.h.store, location: target.location,
    configuration: target.configuration, ports: target.ports, history: createHistoryMemo(target.h.store) });
  const request = { checkout: target.checkout, path: target.h.path, copy: null, entry,
    base: { kind: "stamp" as const, stamp: entry.base.blob } };
  const version = success(await target.h.store.version());
  await writeFile(join(target.checkout, target.h.path), renderStampedFile({ content: "invalid\0bytes\n", stamp: entry.base.blob }));
  expect(await root.takeIn(request)).toMatchObject({ kind: "refused", refusal: { rule: "store.text-only" } });
  await writeFile(join(target.checkout, target.h.path), renderStampedFile({ content: "repaired bytes\n", stamp: entry.base.blob }));
  expect(await root.takeIn(request)).toMatchObject({ kind: "ready" });
  expect(success(await target.h.store.version())).toBe(version);
});

it("retains the bound marker UID beside a layout cache that still identifies unindexed companions", async () => {
  const target = await sibling();
  await writeFile(join(target.checkout, ".arc/system/arc-config.yml"), "layout.active: nested\n");
  const bound = await bindTarget(target);
  if (bound.status !== "done") throw new Error("Binding failed");
  const owner = target.primary.reference.owner;
  if (owner.type !== "work-item" || owner.uid === undefined) throw new Error("Missing bound work-item UID");
  expect(bound.value).toMatchObject({ claim: owner.name, claimUid: owner.uid });
  const layout = await readCheckoutLayoutContext(target.checkout);
  expect(layout).toEqual({ claim: target.primary.reference.owner.name, layoutActive: "nested" });
  expect(identifyArcFileAddress(".arc/active/current/assessment-work-item-target.md", { active: layout }))
    .toMatchObject({ kind: "work-unit-companion" });
});
