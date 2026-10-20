/** Portable ended frontline admissions retain identity without executable launch coordinates. */
import { z } from "zod";
import { FrontlineAdmissionSchema, frontlineAdmissionOperationId } from "./frontline-admission.js";
import { FrontlineSemanticRecordSchema } from "../policy/frontline-semantic.js";

export const PortableFrontlineSourceSchema = z.discriminatedUnion("kind", [
  z.strictObject({ sourceId: z.string().min(1), kind: z.literal("command"), capability: z.null() }),
  z.strictObject({ sourceId: z.string().min(1), kind: z.literal("agent"), capability: z.string().min(1) }),
]);
export const PortableFrontlineAdmissionSchema = z.strictObject({
  ...FrontlineAdmissionSchema.shape,
  frontlineReview: z.strictObject({
    ...FrontlineSemanticRecordSchema.shape,
    action: z.literal("attempt"),
    source: PortableFrontlineSourceSchema,
    promptText: z.string().min(1),
    maxPasses: FrontlineAdmissionSchema.shape.maxPasses,
  }),
}).superRefine((admission, context) => {
  if (admission.logicalPass > admission.maxPasses
    || admission.maxPasses !== admission.frontlineReview.maxPasses) {
    context.addIssue({ code: "custom", message: "frontline admission must respect its admitted pass ceiling" });
  }
  if (admission.operationId !== frontlineAdmissionOperationId({
    target: admission.target, lineage: admission.lineage,
    sourceId: admission.frontlineReview.source.sourceId,
    logicalPass: admission.logicalPass, retryGeneration: admission.retryGeneration,
  })) context.addIssue({ code: "custom", message: "frontline operation must match its admitted producer" });
});
