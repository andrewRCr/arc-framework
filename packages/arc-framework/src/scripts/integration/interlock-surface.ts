/** Precomposed, exception-filtered machine evidence for integration approval. */

import { z } from "zod";

const SignalKindSchema = z.enum([
  "base-drift",
  "candidate",
  "lifecycle",
  "change-request",
  "requirements",
  "required-checks",
  "merge-method",
  "settlement",
  "checkpoint",
]);

export const CheckpointMachineSignalSchema = z.strictObject({
  kind: SignalKindSchema,
  label: z.string().trim().min(1),
  clean: z.boolean(),
  evidence: z.string().trim().min(1),
});
export type CheckpointMachineSignal = z.infer<typeof CheckpointMachineSignalSchema>;

const CheckpointMachineSignalsSchema = z.array(CheckpointMachineSignalSchema).length(9).superRefine(
  (signals, context) => {
    const kinds = signals.map(({ kind }) => kind);
    if (new Set(kinds).size !== SignalKindSchema.options.length) {
      context.addIssue({ code: "custom", message: "machine signals must contain every signal kind exactly once" });
    }
  },
);

export const CheckpointInterlockSurfaceSchema = z.strictObject({
  machineEvidence: z.strictObject({
    state: z.enum(["clean", "exceptions"]),
    text: z.string().min(1),
  }),
  extensionReport: z.strictObject({
    label: z.literal("Extension report"),
    content: z.null(),
  }),
});
export type CheckpointInterlockSurface = z.infer<typeof CheckpointInterlockSurfaceSchema>;

/**
 * Collapse clean signals and expand only machine-computed exceptions into approval text.
 *
 * The tail reference is named rather than expanded: the disclosure at the stop narrows to the
 * artifacts carrying review signal, so the approver reads this to self-serve what it excluded.
 *
 * @param input - Exact merge coordinates, candidate-tail reference, review carrier, and machine signals.
 * @returns The deterministic approval text and empty extension-report slot.
 */
export function composeCheckpointInterlockSurface(input: {
  approvedHead: string;
  repository: string;
  pullRequest: number;
  method: "merge" | "rebase" | "squash";
  candidateTailReference: string;
  reviewLanding: string;
  signals: readonly CheckpointMachineSignal[];
}): CheckpointInterlockSurface {
  const signals = CheckpointMachineSignalsSchema.parse(input.signals);
  const exceptions = signals.filter(({ clean }) => !clean);
  const decision = `Approve merge of ${input.approvedHead} via ${input.method} for `
    + `${input.repository}#${input.pullRequest}.\nCandidate tail: ${input.candidateTailReference}`
    + `\nReview landed: ${input.reviewLanding}`;
  const text = exceptions.length === 0
    ? `${decision}\nMachine evidence: ${signals.length} checks clean.`
    : `${decision}\nMachine evidence exceptions:\n${exceptions
      .map(({ label, evidence }) => `- ${label}: ${evidence}`)
      .join("\n")}`;
  return CheckpointInterlockSurfaceSchema.parse({
    machineEvidence: {
      state: exceptions.length === 0 ? "clean" : "exceptions",
      text,
    },
    extensionReport: { label: "Extension report", content: null },
  });
}
