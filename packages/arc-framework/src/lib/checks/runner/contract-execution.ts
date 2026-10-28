/** Captured bindings and fixed child invocations shared by runner operations. */
import { z } from "zod";
import type { CapturedBinding } from "../environment-inputs.js";
import type { CheckContentContext } from "../environment-policy.js";
import { EnvironmentInputsSchema } from "../environment-declaration.js";
import { CanonicalDigestSchema } from "../../kernel/schema/vocabulary.js";
import { isWellFormedUnicode } from "../../kernel/canonical/unicode.js";
import { GitObjectIdSchema, SourceRelativePathSchema } from "./contract-source.js";

/** Conversation-local opaque identifier, preserved without normalization. */
export const OpaqueIdSchema = z.string().min(1);
/** Literal child argv without shell expansion or NUL characters. */
export const NativeArgvSchema = z.tuple([z.string().min(1).refine(value => !value.includes("\0"))])
  .rest(z.string().refine(value => !value.includes("\0")));
/** Captured-root-relative child working directory. */
export const InvocationCwdSchema = z.union([z.literal("."), SourceRelativePathSchema]);

/** Caller-side handle to a run-owned readable source or input artifact. */
export const ArtifactPathSchema = z.string().min(1).refine(value => isWellFormedUnicode(value) && !value.includes("\0"));

const ValueBindingSchema = z.discriminatedUnion("state", [
  z.strictObject({ kind: z.literal("value"), state: z.literal("unset") }),
  z.strictObject({ kind: z.literal("value"), state: z.literal("set"), value: z.string() }),
]);
const FileBindingSchema = z.discriminatedUnion("state", [
  z.strictObject({ kind: z.literal("file"), state: z.enum(["unset", "empty"]) }),
  z.strictObject({ kind: z.literal("file"), state: z.literal("file"), path: ArtifactPathSchema,
    digest: CanonicalDigestSchema, bytes: z.int().nonnegative() }),
]);

/** One captured caller binding, independent of worker ambient values. */
export const CapturedBindingSchema: z.ZodType<CapturedBinding> = z.union([ValueBindingSchema, FileBindingSchema]);

// Zod records discard __proto__; validate its value before retaining the authored own property.
const AuthoredBindingsSchema = z.unknown().superRefine((input, context) => {
  if (typeof input !== "object" || input === null || !Object.hasOwn(input, "__proto__")) return;
  const parsed = CapturedBindingSchema.safeParse(Reflect.get(input, "__proto__"));
  if (!parsed.success) context.addIssue({ code: "custom", path: ["__proto__"], message: "Invalid captured binding" });
});

/** Exact captured bindings keyed by portable environment names. */
export const CapturedEnvironmentSchema = z.intersection(z.record(z.string(), CapturedBindingSchema), AuthoredBindingsSchema)
  .superRefine((bindings, context) => {
    const declarations = Object.fromEntries(Object.entries(bindings).map(([name, binding]) => [name, binding.kind]));
    const parsed = EnvironmentInputsSchema.safeParse(declarations);
    if (!parsed.success) for (const issue of parsed.error.issues) {
      context.addIssue({ code: "custom", path: issue.path, message: issue.message });
    }
  });

/** Explicit file-check environment channels, independent of source object availability. */
export const CommandContentSchema: z.ZodType<CheckContentContext> = z.strictObject({
  tree: GitObjectIdSchema, base: GitObjectIdSchema.optional(), merged: z.array(GitObjectIdSchema).optional(),
});
const invocationFields = { id: OpaqueIdSchema, cwd: InvocationCwdSchema, commandContent: CommandContentSchema.optional() };
/** One fixed native command invocation. */
export const InvocationSchema = z.discriminatedUnion("shell", [
  z.strictObject({ ...invocationFields, shell: z.literal(false), argv: NativeArgvSchema }),
  z.strictObject({ ...invocationFields, shell: z.literal(true), argv: z.tuple([z.string().refine(value => !value.includes("\0"))]) }),
]);
/** One execution-environment fingerprint probe. */
export const ProbeSchema = z.strictObject({ id: OpaqueIdSchema, argv: NativeArgvSchema, cwd: InvocationCwdSchema });

/** Fixed command and its explicit engine-owned environment policy. */
export type Invocation = z.infer<typeof InvocationSchema>;
/** Fixed execution-runtime fingerprint probe. */
export type Probe = z.infer<typeof ProbeSchema>;
/** Captured caller inputs with native presence semantics. */
export type CapturedEnvironment = z.infer<typeof CapturedEnvironmentSchema>;
