/** Capture transport targets independently of later clone-local designation changes. */
import type { RefBackendContext } from "./context.js";
import type { RefRemoteDesignation } from "./designation.js";
import type { MoveRemote } from "./migrate-record.js";
import { readRefRepository } from "./repository.js";
import { MigrationRefusal } from "./migrate-refusal.js";
import { EffectiveTransportError, readRemoteTransports, resolveLiteralTransport, selectLiteralTransport } from "./effective-transport.js";

/** The reserved backing target names only the tracked pointer; other targets keep caller-specific admission. */
export function resolveBackingTarget(target: string, pointer: string | null): string {
  if (target !== "backing") return target;
  if (!pointer) throw new MigrationRefusal({ code: "request-invalid", class: "terminal",
    condition: "The target backing requires this checkout's storage.backing_repository pointer; a code remote named backing cannot carry that designation.",
    remedy: { text: "Set storage.backing_repository to the intended state repository, then retry the migration." } });
  return pointer;
}

/** Keep the URL this named remote is configured with, and resolve both transport URLs in the repository that owns it. */
export async function captureMoveRemote(context: RefBackendContext, code: RefBackendContext, remote: RefRemoteDesignation): Promise<MoveRemote> {
  const physical = remote.repository === "backing" ? await readRefRepository(context) : code;
  const actual = await readRemoteTransports(physical, remote.name).catch(migrationTransportRefusal), pushUrls = [...new Set(actual.pushUrls)];
  if (pushUrls.length !== 1) throw new MigrationRefusal({ code: "role-conflict", class: "recoverable",
    condition: `Remote ${remote.name} has multiple effective push destinations; a state move needs one receiver.`,
    remedy: { text: `Configure one push URL for ${remote.name}, then retry the migration.` } });
  return { name: remote.name, repository: remote.repository, url: remote.url, fetchUrl: actual.fetchUrl, pushUrl: pushUrls[0] ?? "" };
}

/** Resolve fresh raw aliases before they become recorded effective endpoints. */
export async function captureLiteralMoveRemote(code: RefBackendContext, url: string): Promise<MoveRemote> {
  const fetchUrl = (await resolveLiteralTransport(code, url, "fetch").catch(migrationTransportRefusal))[0];
  const pushUrl = (await resolveLiteralTransport(code, url, "push").catch(migrationTransportRefusal))[0];
  if (!fetchUrl || !pushUrl) throw new Error(`Git did not resolve the target URL ${url}. Repair the URL configuration and retry.`);
  return { name: "backing", repository: "backing", url, fetchUrl, pushUrl };
}

/** Migration owns recoverable command refusals; ordinary sync retains the underlying local configuration error. */
export async function migrationTransportTarget(context: RefBackendContext, endpoint: string, operation: "fetch" | "push"): Promise<string> {
  try { return await selectLiteralTransport(context, endpoint, operation); }
  catch (error) { return migrationTransportRefusal(error); }
}

function migrationTransportRefusal(error: unknown): never {
  if (!(error instanceof EffectiveTransportError)) throw error;
  throw new MigrationRefusal({ code: "move-unfinished", class: "recoverable", condition: error.message,
    remedy: { text: "Restore the recorded endpoint in the repository's URL configuration, then retry arc store migrate; retain its pending record.",
      argv: ["arc", "store", "migrate"] } });
}

/** Two remotes are one repository to a move where any URL of one, as configured or reached, is any URL of the other. */
export function sharesMoveUrl(left: Pick<MoveRemote, "url" | "fetchUrl" | "pushUrl">, right: Pick<MoveRemote, "url" | "fetchUrl" | "pushUrl">): boolean {
  const urls = new Set([right.url, right.fetchUrl, right.pushUrl]);
  return [left.url, left.fetchUrl, left.pushUrl].some(url => urls.has(url));
}
