/** Identity namespace and existing user-surface addresses for personal records. */
import { basename, join } from "node:path";
import { SlugSchema, type Slug } from "../../kernel/schema/slug.js";
import { IDENTITY_STATUS_FILENAME, resolveUserSurfaceResolver, type UserSurfaceResolver } from "../../user-surfaces.js";
import { resolveArcPath } from "../../layout/index.js";
import { OwnerIdentitySchema, recordReferences, type RecordReference } from "../identity.js";
import { refuse } from "./refusals.js";
import type { InRepoContext } from "./context.js";

/** Require the identity whose machine notes lock protects this operation.
 * @param context - Lazy configured identity dependency.
 * @param reference - The record that could not be addressed without identity.
 * @returns Configured identity, preserving its original namespace.
 */
export async function personalIdentity(context: InRepoContext, reference: RecordReference): Promise<Slug> {
  const identity = await context.ports.identity();
  if (identity === null) return refuse({ code: "not-found", class: "recoverable", reference,
    condition: "No identity is configured for personal records (arc.identity).",
    remedy: { text: "Set git config --local arc.identity <identity>, then retry this operation.", argv: ["git", "config", "--local", "arc.identity", "<identity>"] } });
  if (reference.owner.name !== identity) return refuse({ code: "not-found", class: "recoverable", reference,
    condition: `The requested personal identity ${reference.owner.name} is not the configured identity ${identity}.`,
    remedy: { text: `Select ${identity}'s personal record or configure arc.identity as ${reference.owner.name}, then retry.` } });
  return identity;
}
/** Resolve the two roots today's personal readers select without reading a record.
 * @param context - Checkout and topology dependencies.
 * @param identity - Already resolved configured identity.
 * @returns Primary top-level and checkout workspace address functions.
 */
export async function personalSurfaces(context: InRepoContext, identity: Slug): Promise<UserSurfaceResolver> {
  return resolveUserSurfaceResolver({ cwd: context.ports.checkoutRoot, identity, exec: context.ports.exec });
}
/** Classify a visible personal file by its unique semantic role.
 * @param identity - Owner of the machine-local materialization.
 * @param key - Managed path below that identity's root.
 * @returns One record reference, or no stored role for machine state and derived views.
 */
export function personalFileReference(identity: Slug, key: string): RecordReference | undefined {
  const segments = key.split("/");
  if (segments.some((segment) => segment.startsWith(".")) || basename(key) === IDENTITY_STATUS_FILENAME) return undefined;
  const owner = OwnerIdentitySchema.parse({ type: "person", name: identity });
  if (key === personalSingletonKey(identity, "personal/inbox")) return recordReferences["personal/inbox"](owner);
  if (key === personalSingletonKey(identity, "personal/working-memory")) return recordReferences["personal/working-memory"](owner);
  if (segments.length === 2) {
    const workUnit = SlugSchema.safeParse(segments[0]);
    if (workUnit.success && segments[1] === basename(resolveArcPath({ kind: "user-document", identity, document: { kind: "session-notes", workUnit: workUnit.data } }))) return recordReferences["personal/session-context"](owner, workUnit.data);
  }
  return recordReferences["personal/document"](owner, key);
}
/** Locate a personal reference using the owning surface's existing layout.
 * @param surfaces - Primary and current-checkout user roots.
 * @param reference - Logical personal record.
 * @returns Absolute target, or undefined for paths with no personal storage role.
 */
export function personalPath(surfaces: UserSurfaceResolver, reference: RecordReference): string | undefined {
  if (reference.kind === "personal/inbox") return surfaces.identityGlobalPath(personalSingletonKey(surfaces.identity, reference.kind));
  if (reference.kind === "personal/working-memory") return surfaces.workingMemoryPath;
  if (reference.kind === "personal/session-context") return surfaces.sessionNotesPath(SlugSchema.parse(reference.key));
  if (reference.kind !== "personal/document" || typeof reference.key !== "string") return undefined;
  const selected = personalFileReference(surfaces.identity, reference.key);
  if (selected?.kind !== "personal/document") return undefined;
  return reference.key.includes("/") ? join(surfaces.cwd, ".arc", "user", surfaces.identity, reference.key)
    : surfaces.identityGlobalPath(reference.key);
}
/** Select the configured surface below which personal path components are admitted.
 * @param surfaces - Existing primary and checkout personal roots.
 * @param reference - Logical personal role with its managed key.
 * @returns The root owning this role's resolved path.
 */
export function personalRoot(surfaces: UserSurfaceResolver, reference: RecordReference): string {
  return reference.kind === "personal/session-context"
    || (reference.kind === "personal/document" && typeof reference.key === "string" && reference.key.includes("/"))
    ? join(surfaces.cwd, ".arc", "user", surfaces.identity) : surfaces.identityGlobalRoot;
}
/** Name the unique role for an alias, or the machine-state boundary for an excluded path.
 * @param identity - Resolved personal namespace.
 * @param reference - Address whose path has no matching storage role.
 * @returns An actionable role selection or external-file route.
 */
export function personalPathRemedy(identity: Slug, reference: RecordReference): string {
  const role = typeof reference.key === "string" ? personalFileReference(identity, reference.key)?.kind : undefined;
  return role === undefined ? "Keep machine-local state and derived views outside the store."
    : `Address this file through its registered ${role} role, then retry.`;
}

/** Project a singleton role's filename through the existing layout authority.
 * @param identity - The configured personal namespace.
 * @param kind - Singleton file role.
 * @returns Its filename beneath the identity-global root.
 */
export function personalSingletonKey(identity: Slug, kind: "personal/inbox" | "personal/working-memory"): string {
  return basename(resolveArcPath(kind === "personal/inbox" ? { kind: "inbox", scope: { kind: "identity", identity } }
    : { kind: "user-document", identity, document: { kind: "working-memory" } }));
}
