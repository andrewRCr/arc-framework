/** First personal records and identity reuse over the selected person's Store. */
import { basename, join } from "node:path";
import { createPersonalCommandStore } from "./store/personal-command-store.js";
import { mutatePersonalRecord } from "./store/personal-mutation.js";
import { OwnerIdentitySchema, recordReferences } from "./store/identity.js";
import type { Store } from "./store/contract.js";
import type { StoreResult } from "./store/refusal.js";
import type { CoreIO } from "./types.js";
import { resolveArcPath } from "./layout/index.js";
import { SlugSchema } from "./kernel/index.js";
import { ArcError } from "./kernel/errors.js";
import { UserFacingError } from "./errors.js";

const PERSONAL_IDENTITY_KINDS = ["personal/working-memory", "personal/inbox"] as const;

/** Optional selected backend and the verb's declared confirmation boundary. */
export interface PersonalIdentitySetupOptions {
  store?: Store;
  confirmIdentityInUse?: (identity: string) => Promise<boolean>;
}
/** A confirmation already completed before the caller performs setup writes. */
export interface PreparedPersonalIdentitySetup { store: Store }
/** Open the state source with an explicit identity, even before arc.identity is configured. */
export function openPersonalIdentityStore(cwd: string, exec: CoreIO["exec"], identity: string): Store {
  return createPersonalCommandStore(cwd, exec, identity);
}
/** Report existing personal records before any identity or record write. */
export async function preparePersonalIdentitySetup(input: PersonalIdentitySetupOptions & {
  cwd: string; io: CoreIO; identity: string; command: "add" | "init" | "join";
}): Promise<PreparedPersonalIdentitySetup | null> {
  const store = input.store ?? openPersonalIdentityStore(input.cwd, input.io.exec, input.identity);
  if (!store.capabilities.stateOffBranch) return null;
  const owner = OwnerIdentitySchema.parse({ type: "person", name: input.identity });
  let present = false;
  for (const reference of [recordReferences["personal/inbox"](owner), recordReferences["personal/working-memory"](owner)]) {
    const read = await store.read({ reference });
    if (read.status === "ok") present = true;
    else if (read.refusal.code !== "not-found") unwrap(read);
  }
  if (present && input.confirmIdentityInUse !== undefined && !await input.confirmIdentityInUse(input.identity)) {
    throw new UserFacingError({ code: "identity.in-use", whatHappened: `Identity '${input.identity}' was not confirmed`,
      why: "Setup stopped before changing the configured identity or personal records.",
      whatToDo: input.command === "add" ? "Choose another identity with 'arc user add <name>'."
        : `Run 'arc ${input.command}' again with '--identity <name>' to choose another identity.` });
  }
  return { store };
}
/** Create both seeds using absent-only writes; a concurrent first setup is also preserved. */
export async function seedPersonalIdentityRecords(input: {
  prepared: PreparedPersonalIdentitySetup; identity: string; io: CoreIO; internalTemplateDir: string;
}): Promise<void> {
  const owner = OwnerIdentitySchema.parse({ type: "person", name: input.identity });
  for (const kind of PERSONAL_IDENTITY_KINDS) {
    const reference = recordReferences[kind](owner);
    const identity = SlugSchema.parse(input.identity);
    const path = kind === "personal/inbox"
      ? resolveArcPath({ kind: "inbox", scope: { kind: "identity", identity } })
      : resolveArcPath({ kind: "user-document", identity, document: { kind: "working-memory" } });
    const filename = basename(path);
    const content = await input.io.readFile(join(input.internalTemplateDir, "user", filename));
    if (!input.prepared.store.capabilities.stateOffBranch) {
      unwrap(await mutatePersonalRecord({ store: input.prepared.store, reference, verb: "identity-setup",
        mutate: () => ({ result: undefined, replacement: content }),
      }));
      continue;
    }
    const write = await input.prepared.store.write({ action: "put", reference, content, expected: null,
      provenance: { verb: "identity-setup", lifecycleAction: "create" } });
    if (write.status === "ok") continue;
    if (write.refusal.code === "version-conflict") {
      const existing = await input.prepared.store.read({ reference });
      if (existing.status === "ok") continue;
    }
    unwrap(write);
  }
}
function unwrap<T>(result: StoreResult<T>): T {
  if (result.status === "ok") return result.result;
  throw new ArcError(`${result.refusal.condition} ${result.refusal.remedy.text}`, "identity.setup-refused", { cause: result.refusal });
}
