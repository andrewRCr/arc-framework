/** Real user-surface and machine-lock dependencies for personal store behavior. */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { onTestFinished } from "vitest";
import { createTempRepo, cleanupTempDir, makeGitExec, makeGitExecInput } from "../integration.js";
import { createStore } from "../../../src/lib/store/create.js";
import { createDefaultStorePorts } from "../../../src/lib/store/default-ports.js";
import { OwnerIdentitySchema, RecordReferenceSchema, RecordVersionSchema } from "../../../src/lib/store/identity.js";
import { digestBytes } from "../../../src/lib/kernel/canonical/canonical-json.js";
import { withAdvisoryLock } from "../../../src/lib/advisory-lock.js";
import { getNotesLockPath } from "../../../src/lib/user-sync/notes-lock.js";
import type { KindId } from "../../../src/lib/store/catalog.js";

export const personalProvenance = { verb: "user", lifecycleAction: "Update personal content" };
export const inboxBytes = "# USER-INBOX\r\n\r\n## Errand\r\n\r\n### **First capture**\r\n\r\n- _Description:_ Do the first thing.\r\n\r\n### **Second capture**\r\n\r\n- _Description:_ Do the next thing.\r\n\r\n## Work Unit\r\n\r\n";

export function personalDigest(content: string) { return RecordVersionSchema.parse(digestBytes(Buffer.from(content))); }

export function personalReference(kind: KindId, key?: string, name = "andrew") {
  return RecordReferenceSchema.parse({ kind, owner: OwnerIdentitySchema.parse({ type: "person", name }),
    ...(key === undefined ? {} : { key }) });
}

export async function personalFixture() {
  const root = await createTempRepo("arc-personal-store-");
  onTestFinished(async () => cleanupTempDir(root));
  const exec = makeGitExec(root);
  await exec("git", ["config", "arc.identity", "andrew"]);
  await exec("git", ["commit", "--allow-empty", "-m", "Initialize personal fixture"]);
  const ports = createDefaultStorePorts({ checkoutRoot: root, exec, execInput: makeGitExecInput(root) });
  const lockPath = await getNotesLockPath(exec, root, "andrew");
  ports.locks.notes = (operation) => withAdvisoryLock(lockPath, operation, { maxWaitMs: 100 });
  const path = (key: string) => join(root, ".arc/user/andrew", key);
  return { root, exec, ports, store: createStore(ports), lockPath, path,
    async plant(key: string, content: string) { await mkdir(dirname(path(key)), { recursive: true }); await writeFile(path(key), content); } };
}
