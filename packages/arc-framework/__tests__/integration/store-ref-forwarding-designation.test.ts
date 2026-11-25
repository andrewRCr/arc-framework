/** A prospective state publisher is checked against its standalone forwarding record. */
import { expect, it } from "vitest";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { success } from "../helpers/store/suite-tools.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";

const forwardingRef = "refs/arc/project/moved";
const localId = "34567890-1234-4234-8234-123456789abc";
const foreignId = "abcdef01-1234-4234-8234-123456789abc";
const identity = RecordReferenceSchema.parse({ kind: "project-registry/identity", owner: { type: "project", name: "project" } });
const provenance = { verb: "init", lifecycleAction: "seed" };

it("refuses foreign and moved projects from forwarding alone without setting a role, then accepts the repaired remote", async () => {
  const h = await refSyncFixture();
  success(await h.b.store.write({ action: "put", reference: identity, expected: null, content: JSON.stringify({ projectId: localId }), provenance }));
  const before = success(await h.b.store.version());
  for (const projectId of [foreignId, localId]) {
    await h.b.git(["config", "remote.origin.arc-state", "off"]);
    await h.b.git(["config", "--unset", "remote.origin.arc-state"]);
    await plantRef(h.origin, forwardingRef, [{ path: "moved.json", content: JSON.stringify({ projectId, registryCommit: "a".repeat(40) }) }], { gitDir: h.origin });
    const result = (await invokeStoreRemote(["origin", "push", "--json"], { cwd: h.b.root, ports: h.b.ports })).result;
    if (projectId === foreignId) expect.soft(result).toMatchObject({ status: "refused", refusal: { code: "store", refusal: { code: "identity-mismatch",
      expected: { owner: { uid: localId } }, actual: { owner: { uid: foreignId } } } } });
    else {
      expect.soft(result).toMatchObject({ status: "refused", refusal: { code: "moved", remedy: { text: expect.stringContaining("arc store migrate --to origin") } } });
      expect.soft(JSON.stringify(result)).toContain("arc store migrate");
    }
    expect.soft((await h.b.git(["config", "--list"])).stdout).not.toContain("remote.origin.arc-state");
    expect.soft(success(await h.b.store.version())).toBe(before);
    expect.soft((await h.b.git(["for-each-ref", "--format=%(refname)", "refs/arc/tmp/designate/"])).stdout).toBe("");
  }
  await h.remote("git", ["update-ref", "-d", forwardingRef]);
  success(await h.a.store.write({ action: "put", reference: identity, expected: null, content: JSON.stringify({ projectId: localId }), provenance }));
  await h.a.git(["push", "origin", "refs/arc/project/registry:refs/arc/project/registry"]);
  expect((await invokeStoreRemote(["origin", "push", "--json"], { cwd: h.b.root, ports: h.b.ports })).result).toMatchObject({ status: "ok" });
  expect((await h.b.git(["config", "--get", "remote.origin.arc-state"])).stdout.trim()).toBe("push");
}, 30_000);

it("keeps automatic designation unset at a moved remote and retries successfully after repair", async () => {
  const h = await refSyncFixture();
  for (const checkout of [h.a, h.b]) success(await checkout.store.write({ action: "put", reference: identity, expected: null,
    content: JSON.stringify({ projectId: localId }), provenance }));
  await h.a.git(["push", "origin", "refs/arc/project/registry:refs/arc/project/registry"]);
  await plantRef(h.origin, forwardingRef, [{ path: "moved.json", content: JSON.stringify({ projectId: localId, registryCommit: "a".repeat(40) }) }], { gitDir: h.origin });
  await h.b.git(["config", "--unset", "remote.origin.arc-state"]);
  const before = success(await h.b.store.version());
  const pulled = success(await h.b.store.pull());
  expect(pulled.pulls).toContainEqual(expect.objectContaining({ remote: "origin", role: "candidate", status: "failed", failure: expect.objectContaining({ code: "refused", class: "terminal",
    remedy: expect.objectContaining({ text: expect.stringContaining("arc store migrate"), argv: ["arc", "store", "remote", "origin", "off"] }) }) }));
  expect((await h.b.git(["config", "--list"])).stdout).not.toContain("remote.origin.arc-state");
  expect(success(await h.b.store.version())).toBe(before);
  await h.remote("git", ["update-ref", "-d", forwardingRef]);
  expect(success(await h.b.store.pull()).pulls).toContainEqual(expect.objectContaining({ role: "state", status: "pulled" }));
  expect((await h.b.git(["config", "--get", "remote.origin.arc-state"])).stdout.trim()).toBe("push");
}, 30_000);

it("refuses malformed forwarding content without setting a role and accepts a repaired remote", async () => {
  const h = await refSyncFixture();
  success(await h.b.store.write({ action: "put", reference: identity, expected: null, content: JSON.stringify({ projectId: localId }), provenance }));
  await h.b.git(["config", "--unset", "remote.origin.arc-state"]);
  const before = success(await h.b.store.version());
  const valid = { projectId: localId, registryCommit: "a".repeat(40) };
  const payloads = [undefined, "invalid JSON", JSON.stringify({ ...valid, projectId: "invalid" }), JSON.stringify({ ...valid, registryCommit: "https://example.invalid/state" }),
    JSON.stringify({ ...valid, url: "https://example.invalid/state" }), JSON.stringify({ projectId: localId })];
  for (const content of payloads) {
    await plantRef(h.origin, forwardingRef, content === undefined ? [] : [{ path: "moved.json", content }], { gitDir: h.origin });
    const result = (await invokeStoreRemote(["origin", "push", "--json"], { cwd: h.b.root, ports: h.b.ports })).result;
    expect.soft(result).toMatchObject({ status: "refused", refusal: { code: "move-record-malformed", condition: expect.stringContaining(forwardingRef),
      remedy: { text: expect.stringMatching(/repair or delete/iu) } } });
    expect.soft((await h.b.git(["config", "--list"])).stdout).not.toContain("remote.origin.arc-state");
    expect.soft(success(await h.b.store.version())).toBe(before);
  }
  await h.remote("git", ["update-ref", "-d", forwardingRef]);
  expect((await invokeStoreRemote(["origin", "push", "--json"], { cwd: h.b.root, ports: h.b.ports })).result).toMatchObject({ status: "ok" });
}, 30_000);
