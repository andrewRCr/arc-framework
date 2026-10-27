/** Local executor defects survive standalone and nested state transport boundaries. */
import { describe, expect, it } from "vitest";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import type { RefStorePorts } from "../../src/lib/store/ports.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { switchFixture, projectId, identity, provenance } from "../helpers/store/remote-move.js";
import { refCarryFixture, carriedBranch, carriedDocument } from "../helpers/store/ref-carry.js";

const personal = (key: string) => RecordReferenceSchema.parse({ kind: "personal/document", key, owner: { type: "person", name: "andrew" } });

function fault(base: RefStorePorts, operation: "fetch" | "push") {
  const failure = new TypeError(`Cannot initialize the local ${operation} executor`);
  let broken = true;
  const ports: RefStorePorts = { ...base, exec: async (command, args, options) => {
    if (broken && args.includes(operation)) throw failure;
    return base.exec(command, args, options);
  } };
  return { ports, failure, repair: () => { broken = false; } };
}

describe.each(["default", "separate"] as const)("local sync transport failures in %s", layout => {
  it.each(["pull", "push"] as const)("propagates a %s executor defect and preserves the unpublished record for retry", async operation => {
    const h = await refSyncFixture(layout), pending = personal("pending.md"), incoming = personal("incoming.md");
    success(await h.a.store.write({ action: "put", reference: personal("base.md"), expected: null, content: "Shared baseline.\n", provenance }));
    success(await h.a.store.push());
    success(await h.b.store.pull());
    success(await h.b.store.write({ action: "put", reference: pending, expected: null, content: "Unpublished local content.\n", provenance }));
    success(await h.a.store.write({ action: "put", reference: incoming, expected: null, content: "Incoming content.\n", provenance }));
    success(await h.a.store.push());
    const injected = fault(h.b.ports, operation === "pull" ? "fetch" : "push"), store = createRefStore(injected.ports);
    await expect(store[operation]()).rejects.toBe(injected.failure);
    expect(success(await store.read({ reference: pending })).content).toBe("Unpublished local content.\n");
    injected.repair();
    success(await store[operation]());
    expect(success(await store.read({ reference: incoming })).content).toBe("Incoming content.\n");
    success(await store.push());
    success(await h.a.store.pull());
    expect(success(await h.a.store.read({ reference: pending })).content).toBe("Unpublished local content.\n");
  }, 60_000);
});

it.each(["default", "separate"] as const)("keeps a %s carried publication's local defect out of remote classifications", async layout => {
  const h = await refCarryFixture(layout), injected = fault(h.a.ports, "push"), store = createRefStore(injected.ports);
  await expect(store.push({ carry: { ref: carriedBranch } })).rejects.toBe(injected.failure);
  expect(success(await store.read({ reference: carriedDocument })).content).toBe("Carried state.\n");
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", carriedBranch])).stdout).toBe("");
  injected.repair();
  const retried = success(await store.push({ carry: { ref: carriedBranch } }));
  expect(retried.carry).toEqual({ ref: carriedBranch, status: "pushed" });
  expect((await h.remote("git", ["rev-parse", carriedBranch])).stdout.trim()).toBe(h.code.tip);
  success(await h.b.store.pull());
  expect(success(await h.b.store.read({ reference: carriedDocument })).content).toBe("Carried state.\n");
}, 60_000);

it.each(["automatic", "setting"] as const)("propagates a local %s designation defect and leaves its role ungranted until repair", async entry => {
  const h = await refSyncFixture();
  for (const client of [h.a, h.b]) success(await client.store.write({ action: "put", reference: identity, expected: null,
    content: JSON.stringify({ projectId }), provenance }));
  success(await h.a.store.write({ action: "put", reference: personal("observed.md"), expected: null, content: "Published observation.\n", provenance }));
  success(await h.a.store.push());
  await h.b.exec("git", ["config", "--unset", "remote.origin.arc-state"]);
  const injected = fault(h.b.ports, "fetch"), store = createRefStore(injected.ports);
  const run = async () => entry === "automatic" ? store.pull()
    : (await invokeStoreRemote(["origin", "push", "--json"], { cwd: h.b.root, ports: injected.ports })).result;
  await expect(run()).rejects.toBe(injected.failure);
  expect((await h.b.exec("git", ["config", "--list"])).stdout).not.toContain("remote.origin.arc-state");
  expect((await h.b.git(["for-each-ref", "--format=%(refname)", "refs/arc/tmp/designate/"])).stdout).toBe("");
  injected.repair();
  expect((await run()).status).toBe("ok");
  success(await store.pull());
  expect((await h.b.exec("git", ["config", "remote.origin.arc-state"])).stdout.trim()).toBe("push");
  expect(success(await store.read({ reference: personal("observed.md") })).content).toBe("Published observation.\n");
}, 60_000);

it.each((["code", "backing"] as const).flatMap(source => (["fetch", "push"] as const).map(operation => ({ source, operation }))))(
  "propagates a local migration $operation defect from $source and resumes with the original pending state", async ({ source, operation }) => {
  const h = await switchFixture(source, source === "code" ? "backing" : "code"), injected = fault(h.ports, operation);
  await expect(invokeStoreMigrate(["--to", h.to], injected.ports)).rejects.toBe(injected.failure);
  expect(success(await createRefStore(injected.ports).read({ reference: h.pending })).content).toBe("Pending local state.\n");
  injected.repair();
  const active = (await h.a.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout.trim();
  expect((await invokeStoreMigrate(active ? [] : ["--to", h.to], injected.ports)).status).toBe("ok");
  success(await createRefStore(injected.ports).push());
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "grep", "-F", "Pending local state.", "refs/arc/user/andrew/personal"])).stdout)
    .toContain("Pending local state.");
}, 60_000);
