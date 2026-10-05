/** Logical handles derived from today's tracked records and commit footers. */
import type { LookupInput, LookupResult } from "../lookup.js";
import type { InRepoContext } from "./context.js";
import { OwnerIdentitySchema, recordReferences, sameReference } from "../identity.js";
import { SlugSchema } from "../../kernel/index.js";
import { flatActiveMeta, selectMeta } from "./meta.js";
import { recordPath } from "./paths.js";
import { readFileAt } from "./files.js";
import { parseTransitionRecord, type TransitionRecord } from "../../work-unit/transition-record.js";
import { parseCommitMessage } from "../../commit-check/parser.js";
import { expandTaskReference, isTaskNonReferenceContext, parseTaskReference, type ParsedTaskReference } from "../../commit-check/task-reference.js";
import { scanTaskListStructure } from "../../task-list/scanner.js";
import { branchToWorkUnitSlug } from "../../work-unit/completed-index.js";
import { isGitProcessError } from "../../git/process-error.js";
import { refuse } from "./refusals.js";

/** Resolve a logical handle through the current tracked records.
 * @param context - Explicit repository dependencies.
 * @param input - Slug, lineage, claim, commit, or branch handle.
 * @returns Its sole record and any footer-derived task IDs.
 */
export async function lookupTracked(context: InRepoContext, input: LookupInput): Promise<LookupResult> {
  if (input.kind === "slug") return lookupSlug(context, input.slug, input);
  if (input.kind === "claim" && input.claim.kind === "work-unit") return lookupSlug(context, input.claim.slug, input);
  if (input.kind === "lineage") {
    const origin = SlugSchema.safeParse(input.origin);
    if (origin.success && await transition(context, origin.data) !== null) return { reference: recordReferences["lineage/transition"](owner(origin.data)) };
  }
  if (input.kind === "commit" || input.kind === "ref") {
    await admitRepository(context, input);
    return input.kind === "commit" ? lookupCommit(context, input) : lookupRef(context, input);
  }
  return missing(input);
}

async function git(context: InRepoContext, args: string[]): Promise<string> {
  return (await context.ports.exec("git", args, { cwd: context.ports.checkoutRoot, objectAccess: "local-only" })).stdout;
}

async function admitRepository(context: InRepoContext, input: Extract<LookupInput, { kind: "commit" | "ref" }>): Promise<void> {
  if (input.repository === context.ports.checkoutRoot) return;
  const remotes = (await git(context, ["remote"])).split("\n");
  if (remotes.includes("origin") && (await git(context, ["remote", "get-url", "origin"])).trim() === input.repository) return;
  refuse({ code: "not-found", class: "recoverable", lookup: input, condition: "The lookup names another repository.",
    remedy: { text: "Select this checkout's repository path or its configured origin URL, then retry lookup." } });
}

async function exists(context: InRepoContext, revision: string): Promise<boolean> {
  try { await git(context, ["rev-parse", "--verify", "--quiet", `${revision}^{commit}`]); return true; }
  catch (error) {
    if (isGitProcessError(error) && error.kind === "nonzero-exit" && error.exitCode === 1) return false;
    throw error;
  }
}

async function lookupRef(context: InRepoContext, input: Extract<LookupInput, { kind: "ref" }>): Promise<LookupResult> {
  if (!await exists(context, input.ref)) return missing(input);
  const branch = input.ref.replace(/^refs\/heads\//u, "").replace(/^refs\/remotes\/[^/]+\//u, "");
  const slug = SlugSchema.safeParse(branchToWorkUnitSlug(branch));
  return slug.success ? lookupSlug(context, slug.data, input) : missing(input);
}

async function lookupCommit(context: InRepoContext, input: Extract<LookupInput, { kind: "commit" }>): Promise<LookupResult> {
  if (!await exists(context, input.sha)) return missing(input);
  const object = await context.ports.execInput(["cat-file", "commit", input.sha], "", { cwd: context.ports.checkoutRoot, objectAccess: "local-only" });
  const separator = object.indexOf("\n\n");
  if (separator === -1) throw new Error("Git returned a commit without a header boundary");
  const footer = parseCommitMessage(object.slice(separator + 2)).contextTrailer;
  const attribution = footer?.key === "Context" ? contextAttribution(footer.value) : undefined;
  if (attribution === undefined) return missing(input);
  const result = await lookupSlug(context, attribution.slug, input);
  if (attribution.tasks === null) return result;
  const meta = await selectMeta(context, result.reference.owner.name);
  const taskReference = recordReferences["work-item/task-list"](result.reference.owner);
  const content = await readFileAt(context, await recordPath(context, taskReference, meta), meta?.revision);
  const scan = scanTaskListStructure(content ?? "");
  const ids = scan.status === "malformed" ? [] : scan.events.flatMap((event) => event.type === "parent" || event.type === "subtask" ? [event.item.id] : []);
  return { ...result, taskIds: expandTaskReference(attribution.tasks, ids) };
}

function contextAttribution(value: string): { slug: string; tasks: ParsedTaskReference | null } | undefined {
  const match = /^(tasks|meta|draft|spec)-([a-z0-9]+(?:-[a-z0-9]+)*)\.md \((.+)\)$/u.exec(value);
  const family = match?.[1]; const slug = match?.[2]; const payload = match?.[3];
  if (slug === undefined || payload === undefined) return undefined;
  if (family === "tasks") {
    const tasks = parseTaskReference(payload);
    return tasks !== null || isTaskNonReferenceContext(payload) ? { slug, tasks } : undefined;
  }
  const accepted = family === "meta"
    ? /^(?:handoff|activation|prepublication|integration|archival|deactivation|maintenance|incidental during \S(?:.*\S)?)$/u.test(payload)
    : /^(?:planning|code review)$/u.test(payload);
  return accepted ? { slug, tasks: null } : undefined;
}

function owner(name: string) {
  return OwnerIdentitySchema.parse({ type: "work-item", name });
}

function missing(input: LookupInput): never {
  return refuse({ code: "not-found", class: "recoverable", lookup: input,
    condition: "No tracked record matches the lookup.", remedy: { text: "Check the lookup name, or create its record before retrying." } });
}

async function lookupSlug(context: InRepoContext, initial: string, input: LookupInput): Promise<LookupResult> {
  const visited = new Set<string>();
  const candidates: LookupResult[] = [];
  let slug = initial;
  while (!visited.has(slug)) {
    visited.add(slug);
    const direct = await flatActiveMeta(context, slug) ?? await selectMeta(context, slug);
    const reference = recordReferences["work-item/meta"](owner(slug));
    if (direct !== undefined && !candidates.some((candidate) => sameReference(candidate.reference, reference))) candidates.push({ reference });
    const retired = await transition(context, slug);
    if (retired?.kind === "rename") {
      const successor = retired.successors[0];
      if (successor === undefined) throw new Error("A validated rename has no successor");
      slug = successor; continue;
    }
    break;
  }
  const candidate = candidates[0];
  if (candidate === undefined) return missing(input);
  if (candidates.length > 1) return refuse({ code: "ambiguous-match", class: "recoverable", candidates: candidates.map(({ reference }) => reference),
    condition: "The current name and its rename lineage identify different work units.",
    remedy: { text: "Choose the current unambiguous work-unit name, then repeat lookup." } });
  return candidate;
}

async function transition(context: InRepoContext, slug: string): Promise<TransitionRecord | null> {
  const reference = recordReferences["lineage/transition"](owner(slug));
  const content = await readFileAt(context, await recordPath(context, reference));
  if (content === null) return null;
  const record = parseTransitionRecord(content);
  if (record === null) return refuse({ code: "record-malformed", class: "recoverable", reference, rule: "TransitionRecord",
    condition: "The origin transition is malformed.", remedy: { text: "Repair its transition record, then retry lookup." } });
  if (record.origin !== slug) return refuse({ code: "identity-mismatch", class: "recoverable", expected: reference,
    actual: recordReferences["lineage/transition"](owner(record.origin)), condition: "The transition content names another origin.",
    remedy: { text: "Restore the transition matching the named origin, then retry lookup." } });
  return record;
}
