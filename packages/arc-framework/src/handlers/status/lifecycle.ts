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
import { createStore } from "../../lib/store/create.js";
import { createDefaultStorePorts } from "../../lib/store/default-ports.js";
import { readLifecycleView } from "../../lib/store/lifecycle-view.js";
import { readLifecycleDesign } from "../../lib/store/lifecycle-design.js";
import { readWorkUnit, usesOffBranchState } from "../../lib/store/lifecycle-write.js";
import { ParsedMetaRecordSchema } from "../../lib/active/meta-schema.js";
import { extractWorkUnitPurpose, readWorkUnitPurpose } from "../../lib/status/work-unit-purpose.js";
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
  ports?: StoreLifecycleStatusPorts,
): Promise<void> {
  store ??= createStore(createDefaultStorePorts({ checkoutRoot: cwd, exec }));
  if (usesOffBranchState(store)) {
    await handleStoreLifecycleStatus(store, slug, opts, { cwd, exec }, ports);
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
  const warnings = [
    ...composed.qualityFacts.warnings.map(renderInFlightWarning),
    ...(opts.fetch === true && composed.qualityFacts.unreachable === true
      ? ["Remote unreachable; query derived from local refs only."]
      : []),
    ...operational.warnings,
  ];
  const output = {
    ...query,
    purpose,
    owner,
    integrationBoundary: operational.integrationBoundary,
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
  local: { cwd: string; exec: GitExec }, ports?: StoreLifecycleStatusPorts): Promise<void> {
  const refreshWarnings = opts.fetch === true ? await pullStoreStatus(ports) : [];
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
  const query = resolveSlugQuery(view.result.index, record.status === "ok" ? record.result.reference.owner.name : slug);
  const fields = record.status === "ok" ? ParsedMetaRecordSchema.safeParse(record.result.fields) : undefined;
  const design = record.status === "ok" ? await readLifecycleDesign(store, record.result) : { content: null, warnings: [] };
  const locus = await readStoreStatusLocus({ ...local, store, slug: query.slug, fetch: false }, ports);
  const warnings = [...design.warnings, ...lifecycleListingWarnings(view.result.listing), ...locus.warnings, ...refreshWarnings];
  const purpose = design.content === null ? null : extractWorkUnitPurpose(design.content);
  const output = { ...query, purpose, owner: fields?.success === true ? fields.data.owner : null,
    integrationBoundary: null, ...(locus.worktreePath === undefined ? {} : { worktreePath: locus.worktreePath }), ...(warnings.length === 0 ? {} : { warnings: [...new Set(warnings)] }) };
  if (opts.json) process.stdout.write(`${JSON.stringify(output)}\n`);
  else {
    p.intro("arc status");
    p.note(formatSlugStateQuery(query, { purpose, worktreePath: locus.worktreePath, warnings }), "Lifecycle state");
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
