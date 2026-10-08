/** Candidate decision cases exercised through public handlers and real Git. */

const INTEGRATION_CASES = new Set([
  "composes the settlement plan its approved responses back",
  "binds settlement composition to the checkpoint-validated base after the base ref moves",
  "refuses a Candidate-bound disposition whose local review source disappeared",
  "refuses a Candidate-named disposition whose record is malformed",
  "ignores unrelated disposition residue whose source is unavailable",
  "ignores malformed disposition residue outside Candidate applicability",
  "fails closed on final drift before any merge",
  "fails closed on a substituted checkpoint handle",
  "keeps a settled-findings verdict outstanding until a complete clean pass",
  "leaves review required while the reserved source has returned no verdict",
  "requires the reserved source before a moved-head Candidate selection",
  "offers singleton Candidate selection for a prior hosted review with a changed contribution",
  "reports a work unit with no recorded publication boundary as blocked",
  "projects a mechanically carried Candidate as the effective pre-publication target",
  "advances the lineage, blocks the checkpoint, and clears through attest",
  "converges when an operational-only commit precedes the re-attestation",
  "does not advance an owned Candidate from an unresolved work-unit carrier",
  "keeps one marker-owned work-unit locus through correction, review, verification, and integration entry",
]);

const NATIVE_CASES = {
  correction: new Set([
    "advances the root Candidate after a private delivery-member frontline fix",
    "keeps bound delivery-member frontline authority on the bound route",
    "refuses a reachable commit outside the current Candidate frontline target",
    "resumes a Candidate change-set fix before requiring a new root",
    "replays an already-settled no-fix Candidate response at terminal settlement",
  ]),
  currentness: new Set([
    "keeps lifecycle-regenerated project state outside Candidate currentness",
    "keeps a Candidate current across the archive relocation a with-integration ship performs",
    "keeps an edited relocated work-unit artifact evidence-neutral",
    "keeps an open-ended work-unit companion current across archive relocation",
    "refuses two live artifacts that collapse onto one canonical Candidate key",
    "clears a Candidate no response can explain through a deliberately re-rooted lineage",
    "refuses an exact re-root continuation after its staged subject changes",
    "resolves review responses and deliberate re-rooting from an archived Shipped record",
    "does not advance a completed Candidate while another work unit owns the checkout",
  ]),
  settlement: new Set([
    "advances and replays a settled hosted fix through Candidate convergence",
    "carries an approved no-fix set into the post-approval settlement plan",
    "replays a no-fix set reviewed at the approved head during checkpoint settlement",
    "scopes fix-bearing responses to the full Candidate span",
    "repeats the settlement pass without appending a second response",
    "executes the persisted plan idempotently against the durable review records",
  ]),
};

export type CandidateLineagePartition = keyof typeof NATIVE_CASES;

/** Select one faithful tier and native file partition for a Candidate case. */
export function selectsCandidateLineageCase(
  mode: "integration" | "e2e", name: string, partition?: CandidateLineagePartition,
): boolean {
  if (INTEGRATION_CASES.has(name)) return mode === "integration";
  if (mode === "integration") return false;
  if (partition === undefined) throw new Error("Native Candidate coverage requires a file partition");
  if (!Object.values(NATIVE_CASES).some((cases) => cases.has(name))) {
    throw new Error(`Candidate case has no native partition: ${name}`);
  }
  return NATIVE_CASES[partition].has(name);
}
