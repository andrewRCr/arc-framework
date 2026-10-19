/** Resolve unlisted dependency names through store identities and terminal lineage. */
import type { Store } from "../store/contract.js";
import type { RecordReference } from "../store/identity.js";
import { identityKey, type LifecycleEntry } from "../store/lifecycle-index.js";
import type { Remedy, StoreResult } from "../store/refusal.js";
import { queryRetiredOriginDisposition, storeLineageEnumeration, type StoreLineageEnumeration } from "../work-unit/store-reconcile-context.js";
import { SlugSchema } from "../kernel/index.js";
import type { ProjectDependencyResolution, ProjectDependencyResolutions } from "./project-view.js";
import { storeReadFailureWarning } from "./store-project-diagnostics.js";
import { deriveState } from "../work-unit/lifecycle-resolver.js";

/** One render's lifecycle evidence and operational store. */
export interface StoreProjectDependencyOptions {
  store: Store;
  entries: readonly LifecycleEntry[];
  standingEntries: readonly LifecycleEntry[];
  failClosedNames: ReadonlySet<string>;
}

/** Resolve only edges absent from the standing graph while preserving their written names. */
export async function resolveStoreProjectDependencies(options: StoreProjectDependencyOptions): Promise<ProjectDependencyResolutions> {
  const resolver = new StoreDependencyResolver(options);
  const resolutions = new Map<string, Map<string, ProjectDependencyResolution>>();
  for (const dependent of options.standingEntries) {
    const edges = new Map<string, ProjectDependencyResolution>();
    for (const edge of dependent.fields.dependsOn) {
      if (resolver.names.has(edge)) continue;
      const resolution = await resolver.resolve(dependent, edge);
      if (resolution !== undefined) edges.set(edge, resolution);
    }
    resolutions.set(dependent.reference.owner.name, edges);
  }
  return resolutions;
}

type ResolutionStep = ProjectDependencyResolution | { kind: "retarget"; slug: string } | undefined;

class StoreDependencyResolver {
  readonly names: ReadonlySet<string>;
  readonly standing: ReadonlyMap<string, LifecycleEntry>;
  readonly entries: ReadonlyMap<string, LifecycleEntry>;
  private lineage?: Promise<StoreResult<StoreLineageEnumeration>>;

  constructor(readonly options: StoreProjectDependencyOptions) {
    this.names = new Set(options.standingEntries.map(entry => entry.reference.owner.name));
    this.standing = new Map(options.standingEntries.map(entry => [identityKey(entry.reference.owner), entry]));
    this.entries = new Map(options.entries.map(entry => [identityKey(entry.reference.owner), entry]));
  }

  async resolve(dependent: LifecycleEntry, written: string): Promise<ProjectDependencyResolution | undefined> {
    const visited = new Set<string>();
    let name = written;
    for (;;) {
      if (visited.has(name)) return this.failed(dependent, written, {
        condition: `Dependency ${written} of ${dependent.reference.owner.name} has a rename cycle at ${name}.`,
        remedy: { text: "Repair the lineage rename chain, then retry arc status --project." },
      });
      visited.add(name);
      const step = await this.resolveName(dependent, written, name);
      if (step?.kind !== "retarget") return step;
      name = step.slug;
    }
  }

  private failed(dependent: LifecycleEntry, written: string, failure: { condition: string; remedy: Remedy }): ProjectDependencyResolution {
    return { kind: "unsatisfied", warning: { ...storeReadFailureWarning(failure),
      workUnit: dependent.reference.owner.name, dependency: written } };
  }

  private async resolveName(dependent: LifecycleEntry, written: string, name: string): Promise<ResolutionStep> {
    if (this.names.has(name)) return { kind: "listed", slug: name };
    const slug = SlugSchema.safeParse(name);
    if (!slug.success) return undefined;
    if (this.options.failClosedNames.has(name)) return { kind: "unsatisfied" };
    const lookup = await this.options.store.lookup({ kind: "slug", slug: slug.data });
    if (lookup.status === "ok") return this.found(lookup.result.reference);
    if (lookup.refusal.code !== "not-found") return this.failed(dependent, written, lookup.refusal);
    return this.resolveRetired(dependent, written, name);
  }

  private found(reference: RecordReference): ProjectDependencyResolution | undefined {
    if (reference.kind !== "work-item/meta") return undefined;
    if (this.options.failClosedNames.has(reference.owner.name)) return { kind: "unsatisfied" };
    const target = this.standing.get(identityKey(reference.owner));
    if (target !== undefined) return { kind: "listed", slug: target.reference.owner.name };
    const other = this.entries.get(identityKey(reference.owner));
    return other === undefined ? { kind: "unsatisfied" } : { kind: "verdict", slug: other.reference.owner.name,
      satisfied: deriveState({ phase: other.phase, location: other.location }) === "shipped" };
  }

  private async resolveRetired(dependent: LifecycleEntry, written: string, name: string): Promise<ResolutionStep> {
    const lineage = await (this.lineage ??= storeLineageEnumeration(this.options.store));
    if (lineage.status === "refused") return this.failed(dependent, written, lineage.refusal);
    const result = await queryRetiredOriginDisposition(this.options.store, dependent.reference.owner, lineage.result,
      { origin: name, dependentSlug: dependent.reference.owner.name });
    if (result.status === "ambiguous" || result.status === "namespace-corrupt") return this.failed(dependent, written, {
      condition: result.status === "ambiguous" ? `Lineage for retired origin ${name} is ambiguous.`
        : `Lineage evidence for retired origin ${name} is incomplete or malformed.`,
      remedy: { text: "Repair the lineage records and their history, then retry arc status --project." },
    });
    const origin = lineage.result.aliases.get(name)?.[0] ?? name;
    if (result.status === "unmapped-dependent") return this.retired(dependent, written,
      `Decomposed origin ${origin} has no recorded disposition for ${dependent.reference.owner.name}.`,
      `Edit ${dependent.reference.owner.name}'s Depends On to select the intended prerequisites.`);
    if (result.status !== "unique") return undefined;
    if (result.disposition.kind === "retarget") return { kind: "retarget", slug: result.disposition.targetSlug };
    if (result.disposition.kind === "abandoned") return this.retired(dependent, written, `Abandoned origin ${origin} retains this dependency edge.`);
    const condition = result.disposition.kind === "replace"
      ? `Decomposed origin ${origin} replaces the edge with ${result.disposition.replacementTargets.join(", ")}.`
      : `Decomposed origin ${origin} drops the edge: ${result.disposition.reason}`;
    return this.retired(dependent, written, condition);
  }

  private retired(dependent: LifecycleEntry, written: string, condition: string,
    remedy = `Run arc wu reconcile --apply from ${dependent.reference.owner.name}'s checkout, or apply it during activation.`,
  ): ProjectDependencyResolution {
    return { kind: "unsatisfied", warning: { code: "dependency-retired", workUnit: dependent.reference.owner.name,
      dependency: written, rendered: `Dependency ${written} of ${dependent.reference.owner.name}: ${condition} ${remedy}` } };
  }
}
