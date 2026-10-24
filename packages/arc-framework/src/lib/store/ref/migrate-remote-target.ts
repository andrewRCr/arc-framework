/** Capture transport targets independently of later clone-local designation changes. */
import type { RefBackendContext } from "./context.js";
import type { RefRemoteDesignation } from "./designation.js";
import type { MoveRemote } from "./migrate-record.js";
import { readRefRepository } from "./repository.js";

/** Keep the URL this named remote is configured with, and resolve both transport URLs in the repository that owns it. */
export async function captureMoveRemote(context: RefBackendContext, code: RefBackendContext, remote: RefRemoteDesignation): Promise<MoveRemote> {
  const physical = remote.repository === "backing" ? await readRefRepository(context) : code;
  const resolve = async (flags: string[]): Promise<string> =>
    (await physical.exec("git", ["remote", "get-url", ...flags, remote.name], { cwd: context.checkoutRoot })).stdout.trim();
  return { name: remote.name, repository: remote.repository, url: remote.url, fetchUrl: await resolve([]), pushUrl: await resolve(["--push"]) };
}

/** Two remotes are one repository to a move where any URL of one, as configured or reached, is any URL of the other. */
export function sharesMoveUrl(left: Pick<MoveRemote, "url" | "fetchUrl" | "pushUrl">, right: Pick<MoveRemote, "url" | "fetchUrl" | "pushUrl">): boolean {
  const urls = new Set([right.url, right.fetchUrl, right.pushUrl]);
  return [left.url, left.fetchUrl, left.pushUrl].some(url => urls.has(url));
}
