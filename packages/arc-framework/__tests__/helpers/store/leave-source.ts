/** A deleted source leaves a follower holding a newer published end than the move copied. */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import { createStoreCommandPorts } from "../../../src/commands/store-ports.js";
import { createRefStore, HistoryRefSchema, RecordReferenceSchema } from "../../../src/lib/store/index.js";
import { makeMetaFixture } from "../meta-fixture.js";
import { switchFixture, personal, provenance, capturePeerState, landPreparedOldPush } from "./remote-move.js";
import { abandonRemoteWork } from "./remote-lifecycle.js";
import { invokeStoreMigrate } from "./migrate-command.js";
import { success } from "./suite-tools.js";

/** Publish after the copy, acquire the resulting tracking view, then remove the actual bare source. */
export async function deletedFollowSource() {
  const h = await switchFixture();
  const created = success(await h.store.write({ action: "put", expected: null,
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "ended-at-deleted-source" } }),
    content: makeMetaFixture("ended-at-deleted-source"), placement: { kind: "active" }, provenance }));
  success(await h.store.push()); success(await h.b.store.pull());
  let lateEnd = "";
  await expect(invokeStoreMigrate(["--to", h.to], { ...h.ports, migrateStep: async step => {
    if (step !== "remote.switched") return;
    await h.b.git(["fetch", "--refmap=", "--no-tags", "--", h.origin, "refs/arc/project/registry:refs/arc/project/registry"]);
    const before = await capturePeerState(h);
    lateEnd = await abandonRemoteWork(h, h.b.store, created.reference, h.b, "late-source-end");
    await landPreparedOldPush(h, before, await capturePeerState(h));
    throw new Error("Paused mover before late-end cleanup");
  } })).rejects.toThrow("Paused mover before late-end cleanup");
  const owner = created.reference.owner;
  if (owner.type !== "work-item" || !owner.uid) throw new Error("Expected a generation-bound ended item");
  const history = HistoryRefSchema.parse(`refs/arc/history/work/${owner.uid}`);
  expect(success(await h.b.store.pull({ history: [history] })).states).toContainEqual(expect.objectContaining({ status: "moved" }));
  await mkdir(join(h.b.root, ".arc", "system"), { recursive: true });
  const config = join(h.b.root, ".arc", "system", "arc-config.yml");
  const pointer = `# Updated follower checkout.\nstorage.backing_repository: ${JSON.stringify(h.destinationDirectory)}\n`;
  await writeFile(config, pointer);
  const production = createStoreCommandPorts(h.b.root);
  const ports = { ...production, ...h.b.ports, backingRepository: production.backingRepository };
  await rm(h.origin, { recursive: true, force: true });
  return { ...h, created, history, lateEnd, config, pointer,
    lineage: RecordReferenceSchema.parse({ kind: "lineage/transition", owner }), follower: { ...h.b, ports, store: createRefStore(ports) } };
}

/** Prepare a stale follower whose source is gone and whose checkout now identifies the destination. */
export async function missingSourceFixture(direction: "code-to-backing" | "backing-to-code" | "backing-to-backing" = "code-to-backing") {
  const directions = { "code-to-backing": ["code", "backing"], "backing-to-code": ["backing", "code"],
    "backing-to-backing": ["backing", "backing"] } as const;
  const [source, destination] = directions[direction];
  const h = await switchFixture(source, destination);
  success(await h.b.store.pull());
  const unpublished = RecordReferenceSchema.parse({ ...personal, key: "departure-only.md" });
  success(await h.b.store.write({ action: "put", reference: unpublished, expected: null,
    content: "Local departure data.\n", provenance }));
  expect((await invokeStoreMigrate(["--to", h.to], h.ports)).status).toBe("ok");
  if (destination === "code") await h.b.exec("git", ["remote", "set-url", "origin", h.destinationDirectory]);
  await mkdir(join(h.b.root, ".arc", "system"), { recursive: true });
  const config = join(h.b.root, ".arc", "system", "arc-config.yml");
  const pointer = "# Checkout naming the current home.\n" + (destination === "backing"
    ? `storage.backing_repository: ${JSON.stringify(h.destinationDirectory)}\n` : "");
  await writeFile(config, pointer);
  const production = createStoreCommandPorts(h.b.root);
  const ports = { ...production, ...h.b.ports, backingRepository: production.backingRepository };
  await rm(h.origin, { recursive: true, force: true });
  return { ...h, config, pointer, unpublished, to: destination === "code" ? "origin" : h.destinationDirectory,
    follower: { ...h.b, ports, store: createRefStore(ports) } };
}
