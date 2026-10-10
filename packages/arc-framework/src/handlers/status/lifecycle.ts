/** Subject-keyed lifecycle queries and their operational boundary rendering. */

import * as p from "../../lib/terminal.js";
import { readdir, readFile } from "node:fs/promises";
import { runActiveStatus } from "../../commands/active.js";
import { renderInFlightWarning } from "../../lib/git/in-flight-derivation.js";
import type { GitExec } from "../../lib/git/index.js";
import { readGitBlobEntry } from "../../lib/io-context.js";
import { readWorkUnitPurpose } from "../../lib/status/work-unit-purpose.js";
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
): Promise<void> {
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
