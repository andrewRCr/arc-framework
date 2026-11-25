/** Strict decoding and acquisition of the restore decision that survives deletion of import evidence. */
import { z } from "zod";
import type { WindowRestoreContext } from "./restore.js";
import { WindowRefusal } from "./result.js";
import { isWindowIdentityRef } from "./transients.js";
import { GIT_OBJECT_ID_PATTERN } from "../../lib/git/object-id.js";

const oid = z.string().regex(GIT_OBJECT_ID_PATTERN);
/** The refs a restore decision and its `--accept` operands may name. */
export const WINDOW_DECISION_REF_PATTERN = /^refs\/arc\/[^\s\0]+$/u;
const ref = z.string().regex(WINDOW_DECISION_REF_PATTERN);
const documentSchema = z.strictObject({
  version: z.literal(1), windowTip: oid, regime: z.enum(["unconsumed", "kept", "records"]),
  identities: z.array(z.strictObject({ ref, held: oid.nullable(), kept: oid.nullable(), outcome: z.enum(["equal", "accepted", "unconsumed"]) })),
  accepted: z.array(z.strictObject({ ref, value: oid.nullable() })),
  differences: z.array(z.strictObject({ subject: z.string(), condition: z.string(), remedy: z.string() })),
});
/** Immutable consumption facts and exact accepted values retained under the window hold. */
export type WindowRestoreDecision = z.infer<typeof documentSchema>;
type HeldWindow = Pick<WindowRestoreContext, "record" | "tip">;
const isIdentity = isWindowIdentityRef;

function refuse(condition: string): never {
  throw new WindowRefusal([{ subject: "restore decision", condition,
    remedy: "Preserve the complete hold and repair its saved restore decision before retrying; recover its original bytes from Git history when available." }]);
}

function bindsWindow(decision: WindowRestoreDecision, window: HeldWindow): boolean {
  const identities = new Map(decision.identities.map(identity => [identity.ref, identity]));
  if (decision.windowTip !== window.tip || identities.size !== decision.identities.length) return false;
  if (Object.entries(window.record.refs.local).some(([ref, tip]) => isIdentity(ref) && identities.get(ref)?.held !== tip)) return false;
  return decision.identities.every(identity => !isIdentity(identity.ref) || identity.held === (window.record.refs.local[identity.ref] ?? null));
}

function validOutcome(decision: WindowRestoreDecision, identity: WindowRestoreDecision["identities"][number]): boolean {
  const different = decision.differences.some(finding => finding.subject === identity.ref);
  if (identity.outcome === "accepted") {
    const value = decision.regime === "kept" ? identity.kept : null;
    return different && decision.accepted.some(item => item.ref === identity.ref && (decision.regime === "unconsumed" || item.value === value));
  }
  if (different) return false;
  if (decision.regime === "unconsumed") return identity.outcome === "unconsumed";
  return identity.outcome === "equal" && (decision.regime !== "kept" || identity.held === identity.kept);
}

/** Decode one complete decision and bind every identity coordinate to its original window. */
export function decodeWindowRestoreDecision(value: unknown, window: HeldWindow): WindowRestoreDecision {
  const parsed = documentSchema.safeParse(value);
  if (!parsed.success) refuse("The saved restore decision has an invalid or unsupported format.");
  if (!bindsWindow(parsed.data, window)) refuse("The saved restore decision does not match this complete hold's identity inputs.");
  const anyKept = parsed.data.identities.some(identity => identity.kept !== null);
  if ((parsed.data.regime === "kept") !== anyKept) refuse("The saved restore decision's regime contradicts its retained-tip evidence.");
  if (!parsed.data.identities.every(identity => validOutcome(parsed.data, identity))) refuse("The saved restore decision lacks the exact acceptance evidence its outcomes require.");
  return parsed.data;
}

/** Read the already recorded outcome without consulting the import evidence later restore steps remove. */
export async function readWindowRestoreDecision(context: WindowRestoreContext, tip: string): Promise<WindowRestoreDecision> {
  try {
    const { stdout } = await context.io.exec("git", ["--no-replace-objects", "show", `${tip}:restore.json`],
      { cwd: context.io.repo, objectAccess: "local-only", preserveOutput: true });
    const value: unknown = JSON.parse(stdout);
    return decodeWindowRestoreDecision(value, context);
  } catch (error) {
    if (error instanceof WindowRefusal) throw error;
    return refuse(`The saved restore decision cannot be read: ${error instanceof Error ? error.message : String(error)}`);
  }
}
