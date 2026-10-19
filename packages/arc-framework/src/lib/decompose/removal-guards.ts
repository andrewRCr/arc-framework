/** Shared admission for members and cohort documents removed by discard or revision. */
import type { DecomposeContext } from "./context.js";
import type { DecomposeRefusal } from "./refusal.js";
import type { StoreRecord } from "../store/read.js";
import type { Mutation } from "../store/write.js";
import { sameReference, sameOwner } from "../store/identity.js";
import { renderV3DecomposeArgv } from "../work-unit/decompose-command-renderer.js";
import { acquireDecomposeSurvivingMembers } from "./removal-holders.js";
import { decomposeRemovedMemberNames, checkDecomposeRemovalEdges } from "./removal-edges.js";
import { decomposeDiscardArgv } from "./command-argv.js";
import { checkDecomposeRemovalCohorts } from "./removal-cohorts.js";
import { splitEntryList } from "../store/concurrency/entries.js";
import { entryVersion } from "../store/kinds/entry-fields.js";

/** Acquired inputs, exact proposed writes, and the destination for held inbound work. */
export interface DecomposeRemovalInput { records: readonly StoreRecord[]; writes: readonly Mutation[]; routeTo: string | undefined }

/** Refuse removing protected member work before preparing an approval packet. */
export async function checkDecomposeRemovals(ctx: DecomposeContext, input: DecomposeRemovalInput): Promise<DecomposeRefusal | undefined> {
  const members = input.records.filter(record => record.reference.kind === "work-item/meta"
    && input.writes.some(write => write.action === "remove" && sameReference(write.reference, record.reference)));
  for (const member of members) {
    const refusal = checkRemovedMember(member, input);
    if (refusal !== undefined) return refusal;
    const inbound = checkRemovedInbound(ctx, member, input);
    if (inbound !== undefined) return inbound;
  }
  const surviving = await acquireDecomposeSurvivingMembers(ctx.executor.store, input.writes);
  if (surviving.status === "refused") return surviving;
  const names = await decomposeRemovedMemberNames(ctx.executor.store, members);
  if (names.status === "refused") return names;
  const edges = checkDecomposeRemovalEdges(surviving.result, names.result);
  if (edges !== undefined) return edges;
  const cohorts = input.records.filter(record => record.reference.kind === "cohort/document"
    && input.writes.some(write => write.action === "remove" && sameReference(write.reference, record.reference)));
  return checkDecomposeRemovalCohorts(ctx.executor.store, cohorts, input.writes, surviving.result);
}

function checkRemovedInbound(ctx: DecomposeContext, member: StoreRecord, input: DecomposeRemovalInput): DecomposeRefusal | undefined {
  const grammar = ctx.inboundGrammar;
  if (grammar === undefined) return undefined;
  const records = input.records.filter(record => record.reference.kind === "work-item/inbound"
    && sameOwner(record.reference.owner, member.reference.owner));
  const entries = records.flatMap(record => splitEntryList(record.content, grammar).parts.filter(part => part.kind === "entry"));
  if (entries.length === 0) return undefined;
  const slug = member.reference.owner.name;
  const routes = entries.map(entry => renderV3DecomposeArgv(["arc", "route", entry.id ?? "<entry-id>", "--from", slug,
    "--expected-version", entryVersion(entry), "--to", input.routeTo ?? "<retained-member>"]));
  const recipient = input.routeTo === undefined ? "Keep a current member in the revised map as a routing recipient first. " : "";
  return { status: "refused", reason: "inbound-held", class: "recoverable", locus: `${slug}.inbound`,
    message: `${slug} holds inbound entries: ${entries.map(entry => entry.id ?? "entry without ID").join(", ")}.`,
    remedy: { text: `${recipient}Route each entry to surviving work with ${routes.join("; ")} before removing this stub. Assign a managed identity first to an entry without an ID.` } };
}

function checkRemovedMember(member: StoreRecord, input: DecomposeRemovalInput): DecomposeRefusal | undefined {
  const slug = member.reference.owner.name;
  if (member.placement?.kind !== "backlog") {
    const argv = ["arc", "abandon", slug];
    return { status: "refused", reason: "started-member-removal", class: "recoverable", locus: slug,
      remedy: { text: `Keep the started member and finish the cut, or abandon its open work with ${renderV3DecomposeArgv(argv)} before retrying.`, argv } };
  }
  if (!input.records.some(record => record.reference.kind === "work-item/cut-map"
    && sameOwner(record.reference.owner, member.reference.owner))) return undefined;
  const argv = decomposeDiscardArgv(slug);
  return { status: "refused", reason: "removed-stub-cut", class: "recoverable", locus: slug,
    remedy: { text: `Discard the member's own cut with ${renderV3DecomposeArgv(argv)} before removing it.`, argv: [...argv] } };
}
