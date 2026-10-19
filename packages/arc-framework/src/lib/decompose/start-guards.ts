/** Start-only admission for a new cut, independent of reusable source derivation. */
import type { DecomposeOriginRecords } from "./acquire-origin.js";
import type { DecomposeContext } from "./context.js";
import type { DecomposeRefusal } from "./refusal.js";
import { decomposeFinishArgv, decomposeReviseArgv, decomposeDiscardArgv } from "./command-argv.js";
import { renderV3DecomposeArgv } from "../work-unit/decompose-command-renderer.js";
import { splitEntryList } from "../store/concurrency/entries.js";

/** Refuse a second in-flight cut or held entries before starting another cut. */
export function checkDecomposeStart(ctx: DecomposeContext, input: DecomposeOriginRecords): DecomposeRefusal | undefined {
  const origin = input.primary.reference.owner.name;
  if (input.storedMap !== undefined) return { status: "refused", reason: "cut-in-flight", class: "recoverable",
    locus: "work-item/cut-map", remedy: { text: `Continue the stored cut with ${renderV3DecomposeArgv(decomposeFinishArgv(origin))}, ${renderV3DecomposeArgv(decomposeReviseArgv(origin))}, or ${renderV3DecomposeArgv(decomposeDiscardArgv(origin))} before starting another cut.` } };
  if (ctx.inboundGrammar === undefined) return undefined;
  for (const record of input.records) {
    if (record.reference.kind !== "work-item/inbound") continue;
    const held = splitEntryList(record.content, ctx.inboundGrammar).parts.filter(part => part.kind === "entry");
    if (held.length === 0) continue;
    const names = held.map((entry, index) => entry.id ?? `entry at position ${index + 1}`);
    const routes = held.map(entry => renderV3DecomposeArgv(["arc", "route", entry.id ?? "<entry-id>", "--from", origin,
      "--expected-version", record.version, "--to", "<destination>"]));
    return { status: "refused", reason: "inbound-held", class: "recoverable", locus: "work-item/inbound",
      message: `The origin holds inbound entries: ${names.join(", ")}.`, remedy: {
        text: `Fold the named entries into the draft or spec, or route each with ${routes.join("; ")}. An entry without an ID must first receive its managed identity or be folded into the design.` } };
  }
  return undefined;
}
