/** Real notes, identity refs, locks and remote failures for Store sync scenarios. */
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { onTestFinished } from "vitest";
import { setupMultiClone } from "../multi-clone.js";
import { makeGitExec, makeGitExecInput } from "../integration.js";
import { createStore } from "../../../src/lib/store/create.js";
import { createDefaultStorePorts } from "../../../src/lib/store/default-ports.js";
import { OwnerIdentitySchema, recordReferences } from "../../../src/lib/store/identity.js";
import { TransientIdentityRecordSchema, serializeTransientIdentityRecord } from "../../../src/lib/errand/identity-record.js";
import { errandsRef } from "../../../src/lib/errand/ref-tree.js";
import { withAdvisoryLock } from "../../../src/lib/advisory-lock.js";
import { getNotesLockPath } from "../../../src/lib/user-sync/notes-lock.js";
import { success } from "./suite-tools.js";

export const syncIdentity = "andrew";
export const syncNotesRef = "refs/notes/arc/user/andrew";
export const syncErrandRef = errandsRef(syncIdentity);
export const syncProvenance = { verb: "user", lifecycleAction: "save" };
export const syncInbox = recordReferences["personal/inbox"](OwnerIdentitySchema.parse({ type: "person", name: syncIdentity }));
export const syncErrand = recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: "alpha" }));

export function syncRecord(intent = "original") {
  const record = TransientIdentityRecordSchema.parse({ version: 3, kind: "errand", slug: "alpha", claimId: "a".repeat(32),
    purpose: "errand", origin: "description", originEntry: null, intent, branch: "chore/alpha", state: "open",
    savedHead: null, changeRequest: null, createdAt: "2026-07-18T00:00:00.000Z", updatedAt: "2026-07-18T00:00:00.000Z" });
  if (record.kind !== "errand" || record.purpose !== "errand" || record.state !== "open") throw new Error("Expected an ordinary open Errand fixture");
  return record;
}
export function syncPut(intent = "original", expected: Parameters<ReturnType<typeof createStore>["write"]>[0]["expected"] = null) {
  return { action: "put" as const, reference: syncErrand, expected, content: serializeTransientIdentityRecord(syncRecord(intent)),
    placement: { kind: "active" as const }, provenance: syncProvenance };
}
export async function syncFixture() {
  const topology = await setupMultiClone({ cloneA: { config: { "arc.identity": syncIdentity } }, cloneB: { config: { "arc.identity": syncIdentity } } });
  onTestFinished(topology.cleanup);
  const a = await syncCheckout(topology.cloneA);
  const b = await syncCheckout(topology.cloneB);
  return { ...topology, a, b, remote: makeGitExec(topology.origin),
    async rejectIdentity() {
      const path = join(topology.origin, "hooks/pre-receive");
      await writeFile(path, `#!/bin/sh\nwhile read old new ref; do\n  case "$ref" in\n    ${syncErrandRef}) echo 'identity policy rejects publish' >&2; exit 1;;\n  esac\ndone\nexit 0\n`, { mode: 0o755 });
      return async () => unlink(path);
    } };
}
async function syncCheckout(root: string) {
  const exec = makeGitExec(root);
  const execInput = makeGitExecInput(root);
  const ports = createDefaultStorePorts({ checkoutRoot: root, exec, execInput });
  const lockPath = await getNotesLockPath(exec, root, syncIdentity);
  ports.locks.notes = (operation) => withAdvisoryLock(lockPath, operation, { maxWaitMs: 100 });
  return { root, exec, execInput, ports, store: createStore(ports), lockPath,
    async file(key: string, content: string) { const path = join(root, ".arc/user/andrew", key); await mkdir(dirname(path), { recursive: true }); await writeFile(path, content); },
    async inbox(content = "# User Inbox\n\nPersonal content.\n") {
      const existing = await ports.fs.readFile(join(root, ".arc/user/andrew/USER-INBOX.md")).catch(() => null);
      const expected = existing === null ? null : success(await createStore(ports).read({ reference: syncInbox })).version;
      success(await createStore(ports).write({ action: "put", reference: syncInbox, expected, content, provenance: syncProvenance }));
    } };
}
export async function seedAheadErrand(h: Awaited<ReturnType<typeof syncFixture>>) {
  success(await h.a.store.write(syncPut()));
  const before = (await h.remote("git", ["rev-parse", syncErrandRef])).stdout;
  const release = await h.rejectIdentity();
  try {
    const current = success(await h.a.store.read({ reference: syncErrand }));
    const result = await h.a.store.write(syncPut("local ahead", current.version));
    if (result.status !== "refused" || result.refusal.code !== "refused") throw new Error("Expected actual identity host refusal");
  } finally { await release(); }
  const after = (await h.remote("git", ["rev-parse", syncErrandRef])).stdout;
  if (after !== before) throw new Error("Rejected identity publication changed the remote ref");
  return before;
}
