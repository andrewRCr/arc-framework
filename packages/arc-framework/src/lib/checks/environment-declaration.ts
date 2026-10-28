/** Portable explicit child-environment bindings and reserved execution channels. */
import { z } from "zod";
import { GIT_REPOSITORY_LOCAL_ENVIRONMENT } from "../git/repository-environment.mjs";
import { CHECK_EXECUTION_ENVIRONMENT } from "./environment-policy.js";

const INPUT_NAME_ERROR = "environment_inputs requires portable environment names; remove or repair the binding and retry the check request.";
const InputNameSchema = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/u, { error: INPUT_NAME_ERROR });
const INPUT_KIND_ERROR = "environment_inputs kinds must be value or file; remove or repair the binding and retry the check request.";
const InputKindSchema = z.enum(["value", "file"], { error: INPUT_KIND_ERROR });

// Zod records deliberately discard __proto__. It is a valid environment name: validate its kind explicitly and
// intersect the authored object so the object-spread merge retains it as an own data property.
const AuthoredInputsSchema = z.unknown().superRefine((input, context) => {
  if (typeof input !== "object" || input === null || !Object.hasOwn(input, "__proto__")) return;
  const result = InputKindSchema.safeParse(Reflect.get(input, "__proto__"));
  if (!result.success) context.addIssue({ code: "custom", path: ["__proto__"],
    message: INPUT_KIND_ERROR });
});

// The record-level key error keeps the repair route in the top-level issue that declaration readers print.
const AuthoredNamesSchema = z.record(InputNameSchema, InputKindSchema,
  { error: issue => issue.code === "invalid_key" ? INPUT_NAME_ERROR : undefined });

/** Authored names and kinds only; this schema never reads values or files. */
export const EnvironmentInputsSchema = z.intersection(AuthoredNamesSchema, AuthoredInputsSchema)
  .superRefine((inputs, context) => {
    const names = new Set<string>();
    for (const name of Object.keys(inputs)) {
      const portable = name.toUpperCase();
      if (names.has(portable)) context.addIssue({ code: "custom", path: [name],
        message: `environment_inputs has a portable duplicate ${name}; remove the duplicate binding and retry the check request.` });
      if (CHECK_EXECUTION_ENVIRONMENT.has(portable) || GIT_REPOSITORY_LOCAL_ENVIRONMENT.has(portable)) {
        context.addIssue({ code: "custom", path: [name],
          message: `environment_inputs binding ${name} overrides engine-owned execution or Git repository selection; remove this binding and retry the check request.` });
      }
      names.add(portable);
    }
  });

/** Declared input names mapped to their capture policy. */
export type EnvironmentInputDeclarations = z.infer<typeof EnvironmentInputsSchema>;
