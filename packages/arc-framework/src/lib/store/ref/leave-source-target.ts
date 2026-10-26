/** Select a source departure from local configuration and acquire only its retained local view. */
import type { RefBackendContext } from "./context.js";
import type { LeaveSourceMoveRecord } from "./migrate-record.js";
import { ambiguousDesignation, readRefDesignation } from "./designation.js";
import { captureMoveRemote, sharesMoveUrl, resolveBackingTarget } from "./migrate-remote-target.js";
import { readRefRepository } from "./repository.js";
import { fetchLayoutObjects } from "./migrate-layout-build.js";
import { publisherLayout } from "./layout-state.js";
import { readSyncRefs } from "./sync-graph.js";
import { captureMoveHeads } from "./migrate-remote-copy.js";
import { FORWARDING_REF, readForwardingRecord, type ForwardingRecord } from "./forwarding-record.js";
import { MigrationRefusal } from "./migrate-refusal.js";

/** A frozen last view and the exact physical switch it licenses after copying. */
export interface LeaveSourceView {
  record: LeaveSourceMoveRecord; incoming: Map<string, string>; local: Map<string, string>; heads: Map<string, string>;
  forwarding: ForwardingRecord | null;
}

/** No transport to the departed source occurs while selecting or acquiring this view. */
export async function resolveLeaveSource(context: RefBackendContext, code: RefBackendContext, to?: string): Promise<LeaveSourceView> {
  const designation = await unambiguousLeaveDesignation(context);
  const pushes = designation.codeRemotes.filter(remote => remote.name !== "backing" && remote.role === "push");
  const old = designation.backing ?? (pushes.length === 1 ? pushes[0] : undefined);
  if (!old) throw noSourceRemote(designation.codeRemotes.filter(remote => remote.name !== "backing" && remote.role === "read").map(remote => remote.name));
  const source = await captureMoveRemote(context, code, old);
  const pointer = await context.backingRepository();
  const requested = to === undefined ? undefined : resolveBackingTarget(to, pointer);
  const target = requested ?? (designation.backing && pointer !== source.url ? pointer : null);
  if (!target) throw leaveSourceInvalid("Leaving this source requires --to <remote> naming the state's new home.");
  const candidate = designation.codeRemotes.find(remote => remote.name !== "backing" && remote.name === (to ?? target));
  if (!candidate && target !== pointer) throw leaveSourceInvalid(
    `${target} is neither a remote of the code repository nor the URL this checkout's storage.backing_repository names${pointer ? ` (${pointer})` : ""}.`,
    "Name a remote of the code repository with --to, or bring in the tracked pointer's change naming the state's new home, then retry arc store migrate --leave-source.");
  const destination = candidate ? await captureMoveRemote(context, code, candidate)
    : { name: "backing", repository: "backing" as const, url: target, fetchUrl: target, pushUrl: target };
  if (sharesMoveUrl(destination, source)) throw leaveSourceInvalid("The destination URL is the old source's URL; choose a different remote with --to.");
  const physical = await readRefRepository(context), root = `refs/arc-remotes/${source.name}/`;
  const tracking = await readSyncRefs(physical, root), local = await readSyncRefs(physical, "refs/arc/project/registry");
  const heads = await captureMoveHeads(code, source);
  await fetchLayoutObjects(code, physical.repository?.gitDir ?? physical.repository?.commonDir ?? "", new Map([...tracking, ...local]));
  const incoming = new Map([...tracking].map(([ref, tip]) => ["refs/arc/" + ref.slice(root.length), tip]));
  const forwardingTip = incoming.get(FORWARDING_REF);
  const forwarding = await readForwardingRecord(code, forwardingTip, source.name);
  if (forwarding.status === "refused") throw new MigrationRefusal(forwarding.refusal);
  incoming.delete(FORWARDING_REF);
  return { incoming, local, heads, forwarding: forwarding.result, record: { kind: "leave-source", source, destination,
    sourceLayout: physical.repository?.gitDir ? "separate" : "default",
    destinationLayout: publisherLayout(destination, designation.codeRemote), ...forwardingTip ? { forwardingTip } : {} } };
}

async function unambiguousLeaveDesignation(context: RefBackendContext) {
  const designation = await readRefDesignation(context);
  if (designation.pushes.length > 1) throw new MigrationRefusal({ code: "role-conflict", class: "recoverable",
    ...ambiguousDesignation(designation) });
  return designation;
}

/** Invalid target choices retain all state and roles for a corrected request. */
export function leaveSourceInvalid(condition: string,
  remedy = "Choose the state's new home with arc store migrate --leave-source --to <remote>, then retry."): MigrationRefusal {
  return new MigrationRefusal({ code: "request-invalid", class: "terminal", condition,
    remedy: { text: remedy } });
}

function noSourceRemote(readers: readonly string[]): MigrationRefusal {
  return new MigrationRefusal({ code: "no-state-remote", class: "recoverable",
    condition: "This clone has no owned state remote to leave.",
    remedy: { text: readers.length
      ? `Stop fetching the deleted read source with ${readers.map(name => `arc store remote ${name} off`).join(" or ")}, then designate the remote the state moved to.`
      : "Designate a state publisher with arc store remote <remote> push before retrying a source departure." } });
}
