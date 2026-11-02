/** Local lifecycle admission and artifact pointers for explicit Start readiness. */
import { relative, resolve } from "node:path";
import { resolveLifecycleSubject, type LifecycleSubjectSelection } from "../../lib/store/lifecycle-subject.js";
import { resolveBacklogStub } from "../../lib/work-unit/backlog-stub.js";
import { parseLifecycleMetaContent } from "../../lib/store/lifecycle-meta-content.js";
import type { StoreRefusal } from "../../lib/store/refusal.js";
import { resolveTaskListPath } from "../active/status.js";
import type { AgendaCompileInput } from "./compile-input.js";

/** A launchable backlog target or the exact evidence withholding it. */
export type AgendaStartTarget =
  | { kind: "resolved"; slug: string; metaPath: string; taskListPath: string | null }
  | { kind: "refused"; refusal: StoreRefusal }
  | { kind: "unresolved"; reason: string };

/** Select lifecycle evidence locally, then admit only an unstarted backlog target. */
export async function resolveAgendaStartTarget(input: AgendaCompileInput, slug: string): Promise<AgendaStartTarget> {
  const { entry } = input;
  const selected = await resolveLifecycleSubject({ cwd: entry.cwd, exec: entry.io.exec, identity: entry.identity, store: entry.store }, slug);
  if (selected.status === "refused") return { kind: "refused", refusal: selected.refusal };
  const selection = selected.result;
  const failure = qualityFailure(selection, slug);
  if (failure !== null) return { kind: "unresolved", reason: failure };
  const { state } = selection.query;
  if (state !== "provisional" && state !== "planned") return { kind: "unresolved", reason: `Target '${slug}' is ${state}.` };
  try {
    const stub = await resolveBacklogStub(entry.cwd, selection.query.slug, entry.store);
    if (stub === null) return { kind: "unresolved", reason: `Target '${slug}' has no locally available backlog stub.` };
    const content = selection.backend === "store" && selection.record.status === "ok" ? selection.record.result.content
      : await input.read.exists(stub.metaPath) ? await input.read.read(stub.metaPath) : "";
    const parsed = parseLifecycleMetaContent(content);
    const taskPath = resolveTaskListPath(relative(entry.cwd, stub.metaPath).replaceAll("\\", "/"), parsed.success ? parsed.data.taskList : null);
    return { kind: "resolved", slug: stub.slug, metaPath: stub.metaPath,
      taskListPath: taskPath === null ? null : resolve(entry.cwd, taskPath) };
  } catch (error) {
    return { kind: "unresolved", reason: `Target '${slug}' lookup failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function qualityFailure(selection: LifecycleSubjectSelection, slug: string): string | null {
  if (selection.backend === "legacy") return selection.indeterminateReason;
  const { listing, standing } = selection.view;
  if (listing.status === "unreadable") return `${listing.condition}\n${listing.remedy.text}`;
  if (listing.status === "absent") return selection.record.status === "ok" ? `Target '${slug}' has no usable lifecycle projection.` : null;
  const name = selection.query.slug;
  const diagnostic = listing.diagnostics.filter(item => item.key === `work-item/meta:${name}`);
  if (standing.failClosedNames.has(name)) return diagnostic.map(item => item.condition).join("\n") || `Lifecycle evidence for '${name}' is withheld.`;
  if (standing.clashes.some(clash => clash.slug === slug || clash.slug === name)) return `Lifecycle holders for '${slug}' are ambiguous.`;
  if (selection.record.status === "ok" && selection.query.state === "nonexistent") return `Target '${slug}' has no usable lifecycle projection.`;
  return null;
}
