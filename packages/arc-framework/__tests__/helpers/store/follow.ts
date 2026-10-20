/** Native followers retain unpublished state while a different clone moves the shared project. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import { SlugSchema } from "../../../src/lib/kernel/index.js";
import { createStoreCommandPorts } from "../../../src/commands/store-ports.js";
import { createRefStore, RecordReferenceSchema } from "../../../src/lib/store/index.js";
import { switchFixture, personal, provenance, capturePeerState, landPreparedOldPush } from "./remote-move.js";
import { invokeStoreMigrate } from "./migrate-command.js";
import { success } from "./suite-tools.js";

export async function followFixture(beforeMove?: (h: Awaited<ReturnType<typeof switchFixture>>) => Promise<void>, source: "code" | "backing" = "code") {
  const h = await switchFixture(source, "backing");
  success(await h.b.store.pull());
  const config = join(h.b.root, ".arc", "system", "arc-config.yml");
  await mkdir(join(h.b.root, ".arc", "system"), { recursive: true });
  await writeFile(config, "# The invoking checkout's pointer.\n" + (source === "backing" ? `storage.backing_repository: ${JSON.stringify(h.origin)}\n` : ""));
  const production = createStoreCommandPorts(h.b.root);
  const ports = { ...production, ...h.b.ports, backingRepository: production.backingRepository };
  const store = createRefStore(ports);
  const unpublished = RecordReferenceSchema.parse({ ...personal, key: "follower-only.md" });
  success(await store.write({ action: "put", reference: unpublished, expected: null, content: "Unpublished follower data.\n", provenance }));
  await beforeMove?.(h);
  expect((await invokeStoreMigrate(["--to", h.to], h.ports)).status).toBe("ok");
  expect(success(await store.pull()).states).toContainEqual(expect.objectContaining({ status: "moved", remote: h.sourceName }));
  const pointer = `# The invoking checkout's pointer.\nstorage.backing_repository: ${JSON.stringify(h.destinationDirectory)}\n`;
  await writeFile(config, pointer);
  return { ...h, follower: { ...h.b, ports, store, config, pointer, unpublished } };
}


/** Prepare a new identity's push before the move, then land it after its final source listing. */
export async function lateFollowFixture(land = true, source: "code" | "backing" = "code") {
  let before = new Map<string, string>(), after = new Map<string, string>();
  const late = RecordReferenceSchema.parse({ ...personal, owner: { type: "person", name: "beth" }, key: "late.md" });
  const h = await followFixture(async fixture => {
    before = await capturePeerState(fixture);
    const beth = createRefStore({ ...fixture.b.ports, identity: async () => SlugSchema.parse("beth") });
    success(await beth.write({ action: "put", reference: late, expected: null, content: "Prepared late publication.\n", provenance }));
    after = await capturePeerState(fixture);
  }, source);
  const landLate = async (): Promise<void> => landPreparedOldPush(h, before, after);
  if (land) await landLate();
  return { ...h, late, landLate };
}
