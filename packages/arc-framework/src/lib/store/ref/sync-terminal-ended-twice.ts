/** Detect concurrent published retirements when terminal lineage is the owner's only current record. */
import { LineageRecordSchema } from "../kinds/lineage/index.js";
import type { PullNotice } from "../sync.js";
import type { OwnerIdentity } from "../identity.js";
import { readBatchObjects } from "./batch-read.js";
import type { RefBackendContext } from "./context.js";
import { readLineageOwners } from "./lineage-resolution.js";
import { lifecycleRefHeld } from "./sync-lifecycle-holds.js";
import { readLifecycleLog } from "./sync-lifecycle-evidence.js";
import { readItemEndCandidates, type ItemEndCandidate } from "./sync-lifecycle-log.js";
import type { RefEndPublished } from "./sync-lifecycle.js";
import type { ArchivedFolder } from "./archive-read.js";
import { corruptRef } from "./namespace-health.js";
import { terminalEndRemedy } from "./terminal-end-remedy.js";

/** Read complete terminal candidates, then require existing captured publication witnesses for their maximal ends. */
export async function observeTerminalEndedTwice(context: RefBackendContext, state: ReadonlyMap<string, string>,
  folders: readonly ArchivedFolder[], published: RefEndPublished, blocked: ReadonlySet<string>): Promise<PullNotice[]> {
  const registry = "refs/arc/project/registry", tip = state.get(registry);
  if (!tip || lifecycleRefHeld(blocked, registry)) return [];
  const lineage = await readLineageOwners(context, state);
  if (lineage.status === "refused") return [{ kind: "namespace-corrupt", ref: registry,
    condition: lineage.refusal.condition, remedy: lineage.refusal.remedy }];
  const owners = lineage.result.filter(owner => owner.type === "work-item" && owner.uid
    && !state.has(`refs/arc/work/${owner.uid}`) && state.has(`refs/arc/history/work/${owner.uid}`)
    && !lifecycleRefHeld(blocked, `refs/arc/work/${owner.uid}`) && !folders.some(folder => folder.liveRef === `refs/arc/work/${owner.uid}`));
  const paths = owners.map(owner => `${tip}:lineage/${"uid" in owner ? owner.uid : ""}.json`);
  const records = await readBatchObjects(context, paths), notices: PullNotice[] = [];
  for (const [index, owner] of owners.entries()) {
    const path = paths[index], object = path ? records.get(path) : undefined;
    if (object?.type !== "blob") { notices.push(unavailableNotice(registry)); continue; }
    let value: unknown;
    try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(object.bytes)); }
    catch { continue; }
    const record = LineageRecordSchema.safeParse(value);
    if (!record.success || record.data.kind === "rename" || !("uid" in owner) || record.data.origin.uid !== owner.uid) continue;
    notices.push(...await observeOwnerEnds(context, state, owner, published));
  }
  return notices;
}

async function observeOwnerEnds(context: RefBackendContext, state: ReadonlyMap<string, string>, owner: OwnerIdentity,
  published: RefEndPublished): Promise<PullNotice[]> {
  if (!("uid" in owner)) return [];
  const live = `refs/arc/work/${owner.uid}`, history = live.replace("refs/arc/", "refs/arc/history/"), tip = state.get(history);
  if (!tip) return [];
  const ends = await readItemEndCandidates(context, tip, owner, "retirement");
  if (ends.unavailable.size) return [unavailableNotice(history)];
  const frontier = await maximalEnds(context, tip, ends.candidates), witnessed: ItemEndCandidate[] = [];
  for (const end of frontier) if (await published(live, history, end.batch, owner)) witnessed.push(end);
  if (new Set(witnessed.map(({ batch }) => batch)).size < 2) return [];
  return [{ kind: "ended-twice", item: owner,
    condition: `The terminal-only item holds independently published ends: ${witnessed.map(({ commit, batch }) => `${commit} (batch ${batch})`).join("; ")}.`,
    remedy: await terminalEndRemedy(context, owner, history, tip) }];
}

async function maximalEnds(context: RefBackendContext, tip: string, ends: readonly ItemEndCandidate[]): Promise<ItemEndCandidate[]> {
  const rows = new Map((await readLifecycleLog(context, tip)).map(row => [row.commit, row]));
  const ancestors = new Set<string>(), pending = ends.flatMap(({ commit }) => [...rows.get(commit)?.parents ?? []]);
  while (pending.length) {
    const commit = pending.pop();
    if (!commit || ancestors.has(commit)) continue;
    ancestors.add(commit);
    pending.push(...rows.get(commit)?.parents ?? []);
  }
  return ends.filter(({ commit }) => !ancestors.has(commit));
}

function unavailableNotice(ref: string): PullNotice {
  const refusal = corruptRef(ref, true);
  return { kind: "namespace-corrupt", ref, condition: refusal.condition, remedy: refusal.remedy };
}
