/** Give CLI-initialized lifecycle fixtures the personal records and index of an imported checkout. */
import { appendFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import type { Store } from "../../../../src/lib/store/contract.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { parseStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { seedProjection, type SeededFile } from "./seeded-projection.js";
import { success } from "../suite-tools.js";

export async function seedImportedUserProjection(checkout: string, store: Store, identity = "test-user"): Promise<void> {
  const owner = OwnerIdentitySchema.parse({ type: "person", name: identity });
  const files: SeededFile[] = [];
  for (const [filename, reference] of [
    ["USER-INBOX.md", recordReferences["personal/inbox"](owner)],
    ["WORKING-MEMORY.md", recordReferences["personal/working-memory"](owner)],
  ] as const) {
    const path = `.arc/user/${identity}/${filename}`, target = join(checkout, path);
    const current = await store.read({ reference });
    if (current.status === "refused") {
      if (current.refusal.code !== "not-found") throw new Error(JSON.stringify(current.refusal));
      const content = await readFile(target, "utf8").catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
      if (content === null) continue;
      success(await store.write({ action: "put", reference, expected: null, content: parseStampedFile(content).content,
        provenance: { verb: "import", lifecycleAction: "import" } }));
    }
    files.push({ path, reference });
    await rm(target, { force: true });
  }
  const projection = await seedProjection({ checkout, store, identity: SlugSchema.parse(identity), files });
  await appendFile(join(projection.location.commonDir, "info/exclude"),
    "\n.arc/active/\n.arc/backlog/\n.arc/completed/\n.arc/system/.local/\n");
}
