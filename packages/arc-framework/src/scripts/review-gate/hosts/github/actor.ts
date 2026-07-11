/**
 * Actor identity and repository-capability resolution.
 *
 * Binds every actor — human, bot, or App account — to its immutable numeric and
 * node ids, keeping the mutable, case-insensitive login for display only, so a
 * login rename or case change cannot alter identity. Repository capability is
 * re-queried live per command/attestation and mapped from the exact role without
 * over-granting (a triage role never reads as write). A numeric-id mismatch
 * against the expected actor, a bot account, removed access, or a lookup failure
 * all fail closed rather than granting a default.
 *
 * @module
 */

import { ACTOR_PERMISSIONS, type ActorPermission, type CapabilitySet } from "../../core/contracts.js";
import { integerAt, objectAt, stringAt } from "../../core/validation.js";
import type { GitHubRestClient } from "./api/rest.js";

/** An actor bound to immutable ids, with a display-only login. */
export interface NormalizedActor {
  /** Immutable numeric account id (retained as a string). */
  identity: string;
  /** Immutable account node id. */
  nodeId: string;
  /** Mutable, case-insensitive login — display only, never identity. */
  login: string;
  /** Account family; a bot is not a human command actor. */
  kind: "user" | "bot";
}

function accountKind(type: string): "user" | "bot" {
  return type.toLowerCase() === "bot" ? "bot" : "user";
}

/** Normalize a GitHub account object, binding identity to immutable ids. */
export function normalizeActor(input: unknown, path = "actor"): NormalizedActor {
  const record = objectAt(input, path);
  return {
    identity: String(integerAt(record.id, `${path}.id`, 1)),
    nodeId: stringAt(record.node_id, `${path}.node_id`),
    login: stringAt(record.login, `${path}.login`),
    kind: accountKind(stringAt(record.type, `${path}.type`)),
  };
}

const LEGACY_PERMISSION: Record<string, ActorPermission | "none"> = {
  admin: "admin",
  write: "write",
  read: "read",
  none: "none",
};

function isActorPermission(value: string): value is ActorPermission {
  return (ACTOR_PERMISSIONS as readonly string[]).includes(value);
}

/** Map the exact role, preferring `role_name` and never over-granting from the legacy field. */
function mapRole(roleName: string | undefined, legacyPermission: string): ActorPermission | "none" {
  if (roleName !== undefined) {
    if (isActorPermission(roleName)) return roleName;
    if (roleName === "none") return "none";
  }
  return LEGACY_PERMISSION[legacyPermission] ?? "none";
}

interface PermissionFacts {
  actor: NormalizedActor;
  permission: ActorPermission | "none";
}

function parsePermissionResponse(input: unknown): PermissionFacts {
  const record = objectAt(input, "permission");
  const legacyPermission = stringAt(record.permission, "permission.permission");
  const roleName = record.role_name === undefined ? undefined : stringAt(record.role_name, "permission.role_name");
  return {
    actor: normalizeActor(record.user, "permission.user"),
    permission: mapRole(roleName, legacyPermission),
  };
}

/** Inputs for a live repository-capability lookup. */
export interface ActorLookup {
  rest: GitHubRestClient;
  owner: string;
  repo: string;
  /** Login to query; only an addressing handle, never the resolved identity. */
  login: string;
  /** Immutable numeric id expected for this actor; a mismatch fails closed. */
  expectedActorId: string;
}

/** Fail-closed outcome of a capability resolution. */
export type ActorCapabilityResult =
  | { kind: "resolved"; actor: NormalizedActor; capabilities: CapabilitySet }
  | { kind: "no-access" }
  | { kind: "identity-mismatch" }
  | { kind: "bot-actor" }
  | { kind: "unavailable"; reason: string };

function segment(value: string): string {
  return encodeURIComponent(value);
}

/** Re-query and normalize an actor's live repository capability, failing closed on any doubt. */
export async function resolveActorCapabilities(lookup: ActorLookup): Promise<ActorCapabilityResult> {
  const path = `/repos/${segment(lookup.owner)}/${segment(lookup.repo)}/collaborators/${segment(lookup.login)}/permission`;
  const outcome = await lookup.rest.get(path, { parse: parsePermissionResponse });
  switch (outcome.kind) {
    case "http-error":
      return outcome.status === 404 ? { kind: "no-access" } : { kind: "unavailable", reason: `http-${outcome.status}` };
    case "schema-error":
      return { kind: "unavailable", reason: "malformed" };
    case "unavailable":
      return { kind: "unavailable", reason: outcome.reason };
    case "ok":
      break;
  }
  const { actor, permission } = outcome.value;
  if (actor.identity !== lookup.expectedActorId) return { kind: "identity-mismatch" };
  if (actor.kind === "bot") return { kind: "bot-actor" };
  if (permission === "none") return { kind: "no-access" };
  return {
    kind: "resolved",
    actor,
    capabilities: { schemaVersion: 1, actorIdentity: actor.identity, permissions: [permission] },
  };
}
