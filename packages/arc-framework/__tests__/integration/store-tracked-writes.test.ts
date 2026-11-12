/** Tracked writes observed through actual files, locks and Git index state. */
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanupTempDir, createTempRepo, makeGitExec, makeGitExecInput } from "../helpers/integration.js";
import { testStorePorts } from "../helpers/store/in-repo-ports.js";
import { createStore } from "../../src/lib/store/create.js";
import { withTrackedWriteLock } from "../../src/lib/store/tracked-lock.js";
import { digestBytes } from "../../src/lib/kernel/canonical/canonical-json.js";
import { OwnerIdentitySchema, recordReferences, RecordVersionSchema } from "../../src/lib/store/identity.js";
import { success } from "../helpers/store/suite-tools.js";
import { acquireAdvisoryLock, releaseAdvisoryLock } from "../../src/lib/advisory-lock.js";
import { resolveCheckoutGitDir } from "../../src/lib/git/exec.js";
import { TRACKED_WRITE_LOCK_FILENAME } from "../../src/lib/store/tracked-lock.js";
import { ArcError } from "../../src/lib/kernel/errors.js";

let repository: string | undefined;
afterEach(async () => { if (repository !== undefined) await cleanupTempDir(repository); repository = undefined; });
async function harness() {
  repository = await createTempRepo("arc-store-write-");
  const root = repository;
  const exec = makeGitExec(root);
  const ports = testStorePorts(root, exec, makeGitExecInput(root));
  ports.locks.tracked = (operation) => withTrackedWriteLock({ exec, checkoutRoot: root }, operation);
  const reference = recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: "example" }));
  const path = join(root, ".arc/active/meta-example.md");
  await mkdir(join(root, ".arc/active"), { recursive: true });
  return { root, exec, store: createStore(ports), ports, reference, path };
}
const provenance = { verb: "edit", lifecycleAction: "edit" };
function digest(content: string) { return RecordVersionSchema.parse(digestBytes(Buffer.from(content))); }

describe("tracked record writes", () => {
  it("replaces exact bytes against their current digest and leaves the staged index unchanged", async () => {
    const h = await harness();
    await writeFile(h.path, "original bytes");
    await h.exec("git", ["add", ".arc/active/meta-example.md"]);
    const index = (await h.exec("git", ["ls-files", "--stage"])).stdout;
    const input = { action: "put" as const, reference: h.reference, content: "replacement bytes", expected: digest("original bytes"),
      placement: { kind: "active" as const }, provenance };
    const result = success(await h.store.write(input));
    expect(await readFile(h.path, "utf8")).toBe(input.content);
    expect(result.version).toBe(digest(input.content));
    expect((await h.exec("git", ["ls-files", "--stage"])).stdout).toBe(index);
  });

  it("admits one concurrent update and repairs the stale write by reading and re-applying", async () => {
    const h = await harness();
    await writeFile(h.path, "original bytes");
    const input = { action: "put" as const, reference: h.reference, expected: digest("original bytes"), placement: { kind: "active" as const }, provenance };
    const results = await Promise.all([h.store.write({ ...input, content: "first" }), h.store.write({ ...input, content: "second" })]);
    expect(results.filter((result) => result.status === "ok")).toHaveLength(1);
    expect(results.find((result) => result.status === "refused")).toMatchObject({ refusal: { code: "version-conflict", records: [h.reference] } });
    const current = success(await h.store.read({ reference: h.reference }));
    const repaired = success(await h.store.write({ ...input, content: "re-applied", expected: current.version }));
    expect(repaired.version).toBe(digest("re-applied"));
    expect(await readFile(h.path, "utf8")).toBe("re-applied");
  });

  it("keeps a stale removal intact and deletes it after reading its current version", async () => {
    const h = await harness();
    await writeFile(h.path, "current bytes");
    const input = { action: "remove" as const, reference: h.reference, expected: digest("older bytes"), provenance };
    expect(await h.store.write(input)).toMatchObject({ status: "refused", refusal: { code: "version-conflict", records: [h.reference] } });
    expect(await readFile(h.path, "utf8")).toBe("current bytes");
    const current = success(await h.store.read({ reference: h.reference }));
    const removed = success(await h.store.write({ ...input, expected: current.version }));
    expect(removed).not.toHaveProperty("version");
    await expect(access(h.path)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("returns the actual tracked-lock timeout and writes successfully after its holder releases", async () => {
    const h = await harness();
    await writeFile(h.path, "original");
    const lock = join(await resolveCheckoutGitDir(h.exec, h.root), TRACKED_WRITE_LOCK_FILENAME);
    const holder = await acquireAdvisoryLock(lock);
    const input = { action: "put" as const, reference: h.reference, content: "after release", expected: digest("original"), placement: { kind: "active" as const }, provenance };
    h.ports.locks.tracked = (operation) => withTrackedWriteLock({ exec: h.exec, checkoutRoot: h.root, options: { maxWaitMs: 15 } }, operation);
    try {
      expect(await h.store.write(input)).toMatchObject({ status: "refused", refusal: { code: "lock-held", lock } });
      expect(await readFile(h.path, "utf8")).toBe("original");
    } finally { await releaseAdvisoryLock(holder); }
    success(await h.store.write(input));
    expect(await readFile(h.path, "utf8")).toBe(input.content);
  });

  it("preserves a message-only lock failure as an I/O error", async () => {
    const h = await harness();
    const failure = new Error("Lock remained held: AdvisoryLockTimeoutError");
    h.ports.locks.tracked = async () => { throw failure; };
    await expect(h.store.write({ action: "put", reference: h.reference, content: "untouched", expected: null,
      placement: { kind: "active" }, provenance })).rejects.toMatchObject({ cause: failure });
    await expect(h.store.write({ action: "remove", reference: h.reference, expected: digest("missing"), provenance })).rejects.toBeInstanceOf(ArcError);
  });
});
