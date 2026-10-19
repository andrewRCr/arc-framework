/** Lifecycle checkout claim operations bound to one operational context. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { SlugSchema } from "../kernel/index.js";
import { ParsedMetaRecordSchema } from "../active/meta-schema.js";
import type { Store } from "../store/contract.js";
import type { GitExec } from "../git/exec.js";
import { scanRegisteredWorktrees } from "../git/worktree-roster.js";
import { createWorktreeMarkerGeneration, decodeWorktreeMarkerOwnership, ensureWorktreeMarkerIgnored,
  readWorktreeMarkerGeneration, replaceWorktreeMarkerGeneration, resolveWorktreeMarkerPath } from "../git/worktree-marker.js";
import type { LocusPorts } from "../work-unit/locus-ports.js";

interface MarkerHolder { path: string; name: string }
const rerun = "Run again once Git lists all registered worktrees.";

/** Bind lifecycle's checkout claims to the selected checkout, executor and store. */
export function createLocusPorts(input: { cwd: string; exec: GitExec; store: Store }): LocusPorts {
  const exec: GitExec = (command, args, options) => input.exec(command, args, { cwd: input.cwd, ...options });
  async function holders(): Promise<MarkerHolder[]> {
    const topology = await scanRegisteredWorktrees(exec);
    if (!topology.ok) throw new Error(`${topology.message} ${rerun}`);
    if (topology.worktrees.length === 0) throw new Error(`The registered-worktree listing is incomplete. ${rerun}`);
    const holders: MarkerHolder[] = [];
    for (const checkout of topology.worktrees) {
      const holder = await readMarkerHolder(checkout.path);
      if (holder !== null) holders.push(holder);
    }
    return holders;
  }
  async function refusal(holder: MarkerHolder): Promise<string> {
    const lookup = await input.store.lookup({ kind: "claim", claim: { kind: "work-unit", slug: SlugSchema.parse(holder.name) } });
    let state: string | null = null;
    let owner: string | null = null;
    if (lookup.status === "ok") {
      const record = await input.store.read({ reference: lookup.result.reference });
      if (record.status === "ok") {
        const parsed = ParsedMetaRecordSchema.safeParse(record.result.fields);
        if (parsed.success) { state = parsed.data.state; owner = parsed.data.owner; }
      }
    }
    const location = `Checkout ${holder.path} already holds work unit '${holder.name}' in ${resolveWorktreeMarkerPath(holder.path)}.`;
    const repair = state === "Integrating"
      ? "Work there to finish integration, then run teardown there."
      : state === "Planning" || state === "Active"
        ? `Work there, or as owner${owner === null ? "" : ` '${owner}'`} run arc pause ${holder.name} --reason <text>, then arc locus release ${holder.name} there.`
        : `Work there, or free that checkout there with arc locus release ${holder.name}.`;
    return `${location} ${repair}`;
  }
  return {
    checkMarkerExclusivity: async request => {
      let inventory: MarkerHolder[];
      try { inventory = await holders(); }
      catch (error) { return { kind: "refused", reason: error instanceof Error ? error.message : String(error) }; }
      const other = inventory.find(holder => holder.name === request.name
        && (request.checkoutPath === undefined || resolve(holder.path) !== resolve(request.checkoutPath)));
      return other === undefined ? { kind: "clear" } : { kind: "refused", checkoutPath: other.path, reason: await refusal(other) };
    },
    findHoldingCheckout: async ({ name }) => {
      const matches = (await holders()).filter(holder => holder.name === name);
      if (matches.length > 1) throw new Error(`Work unit '${name}' has multiple marker holders: ${matches.map(holder => `${holder.path} (${resolveWorktreeMarkerPath(holder.path)})`).join(", ")}. Inspect them, then repair or remove the stray marker, or remove its checkout.`);
      return matches[0]?.path ?? null;
    },
    writeAnchoredMarker: async (cwd, marker, options) => {
      await ensureWorktreeMarkerIgnored(cwd, exec, { mkdir: async (path, options) => { await mkdir(path, options); }, readFile: path => readFile(path, "utf8"), writeFile });
      return options?.expected === undefined ? createWorktreeMarkerGeneration(cwd, marker)
        : replaceWorktreeMarkerGeneration(cwd, options.expected, marker);
    },
  };
}
function markerRepair(checkout: string, path: string, diagnostic: string): string {
  return `Cannot read checkout ${checkout}'s marker ${path}: ${diagnostic}. inspect it, then repair or remove its marker, or remove the checkout.`;
}

async function readMarkerHolder(checkout: string): Promise<MarkerHolder | null> {
  const path = resolveWorktreeMarkerPath(checkout);
  let marker;
  try { marker = await readWorktreeMarkerGeneration(checkout); }
  catch (error) { throw new Error(markerRepair(checkout, path, error instanceof Error ? error.message : String(error)), { cause: error }); }
  if (marker.kind === "absent") return null;
  if (marker.kind === "malformed") throw new Error(markerRepair(checkout, marker.path, marker.message));
  if (marker.marker.husk !== undefined) return null;
  const ownership = decodeWorktreeMarkerOwnership(marker.marker);
  if (ownership.kind !== "current") throw new Error(markerRepair(checkout, path, `Marker ownership is ${ownership.reason}`));
  return ownership.subject.kind === "work-unit" ? { path: checkout, name: ownership.subject.name } : null;
}
