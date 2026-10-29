/** Transient authority for deferred writes to a source-specific comparison namespace. */
import type { RefBackendContext } from "./context.js";
import { readRefDesignation, type RefRemoteDesignation } from "./designation.js";
import { EffectiveTransportError, readNamedTransport, readRemoteTransports, resolveLiteralTransport } from "./effective-transport.js";
import { withRefFetchKeepers } from "./fetch-seen.js";
import { readRefRepository } from "./repository.js";
import { readSyncRefs } from "./sync-graph.js";
import { withRefLocks } from "./write-locks.js";

/** A source's configured owner and effective observation/publication endpoints, independent of role. */
export interface ComparisonSource {
  name: string; repository: "code" | "backing"; url: string; fetchUrl: string; pushUrls?: readonly string[];
}
/** Physical selection and optional local expected tip captured before an isolated observation. */
export interface ComparisonWitness {
  commonDir: string; gitDir: string | null; source: ComparisonSource; ref?: string; expected?: string | null;
}
type NamedSource = Pick<ComparisonSource, "name" | "repository" | "url"> & Partial<Pick<ComparisonSource, "fetchUrl">>;

/** Capture a matching source under layout protection; a local tip or publication also requires its keeper lease. */
export async function captureComparisonWitness(context: RefBackendContext, source: NamedSource,
  ref?: string, publication = false, target?: string): Promise<ComparisonWitness | null> {
  return withComparisonScope(context, source.name, async physical => {
    const actual = await readComparisonSource(physical, source, publication), coordinate = physical.repository;
    if (!actual || !coordinate) return null;
    if (target !== undefined && !await publicationTargetMatches(physical, actual, target)) return null;
    return { commonDir: coordinate.commonDir, gitDir: coordinate.gitDir, source: actual,
      ...ref ? { ref, expected: (await readSyncRefs(physical, ref)).get(ref) ?? null } : {} };
  }, publication || ref !== undefined);
}

/** Finalize only in the same physical and configured source while layout and keeper leases are held. */
export async function withComparisonWitness<T>(context: RefBackendContext, witness: ComparisonWitness | null,
  operation: (physical: RefBackendContext) => Promise<T>): Promise<{ status: "unbound" } | { status: "bound"; result: T }> {
  if (!witness) return { status: "unbound" };
  return withComparisonScope(context, witness.source.name, async physical => {
    const coordinate = physical.repository;
    if (coordinate?.commonDir !== witness.commonDir || coordinate.gitDir !== witness.gitDir) return { status: "unbound" };
    let actual: ComparisonSource | null;
    try { actual = await readComparisonSource(physical, witness.source, witness.source.pushUrls !== undefined); }
    catch (error) {
      // Invalid current transport cannot authorize a comparison write or revoke completed remote work.
      if (error instanceof EffectiveTransportError) return { status: "unbound" };
      throw error;
    }
    if (!actual || !sameComparisonSource(actual, witness.source)) return { status: "unbound" };
    return { status: "bound", result: await operation(physical) };
  });
}

async function withComparisonScope<T>(context: RefBackendContext, remote: string,
  operation: (physical: RefBackendContext) => Promise<T>, keepers = true): Promise<T> {
  const source = context.repository?.source ?? context;
  return withRefLocks(source, ["layout"], async () => {
    const physical = await readRefRepository(source);
    return keepers ? withRefFetchKeepers(physical, remote, () => operation(physical)) : operation(physical);
  });
}

async function readComparisonSource(physical: RefBackendContext, expected: NamedSource,
  publication: boolean): Promise<ComparisonSource | null> {
  const source = physical.repository?.source ?? physical;
  const designation = await readRefDesignation(source, physical.repository?.commonDir);
  const remote = expected.repository === "code" ? designation.codeRemotes.find(row => row.name === expected.name) : designation.backing;
  if (!remote || remote.name !== expected.name || remote.url !== expected.url) return null;
  const owner = remote.repository === "backing" ? physical : source;
  const transport = publication ? await readRemoteTransports(owner, remote.name)
    : { fetchUrl: (await readNamedTransport(owner, remote.name, "fetch"))[0] ?? "" };
  if (!transport.fetchUrl) throw new Error(`Remote ${remote.name} has no effective fetch URL. Repair its URL and retry.`);
  if (expected.fetchUrl !== undefined && transport.fetchUrl !== expected.fetchUrl) return null;
  return { name: remote.name, repository: remote.repository, url: remote.url, fetchUrl: transport.fetchUrl,
    ..."pushUrls" in transport ? { pushUrls: publicationReceivers(remote, designation.codeRemote, transport.pushUrls) } : {} };
}

function publicationReceivers(remote: RefRemoteDesignation, codeRemote: string | null, pushUrls: string[]): string[] {
  return remote.repository === "code" && remote.name !== codeRemote ? pushUrls.slice(0, 1) : pushUrls;
}

async function publicationTargetMatches(physical: RefBackendContext, source: ComparisonSource, target: string): Promise<boolean> {
  const names = (await physical.exec("git", ["remote"], { cwd: physical.checkoutRoot, objectAccess: "local-only" })).stdout.split(/\r?\n/u);
  const receivers = names.includes(target) ? await readNamedTransport(physical, target, "push")
    : await resolveLiteralTransport(physical, target, "push");
  return JSON.stringify(receivers) === JSON.stringify(source.pushUrls);
}

/** Compare only observation authority, allowing callers to carry unrelated recorded fields. */
export function sameComparisonSource(left: ComparisonSource, right: ComparisonSource): boolean {
  return left.name === right.name && left.repository === right.repository && left.url === right.url && left.fetchUrl === right.fetchUrl
    && JSON.stringify(left.pushUrls) === JSON.stringify(right.pushUrls);
}
