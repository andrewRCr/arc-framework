/** Subject-keyed lifecycle queries and their operational boundary rendering. */

import { pullStoreStatus, readStoreStatusLocus, type StoreLifecycleStatusPorts } from "./store-locus.js";
import * as p from "../../lib/terminal.js";
import { readdir, readFile } from "node:fs/promises";
import { runActiveStatus } from "../../commands/active.js";
import { renderInFlightWarning } from "../../lib/git/in-flight-derivation.js";
import type { GitExec } from "../../lib/git/index.js";
import { readGitBlobEntry } from "../../lib/io-context.js";
import type { StoreRefusal } from "../../lib/store/refusal.js";
import type { LifecycleIndexOutcome } from "../../lib/store/lifecycle-index.js";
import type { Store } from "../../lib/store/contract.js";
import type { StoreSyncPort } from "../../lib/store/operational-sync.js";
import { readLifecycleView, buildLifecycleViewIndex } from "../../lib/store/lifecycle-view.js";
import { selectStandingLifecycleEntries } from "../../lib/status/store-project-standing.js";
import { readLifecycleDesign } from "../../lib/store/lifecycle-design.js";
import { readWorkUnit, usesOffBranchState } from "../../lib/store/lifecycle-write.js";
import { MetaPauseSchema, ParsedMetaRecordSchema, type MetaPause, type ParsedMetaRecord } from "../../lib/active/meta-schema.js";
import { ParsedDesignRecordSchema } from "../../lib/store/kinds/design/index.js";
import { extractPurposeSentence, readWorkUnitPurpose } from "../../lib/status/work-unit-purpose.js";
import {
  projectScopeWindow,
  readDerivedSlugPosition,
  type DerivedSlugPosition,
  type ScopeWindowFact,
} from "../../lib/status/slug-position.js";
import { readStatusCheckoutRoster } from "./checkout-roster.js";
import { resolveCallerComposedLifecycleIndex } from "../../lib/work-unit/composed-lifecycle-index.js";
import { resolveSlugQuery, type SlugStateQuery } from "../../lib/work-unit/lifecycle-query.js";
import {
  parseIntegrationBoundaryLocus,
  type IntegrationBoundaryLocus,
} from "../../scripts/review-gate/policy/integration-boundary-locus.js";
import { readIdentityPointers } from "../identity-pointers.js";
import type { StatusCliOptions } from "./input.js";
import type { SessionStatusContext } from "./session-context.js";

/**
 * Render one lifecycle subject from local or explicitly live evidence.
 * @param context - Selected operational store, synchronization port and checkout readers.
 * @param slug - Validated work-unit slug.
 * @param opts - Validated status options.
 * @returns Completion after writing the lifecycle query.
 */
export async function handleLifecycleStatus(
  context: SessionStatusContext,
  slug: string,
  opts: StatusCliOptions,
  ports?: StoreLifecycleStatusPorts,
): Promise<void> {
  const { cwd, exec, store } = context;
  if (store !== undefined && usesOffBranchState(store)) {
    await handleStoreLifecycleStatus(store, slug, opts, { cwd, exec, identity: context.identity, sync: context.storeSync }, ports);
    return;
  }
  const json = Boolean(opts.json);
  // Slug→state query: a subject-keyed read over the lifecycle-complete index.
  // The index walk binds real I/O; the resolution stays a pure lib projection.
  // Transient identities still feed the oracle so recorded Errand
  // branches are not mis-emitted as `no-record-or-meta` residue.
  const { identity } = await readIdentityPointers(exec);
  const composed = await resolveCallerComposedLifecycleIndex({
    cwd, exec, identity,
    acquisitionPolicy: opts.fetch === true ? "passive-live" : "local",
    fs: {
      readdir: (path) => readdir(path, { withFileTypes: true }),
      readFile: (path) => readFile(path, "utf8"),
    },
  });
  const query = resolveSlugQuery(composed.index, slug);
  const record = composed.recordsBySlug.get(slug)?.selected;
  const purpose = record === undefined ? null : await readWorkUnitPurpose(record.source, {
    fs: { readFile: (path) => readFile(path, "utf8") },
    readAtRef: (ref, path) => readGitBlobEntry(cwd, ref, path, { objectAccess: "local-only" }),
  });
  const owner = record?.owner ?? null;
  const worktreePath = composed.worktreePathBySlug.get(slug);
  const operationalReadPath = worktreePath
    ?? (composed.recordsBySlug.get(slug)?.writablePath === undefined ? undefined : cwd);
  const operational = await resolveSlugOperationalBoundary({
    slug,
    state: query.state,
    worktreePath: operationalReadPath,
    exec,
  });
  const derived = await readDerivedSlugPosition({
    slug, worktreePath, identity, readRoster: (id) => readStatusCheckoutRoster({ cwd, exec }, id),
  });
  const scopeWindow = projectScopeWindow(query.state, derived.position);
  const warnings = [
    ...composed.qualityFacts.warnings.map(renderInFlightWarning),
    ...(opts.fetch === true && composed.qualityFacts.unreachable === true
      ? ["Remote unreachable; query derived from local refs only."]
      : []),
    ...operational.warnings,
    ...derived.warnings,
  ];
  const output = {
    ...query,
    purpose,
    owner,
    integrationBoundary: operational.integrationBoundary,
    derivedPosition: derived.position,
    scopeWindow,
    ...(worktreePath !== undefined ? { worktreePath } : {}),
    ...(warnings.length > 0 ? { warnings: [...new Set(warnings)] } : {}),
  };
  if (json) {
    process.stdout.write(`${JSON.stringify(output)}\n`);
    return;
  }
  p.intro("arc status");
  p.note(formatSlugStateQuery(query, {
    purpose,
    integrationBoundary: output.integrationBoundary,
    derivedPosition: derived.position,
    scopeWindow,
    worktreePath,
    warnings: output.warnings ?? [],
  }), "Lifecycle state");
  p.outro("Done.");
  return;
}

/** Compact human render of a slug→state query for the non-`--json` path. */
function formatSlugStateQuery(
  query: SlugStateQuery,
  enrichment: {
    purpose?: string | null;
    integrationBoundary?: IntegrationBoundaryLocus | null;
    derivedPosition?: DerivedSlugPosition | null;
    scopeWindow?: ScopeWindowFact;
    worktreePath?: string;
    warnings?: readonly string[];
  } = {},
): string {
  const position =
    query.position === null
      ? "—"
      : `${query.position.phase} · ${query.position.location}`;
  const lines = [
    `${query.slug} → ${query.state}`,
    `position: ${position}`,
    `occupied: ${query.occupied} · shipped: ${query.shipped}`,
  ];
  lines.push(...formatDerivedLines(enrichment.derivedPosition, enrichment.scopeWindow));
  if (enrichment.purpose !== null && enrichment.purpose !== undefined) lines.push(`purpose: ${enrichment.purpose}`);
  if (enrichment.worktreePath !== undefined) lines.push(`worktree: ${enrichment.worktreePath}`);
  if (enrichment.integrationBoundary !== null && enrichment.integrationBoundary !== undefined) {
    lines.push(`boundary: ${enrichment.integrationBoundary.locus}`);
    lines.push(`next: ${enrichment.integrationBoundary.nextAction.command}`);
  }
  if (query.dependsOn.length > 0) {
    lines.push("depends on:");
    for (const dep of query.dependsOn) {
      lines.push(`  - ${dep.slug} — ${dep.landed ? "landed" : "not landed"}`);
    }
  }
  for (const warning of enrichment.warnings ?? []) lines.push(`warning: ${warning}`);
  return lines.join("\n");
}

/** Stage and scope-window lines; empty for whichever was not read. */
function formatDerivedLines(
  position: DerivedSlugPosition | null | undefined,
  scopeWindow: ScopeWindowFact | undefined,
): string[] {
  return [
    ...(position === null || position === undefined ? [] : [`stage: ${formatDerivedStage(position)}`]),
    ...(scopeWindow === undefined ? [] : [`scope window: ${scopeWindow.window ?? "unknown"} — ${scopeWindow.reason}`]),
  ];
}

/** One-line stage summary: session type, then planning or work-unit stage, then the open task. */
function formatDerivedStage(position: DerivedSlugPosition): string {
  return [
    position.sessionType ?? "unresolved",
    position.stage,
    position.verifying ? "verification phase" : position.workUnitStage,
    position.openTask === null ? null : `task ${position.openTask.id} ${position.openTask.title}`,
  ].filter((part): part is string => part !== null).join(" · ");
}

async function resolveSlugOperationalBoundary(options: {
  slug: string;
  state: SlugStateQuery["state"];
  worktreePath: string | undefined;
  exec: GitExec;
}): Promise<{
  integrationBoundary: IntegrationBoundaryLocus | null;
  warnings: string[];
}> {
  if (options.state !== "active" && options.state !== "integrating") {
    return { integrationBoundary: null, warnings: [] };
  }
  if (options.worktreePath === undefined) {
    return {
      integrationBoundary: null,
      warnings: [
        `Operational boundary for ${options.slug} is unavailable without a materialized worktree. `
        + `Run \`arc materialize ${options.slug}\` for remote-only work (or check out its local branch), `
        + `then rerun \`arc status ${options.slug} --json\`.`,
      ],
    };
  }
  const active = await runActiveStatus({ cwd: options.worktreePath, exec: options.exec });
  const expectedFilename = `meta-${options.slug}.md`;
  const matches = active.candidates.filter((candidate) => candidate.filename === expectedFilename);
  const candidate = matches.length === 1 ? matches[0] : undefined;
  if (candidate === undefined) {
    return {
      integrationBoundary: null,
      warnings: [
        ...active.warnings,
        `Operational boundary for ${options.slug} is unavailable: expected one ${expectedFilename}; found ${matches.length}.`,
      ],
    };
  }
  const integrationBoundary = candidate.integrationBoundary ?? null;
  const publicationRecovery = options.state === "integrating"
    && candidate.currentWorkflow === "prepare-work-unit"
    && integrationBoundary?.locus === "publication-pending"
      ? parseIntegrationBoundaryLocus({
          ...integrationBoundary,
          nextAction: {
            kind: "continue-publication",
            command: `arc publish ${options.slug} --json`,
            interactionText: "Finish interrupted publication finalization before pushing.",
          },
        })
      : integrationBoundary;
  return { integrationBoundary: publicationRecovery, warnings: active.warnings };
}

/** Render lifecycle truth without composing code-ref or materialized-artifact evidence. */
async function handleStoreLifecycleStatus(store: Store, slug: string, opts: StatusCliOptions,
  local: { cwd: string; exec: GitExec; identity: string | null; sync?: StoreSyncPort }, ports?: StoreLifecycleStatusPorts): Promise<void> {
  const refreshWarnings = opts.fetch === true ? (await pullStoreStatus(local)).map(warning => warning.rendered) : [];
  const view = await readLifecycleView(store);
  if (view.status === "refused") {
    renderStoreQueryRefusal(view.refusal, opts);
    return;
  }
  const record = await readWorkUnit(store, slug);
  if (record.status === "refused" && record.refusal.code !== "not-found") {
    renderStoreQueryRefusal(record.refusal, opts);
    return;
  }
  if (record.status === "ok" && record.result.conflicts.length > 0) {
    renderStoreQueryRefusal({ code: "record-malformed", class: "recoverable", reference: record.result.reference,
      rule: "lifecycle.meta-conflict", condition: `The named work-unit primary has unresolved conflicts: ${record.result.conflicts.map((reference) => JSON.stringify(reference)).join(", ")}.`,
      remedy: { text: "Resolve the named conflict records, then retry this status query." } }, opts);
    return;
  }
  const standing = selectStandingLifecycleEntries(view.result.entries,
    view.result.listing.status === "complete" ? view.result.listing.diagnostics : []);
  const query = resolveSlugQuery(buildLifecycleViewIndex(standing.entries), record.status === "ok" ? record.result.reference.owner.name : slug);
  const fields = storeQueryMetaFields(record);
  const design = record.status === "ok" ? await readLifecycleDesign(store, record.result) : { record: null, content: null, warnings: [] };
  const locus = await readStoreStatusLocus({ ...local, store, slug: query.slug }, ports);
  const derived = await readDerivedSlugPosition({ slug: query.slug, worktreePath: locus.worktreePath, identity: local.identity,
    readRoster: ports?.readRoster ?? (identity => readStatusCheckoutRoster({ ...local, store }, identity)) });
  const scopeWindow = projectScopeWindow(query.state, derived.position, storeQueryPause(fields));
  const warnings = [...design.warnings, ...lifecycleListingWarnings(view.result.listing),
    ...standing.warnings.map(warning => warning.rendered), ...locus.warnings, ...derived.warnings, ...refreshWarnings];
  const designFields = ParsedDesignRecordSchema.safeParse(design.record?.fields);
  const purpose = extractPurposeSentence(designFields.success ? designFields.data.purpose : null);
  const output = { ...query, purpose, owner: fields?.owner ?? null,
    integrationBoundary: null, derivedPosition: derived.position, scopeWindow,
    ...(locus.worktreePath === undefined ? {} : { worktreePath: locus.worktreePath }), ...(warnings.length === 0 ? {} : { warnings: [...new Set(warnings)] }) };
  if (opts.json) process.stdout.write(`${JSON.stringify(output)}\n`);
  else {
    p.intro("arc status");
    p.note(formatSlugStateQuery(query, { purpose, worktreePath: locus.worktreePath, warnings,
      derivedPosition: derived.position, scopeWindow }), "Lifecycle state");
    p.outro("Done.");
  }
}

function storeQueryMetaFields(record: Awaited<ReturnType<typeof readWorkUnit>>): ParsedMetaRecord | undefined {
  if (record.status === "refused") return undefined;
  const parsed = ParsedMetaRecordSchema.safeParse(record.result.fields);
  return parsed.success ? parsed.data : undefined;
}

function storeQueryPause(fields: ParsedMetaRecord | undefined): MetaPause | undefined {
  const pause = fields?.pause;
  return pause === null || pause === undefined ? undefined : MetaPauseSchema.parse(pause);
}

/** Retain readable query diagnostics without imposing write completeness. */
function lifecycleListingWarnings(listing: LifecycleIndexOutcome): string[] {
  if (listing.status === "complete") return listing.diagnostics.map((diagnostic) => diagnostic.condition);
  return listing.status === "unreadable" ? [listing.condition] : [];
}
/** Preserve the exact refusal in machine output and its remedy in human output. */
function renderStoreQueryRefusal(refusal: StoreRefusal, opts: StatusCliOptions): void {
  if (opts.json) process.stdout.write(`${JSON.stringify({ status: "refused", refusal })}\n`);
  else p.log.error(`${refusal.condition} ${refusal.remedy.text}`);
  process.exitCode = 1;
}
