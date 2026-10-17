/** Subject-keyed lifecycle queries and their operational boundary rendering. */

import * as p from "../../lib/terminal.js";
import { readdir, readFile } from "node:fs/promises";
import { runActiveStatus } from "../../commands/active.js";
import { renderInFlightWarning } from "../../lib/git/in-flight-derivation.js";
import type { GitExec } from "../../lib/git/index.js";
import { readGitBlobEntry } from "../../lib/io-context.js";
import type { StoreRefusal } from "../../lib/store/refusal.js";
import type { LifecycleIndexOutcome } from "../../lib/store/lifecycle-index.js";
import type { Store } from "../../lib/store/contract.js";
import { createStore } from "../../lib/store/create.js";
import { createDefaultStorePorts } from "../../lib/store/default-ports.js";
import { readLifecycleView } from "../../lib/store/lifecycle-view.js";
import { readLifecycleDesign } from "../../lib/store/lifecycle-design.js";
import { readWorkUnit, usesOffBranchState } from "../../lib/store/lifecycle-write.js";
import { ParsedMetaRecordSchema } from "../../lib/active/meta-schema.js";
import { extractWorkUnitPurpose, readWorkUnitPurpose } from "../../lib/status/work-unit-purpose.js";
import {
  projectScopeWindow,
  readDerivedSlugPosition,
  type DerivedSlugPosition,
  type ScopeWindowFact,
} from "../../lib/status/slug-position.js";
import type { DerivedCheckoutRow } from "../../lib/locus/derived-roster.js";
import { readConfigSettings } from "../../lib/config/status-reader.js";
import { runDerivedLocusStateProbe } from "../derived-locus-state-probe.js";
import { resolveCallerComposedLifecycleIndex } from "../../lib/work-unit/composed-lifecycle-index.js";
import { resolveSlugQuery, type SlugStateQuery } from "../../lib/work-unit/lifecycle-query.js";
import {
  parseIntegrationBoundaryLocus,
  type IntegrationBoundaryLocus,
} from "../../scripts/review-gate/policy/integration-boundary-locus.js";
import { readIdentityPointers } from "../identity-pointers.js";
import type { StatusCliOptions } from "./input.js";

/**
 * Render one lifecycle subject from local or explicitly live evidence.
 * @param cwd - Project checkout root.
 * @param exec - Request Git executor.
 * @param slug - Validated work-unit slug.
 * @param opts - Validated status options.
 * @returns Completion after writing the lifecycle query.
 */
export async function handleLifecycleStatus(
  cwd: string,
  exec: GitExec,
  slug: string,
  opts: StatusCliOptions,
  store?: Store,
): Promise<void> {
  store ??= createStore(createDefaultStorePorts({ checkoutRoot: cwd, exec }));
  if (usesOffBranchState(store)) {
    await handleStoreLifecycleStatus(store, slug, opts);
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
    slug, worktreePath, identity, readRoster: (id) => readCheckoutRoster(cwd, exec, id),
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

/** Bind the checkout roster read to the derived locus reader. */
async function readCheckoutRoster(cwd: string, exec: GitExec, identity: string): Promise<readonly DerivedCheckoutRow[]> {
  const { settings } = await readConfigSettings(cwd);
  const frame = await runDerivedLocusStateProbe({ cwd, identity, baseBranch: settings["branch.base"], exec });
  return frame.roster;
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
async function handleStoreLifecycleStatus(store: Store, slug: string, opts: StatusCliOptions): Promise<void> {
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
  const query = resolveSlugQuery(view.result.index, record.status === "ok" ? record.result.reference.owner.name : slug);
  const fields = record.status === "ok" ? ParsedMetaRecordSchema.safeParse(record.result.fields) : undefined;
  const design = record.status === "ok" ? await readLifecycleDesign(store, record.result) : { content: null, warnings: [] };
  const warnings = [...design.warnings, ...lifecycleListingWarnings(view.result.listing)];
  const purpose = design.content === null ? null : extractWorkUnitPurpose(design.content);
  const output = { ...query, purpose, owner: fields?.success === true ? fields.data.owner : null,
    integrationBoundary: null, ...(warnings.length === 0 ? {} : { warnings: [...new Set(warnings)] }) };
  if (opts.json) process.stdout.write(`${JSON.stringify(output)}\n`);
  else {
    p.intro("arc status");
    p.note(formatSlugStateQuery(query, { purpose, warnings }), "Lifecycle state");
    p.outro("Done.");
  }
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
