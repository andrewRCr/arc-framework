/** Authority-bound presentation and application of a prepared extraction. */
import type { DecomposeContext } from "./context.js";
import type { DecomposeExtractionPlan } from "./extraction.js";
import type { DecomposeResult } from "./refusal.js";
import { reportDecomposeExtractionPreview, DecomposeFinishAppliedSchema, type DecomposeFinishReport } from "./finish-report.js";
import { applyDecomposeExtraction } from "./extraction.js";
import { decomposeFinishArgv } from "./command-argv.js";
import { renderV3DecomposeArgv } from "../work-unit/decompose-command-renderer.js";

/** Preview a fully checked extraction, or apply its approved authority. */
export async function finishDecomposeExtraction(ctx: DecomposeContext, plan: DecomposeExtractionPlan,
  authority?: string): Promise<DecomposeResult<DecomposeFinishReport>> {
  const preview = reportDecomposeExtractionPreview(plan);
  if (authority === undefined) return { status: "ok", result: preview };
  if (authority !== preview.applyAuthority) {
    const argv = decomposeFinishArgv(preview.origin.slug);
    return { status: "refused", reason: "stale-apply-authority", class: "recoverable", locus: "applyAuthority",
      remedy: { text: `Prepare and approve a fresh terminal preview with ${renderV3DecomposeArgv(argv)}.`, argv: [...argv] } };
  }
  const applied = await applyDecomposeExtraction(ctx, plan);
  if (applied.status === "refused") return applied;
  const members = plan.input.members.map(member => {
    const owner = member.primary?.reference.owner;
    return { name: member.slug, ...(owner?.type === "work-item" && owner.uid !== undefined ? { uid: owner.uid } : {}) };
  })
    .sort((a, b) => Buffer.compare(Buffer.from(a.name), Buffer.from(b.name)));
  return { status: "ok", result: DecomposeFinishAppliedSchema.parse({ kind: "applied", origin: preview.origin, members, notices: [] }) };
}
