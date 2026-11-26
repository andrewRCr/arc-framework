/** The per-user file set a person's setup leaves, as the store holds and projects it. */

import { access } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { readStoreRecord } from "../helpers/store/seed-store.js";
import { git, runArc } from "./helpers.js";

/** Expect the store to hold both of the named person's seed records. */
export async function expectStoredPersonalFileSet(root: string, identity: string): Promise<void> {
  const person = OwnerIdentitySchema.parse({ type: "person", name: identity });
  for (const kind of ["personal/working-memory", "personal/inbox"] as const) {
    const held = await readStoreRecord(root, SlugSchema.parse(identity), recordReferences[kind](person));
    expect(held.reference.kind).toBe(kind);
  }
}

/**
 * Expect the store to hold a person's working memory and inbox, as `arc init`, `arc join`, and `arc user add` seed
 * them, and a command run as that person to project both to their files under the person's user directory. The
 * checkout's configured identity becomes that person.
 * @param root - The repository's checkout.
 * @param identity - The person the setup seeded.
 */
export async function expectPersonalFileSet(root: string, identity: string): Promise<void> {
  await expectStoredPersonalFileSet(root, identity);
  await git(root, ["config", "arc.identity", identity]);
  const projected = await runArc(["status", "--json"], root);
  expect(projected.exitCode, projected.stdout + projected.stderr).toBe(0);
  for (const file of ["WORKING-MEMORY.md", "USER-INBOX.md"]) {
    await expect(access(join(root, ".arc", "user", identity, file)), file).resolves.toBeUndefined();
  }
}
