/** Preserve broken Candidate chains as source evidence while reporting their defects. */
import type { RefBackendContext } from "../context.js";
import type { ImportRecord } from "./source.js";
import type { MigrateReport } from "../../commands.js";
import { CandidateManagedRecordV1Schema, CandidateSupersessionResolutionError } from "../../../work-unit/candidate-attestation.js";
import { readRepositoryCandidateSupersessionChain } from "../../../work-unit/candidate-record-store.js";

/** The selected meta revision also bounds its Candidate path's predecessor search. */
export async function inspectCandidateChain(context: RefBackendContext, candidate: ImportRecord, revision: string | undefined, report: MigrateReport): Promise<void> {
  let value: unknown;
  try { value = JSON.parse(candidate.content); } catch { return; }
  const parsed = CandidateManagedRecordV1Schema.safeParse(value);
  if (!parsed.success) { report.brokenChains.push({ reference: candidate.reference, condition: parsed.error.message }); return; }
  try {
    await readRepositoryCandidateSupersessionChain({ cwd: context.checkoutRoot, workUnit: candidate.reference.owner.name,
      record: parsed.data, exec: context.importSource?.ports.exec ?? context.exec, revision });
  } catch (error) {
    if (!(error instanceof CandidateSupersessionResolutionError)) throw error;
    report.brokenChains.push({ reference: candidate.reference, condition: error.message });
  }
}
