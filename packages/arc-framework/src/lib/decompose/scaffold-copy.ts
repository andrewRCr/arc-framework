/** Planning-artifact copies with first-line retitling and task-list admission. */
import type { DecomposeContext } from "./context.js";
import type { DecomposeOriginRecords } from "./acquire-origin.js";
import type { DecomposeResult, DecomposeRefusal } from "./refusal.js";
import type { RecordReference, OwnerIdentity } from "../store/identity.js";
import type { Mutation } from "../store/write.js";
import { recordReferences } from "../store/identity.js";
import { companionArtifactName } from "../store/companion-name.js";
import { decomposeMapRuleRefusal } from "./map-rule-refusal.js";
import { checkTaskListDescriptor, checkTaskListSegmentation } from "../store/kinds/task-list/shape-rules.js";
import { parseTaskListRecord } from "../store/kinds/task-list/parser.js";
import { scanTaskListStructure } from "../task-list/scanner.js";

/** One new artifact's coordinates and expected-absence write. */
export interface DecomposeScaffoldCopy { basename: string; reference: RecordReference; write: Mutation }

/** Copy an acquired artifact, preserving the body and changing only the first title occurrence. */
export function copyDecomposeArtifact(ctx: DecomposeContext, acquired: DecomposeOriginRecords,
  owner: OwnerIdentity, basename: string): DecomposeResult<DecomposeScaffoldCopy> {
  const source = acquired.artifacts.find(artifact => artifact.basename === basename);
  if (source === undefined) return decomposeMapRuleRefusal("source-artifact", basename,
    "Restore the origin's requested planning artifact through write-back, or target another artifact, then retry.");
  const target = copyCoordinates(owner, source.record.reference);
  if (target === null) return decomposeMapRuleRefusal("source-artifact", basename,
    "Restore the source artifact's logical kind and companion key, then retry.");
  if (!source.record.content.replace(/^\uFEFF/u, "").startsWith("# ")) return decomposeMapRuleRefusal("scaffold-title-missing", basename,
    "Restore the origin artifact's level-one title on its first line through write-back, then retry.");
  const newline = source.record.content.indexOf("\n");
  const title = newline < 0 ? source.record.content : source.record.content.slice(0, newline);
  const content = title.replace(acquired.primary.reference.owner.name, owner.name)
    + (newline < 0 ? "" : source.record.content.slice(newline));
  if (target.reference.kind === "work-item/task-list") {
    const refused = checkTaskCopy(ctx, target.reference, basename, content);
    if (refused !== undefined) return refused;
  }
  return { status: "ok", result: { ...target, write: { action: "put", reference: target.reference, expected: null, content } } };
}

function copyCoordinates(owner: OwnerIdentity, source: RecordReference): { reference: RecordReference; basename: string } | null {
  if (source.kind === "work-item/draft") return { reference: recordReferences["work-item/draft"](owner), basename: `draft-${owner.name}.md` };
  if (source.kind === "work-item/spec") return { reference: recordReferences["work-item/spec"](owner), basename: `spec-${owner.name}.md` };
  if (source.kind === "work-item/task-list") return { reference: recordReferences["work-item/task-list"](owner), basename: `tasks-${owner.name}.md` };
  if (source.kind === "work-item/notes") return { reference: recordReferences["work-item/notes"](owner), basename: `notes-${owner.name}.md` };
  return source.kind === "work-item/companion" && typeof source.key === "string"
    ? { reference: recordReferences["work-item/companion"](owner, source.key), basename: companionArtifactName(owner.name, source.key) } : null;
}

function checkTaskCopy(ctx: DecomposeContext, reference: RecordReference, source: string, content: string): DecomposeRefusal | undefined {
  const input = { reference, next: { content, fields: parseTaskListRecord(content) }, writer: { kind: "verb" as const, verb: "decompose" },
    before: ctx.executor.store, after: ctx.executor.store };
  const diagnostics = [...checkTaskListDescriptor(input), ...checkTaskListSegmentation(input)];
  if (diagnostics.length > 0) return { status: "refused", reason: "scaffold-task-list", class: "recoverable", locus: source,
    message: diagnostics.map(item => `${item.rule}: ${item.condition}`).join("\n"),
    remedy: { text: `Repair each named diagnostic in ${source} through write-back before copying it, then retry.` } };
  const scan = scanTaskListStructure(content);
  const completed = scan.status === "scanned" ? scan.events.flatMap(event =>
    (event.type === "parent" || event.type === "subtask") && event.marker === "x" ? [event.item.id] : []) : [];
  if (completed.length === 0) return undefined;
  return { status: "refused", reason: "completed-task", class: "recoverable", locus: source,
    message: `${source} contains completed tasks: ${completed.join(", ")}.`,
    remedy: { text: "Target the member's draft, spec, or notes instead of copying this task list, then retry." } };
}
