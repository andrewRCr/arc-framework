/** Read checkout-owned active layout coordinates without consulting projected records. */
import { decodeWorktreeMarkerOwnership, readWorktreeMarker } from "../git/worktree-marker.js";
import { ArcError, SlugSchema } from "../kernel/index.js";
import type { ActiveLayoutContext } from "../layout/index.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ARC_CONFIG_SUFFIX } from "../constants.js";
import { parseArcConfig } from "../config/index.js";
import { ArcConfigSchema } from "../config/schema.js";
import { projectionProcessState } from "./projection/process-state.js";

/** Resolve active context only for a root whose selected operational store is off branch. */
export async function resolveCheckoutLayoutContext(checkoutRoot: string): Promise<ActiveLayoutContext | undefined> {
  return projectionProcessState().capabilities.get(checkoutRoot) === true ? readCheckoutLayoutContext(checkoutRoot) : undefined;
}

/** Read this command's cached claim; absent and terminal claims own no active folder. */
export async function readCheckoutLayoutContext(checkoutRoot: string, options: { fresh?: boolean } = {}): Promise<ActiveLayoutContext> {
  const contexts = projectionProcessState().layoutContexts;
  const existing = options.fresh ? undefined : contexts.get(checkoutRoot);
  if (existing !== undefined) return existing;
  const pending = readFreshCheckoutLayoutContext(checkoutRoot);
  contexts.set(checkoutRoot, pending);
  try { return await pending; }
  catch (error) {
    if (contexts.get(checkoutRoot) === pending) contexts.delete(checkoutRoot);
    throw error;
  }
}

async function readFreshCheckoutLayoutContext(checkoutRoot: string): Promise<ActiveLayoutContext> {
  const [read, layoutActive] = await Promise.all([readWorktreeMarker(checkoutRoot).catch((error: unknown) => {
    throw new ArcError(`Cannot read the checkout marker at ${checkoutRoot}. Repair its readability, then retry.`,
      "store.layout-marker-unreadable", { cause: error });
  }), readActiveLayout(checkoutRoot)]);
  if (read.kind === "malformed") throw new ArcError(`${read.path}: ${read.message}. Repair or remove the marker, then retry.`, "store.layout-marker-invalid");
  if (read.kind === "absent" || read.marker.husk !== undefined) return { claim: null, layoutActive };
  const ownership = decodeWorktreeMarkerOwnership(read.marker);
  if (ownership.kind !== "current") throw new ArcError(`The checkout marker at ${checkoutRoot} requires manual repair (${ownership.reason}). `
    + "Inspect and repair or release its claim, then retry.", "store.layout-marker-invalid");
  const subject = ownership.subject;
  const claim = subject.kind === "work-unit" ? subject.name
    : subject.kind === "errand" || subject.kind === "partial-errand" ? subject.slug : null;
  return { claim: claim === null ? null : SlugSchema.parse(claim), layoutActive };
}

async function readActiveLayout(checkoutRoot: string): Promise<ActiveLayoutContext["layoutActive"]> {
  const path = join(checkoutRoot, ".arc", ...ARC_CONFIG_SUFFIX);
  let content: string;
  try { content = await readFile(path, "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "nested";
    throw new ArcError(`Cannot read ${path}. Restore a readable project configuration, then retry.`, "store.layout-config-invalid", { cause: error });
  }
  const parsed = ArcConfigSchema.safeParse(parseArcConfig(content));
  if (!parsed.success) throw new ArcError(`Invalid project configuration at ${path}: ${parsed.error.message}. Correct it, then retry.`, "store.layout-config-invalid");
  return parsed.data["layout.active"] === "flat" ? "flat" : "nested";
}
