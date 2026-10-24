/** Capture transport targets independently of later clone-local designation changes. */
import type { RefBackendContext } from "./context.js";
import type { RefRemoteDesignation } from "./designation.js";
import type { MoveRemote } from "./migrate-record.js";
import { readRefRepository } from "./repository.js";

/** Resolve both native URLs in the repository that owns this named remote. */
export async function captureMoveRemote(context: RefBackendContext, code: RefBackendContext, remote: RefRemoteDesignation): Promise<MoveRemote> {
  const physical = remote.repository === "backing" ? await readRefRepository(context) : code;
  const urls = await Promise.all([[], ["--push"]].map(async flags => (await physical.exec("git", ["remote", "get-url", ...flags, remote.name], { cwd: context.checkoutRoot })).stdout.trim()));
  return { name: remote.name, repository: remote.repository, fetchUrl: urls[0] ?? remote.url, pushUrl: urls[1] ?? remote.url };
}

/** Two remotes are one repository to a move where either URL of one is either URL of the other. */
export function sharesMoveUrl(left: Pick<MoveRemote, "fetchUrl" | "pushUrl">, right: Pick<MoveRemote, "fetchUrl" | "pushUrl">): boolean {
  return [left.fetchUrl, left.pushUrl].some(url => url === right.fetchUrl || url === right.pushUrl);
}
