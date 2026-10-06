/** CLI adapters and command input for work-unit decomposition and extraction. */

import { join, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { readConfigSettings } from "../lib/config/status-reader.js";
import { canonicalize } from "../lib/kernel/canonical/canonical-json.js";
import { CanonicalDigestSchema } from "../lib/kernel/schema/vocabulary.js";
import { createUserIOContext, readGitBlobBytes, readGitObjectBytes } from "../lib/io-context.js";
import { getArcTemplatePath, resolveArcRoot } from "../lib/paths.js";
import { createGitV3DecomposePreflight } from "../lib/work-unit/git-decompose-v3-preflight.js";
import {
  executeGitV3DecomposeCommand,
  executeGitV3ExtractionCommand,
  GitV3DecomposeCommandRefusalSchema,
  GitV3ExtractionCommandRefusalSchema,
} from "../lib/work-unit/git-decompose-v3-operation.js";
import { V3ExtractionFinishResultSchema } from "../lib/work-unit/decompose-v3-finish.js";
import {
  V3DecomposeCoreRefusalSchema,
  v3DecomposeRemedy,
  type V3DecomposeInvocation,
} from "../lib/work-unit/decompose-v3-refusal.js";
import { finishGitV3Extraction } from "../lib/work-unit/git-decompose-v3-finish.js";
import { advanceGitDecomposeTransitionBase } from
  "../lib/work-unit/git-decompose-transition-base-advancement.js";
import { decodeV3DecomposeCutMap } from "../lib/work-unit/decompose-v3-schema.js";
import {
  DECOMPOSE_MODE_KEYS,
  decomposeOptionSelected,
  isDecomposeMachineReadableInvocation,
} from "../lib/work-unit/decompose-command-routing.js";
import { resolveUserIdentity } from "./shared.js";
import { SlugSchema } from "../lib/kernel/index.js";
import { type InteractionContext } from "../lib/command-input/interaction-context.js";
import type { CommandInputRegistration } from "../lib/command-input/registry.js";
import { refuse } from "./lifecycle-shared.js";

export {
  DECOMPOSE_MACHINE_READABLE_KEYS,
  DECOMPOSE_MODE_KEYS,
  isDecomposeMachineReadableInvocation,
} from "../lib/work-unit/decompose-command-routing.js";

function emitV3DecomposeRefusal(
  input: unknown,
  mode: "preflight" | "execute" | "extract" | "finish" | "advance-base",
): void {
  const refusal = mode === "execute"
    ? GitV3DecomposeCommandRefusalSchema.parse(input)
    : mode === "extract"
      ? GitV3ExtractionCommandRefusalSchema.parse(input)
      : V3DecomposeCoreRefusalSchema.parse(input);
  process.stdout.write(`${canonicalize(refusal)}\n`);
  process.stderr.write(`${refusal.reason}\n${refusal.remedy.text}\n`);
  process.exitCode = 1;
}

/** Decomposition modes consumed by schema exclusivity and machine-readable routing. */
export const DecomposeCommandInputSchema = z.object({
  origin: SlugSchema,
  preflight: z.literal(true).optional(),
  execute: z.string().trim().min(1).optional(),
  extract: z.string().trim().min(1).optional(),
  finish: z.string().trim().min(1).optional(),
  apply: CanonicalDigestSchema.optional(),
  advanceBase: z.string().trim().min(1).optional(),
}).strict().superRefine((value, refinement) => {
  const modes = DECOMPOSE_MODE_KEYS.filter((key) => decomposeOptionSelected(value, key)).length;
  if (modes !== 1) {
    refinement.addIssue({
      code: "custom",
      message: "Exactly one of --preflight, --execute, --extract, --finish, or --advance-base is required.",
    });
  }
  if (value.apply !== undefined && value.finish === undefined) {
    refinement.addIssue({
      code: "custom",
      path: ["apply"],
      message: "--apply is valid only with --finish.",
    });
  }
});

function v3DecomposeInvocation(
  input: z.infer<typeof DecomposeCommandInputSchema>,
): V3DecomposeInvocation {
  if (input.preflight === true) return { mode: "preflight", origin: input.origin };
  if (input.execute !== undefined) {
    return { mode: "execute", origin: input.origin, cutMapPath: input.execute };
  }
  if (input.extract !== undefined) {
    return { mode: "extract", origin: input.origin, cutMapPath: input.extract };
  }
  if (input.finish !== undefined) {
    return input.apply === undefined
      ? { mode: "finish-preview", origin: input.origin, cutMapPath: input.finish }
      : {
          mode: "finish-apply",
          origin: input.origin,
          cutMapPath: input.finish,
          applyAuthority: input.apply,
        };
  }
  if (input.advanceBase !== undefined) {
    return { mode: "advance-base", origin: input.origin, cutMapPath: input.advanceBase };
  }
  throw new Error("Validated decomposition input has no selected mode.");
}

function v3DecomposeEmissionMode(
  invocation: V3DecomposeInvocation,
): "preflight" | "execute" | "extract" | "finish" | "advance-base" {
  return invocation.mode === "finish-preview" || invocation.mode === "finish-apply"
    ? "finish"
    : invocation.mode;
}

/** Options for `arc decompose`. */
export interface DecomposeOptions {
  /** Emit one exact machine-derived starter map without mutation. */
  preflight?: true;
  /** Stage one exact repository result from a canonical completed cut map. */
  execute?: string;
  /** Stage one additive result while preserving the source origin. */
  extract?: string;
  /** Preview source thinning from one completed extraction map. */
  finish?: string;
  /** Apply the exact source-thinning preview authority. */
  apply?: string;
  /** Advance one committed full-protection candidate from its canonical completed cut map. */
  advanceBase?: string;
}

/**
 * Dispatch one closed v3 decomposition command mode.
 *
 * @param origin - Planning source slug to authenticate and inspect.
 * @param opts - Closed command mode and its exact cut-map operands.
 * @param context - Optional interaction context supplying subprocess execution.
 * @returns A promise that resolves after emitting one canonical result or refusal.
 */
export async function handleDecompose(
  origin: string | undefined,
  opts: DecomposeOptions,
  context?: InteractionContext,
): Promise<void> {
  const parsed = DecomposeCommandInputSchema.safeParse({ origin: origin?.trim(), ...opts });
  if (!parsed.success) {
    const diagnostic = z.prettifyError(parsed.error);
    if (isDecomposeMachineReadableInvocation(opts)) {
      process.stderr.write(`${diagnostic}\n`);
      process.exitCode = 1;
    } else {
      refuse(diagnostic);
    }
    return;
  }
  const cwd = resolveArcRoot();
  if (cwd === null) {
    process.stderr.write("Not inside an ARC project (no .arc/ directory found walking up from cwd).\n");
    process.exitCode = 1;
    return;
  }
  const invocation = v3DecomposeInvocation(parsed.data);
  const emissionMode = v3DecomposeEmissionMode(invocation);
  try {
    const { settings, warnings } = await readConfigSettings(cwd);
    for (const warning of warnings) process.stderr.write(`${warning}\n`);
    const io = createUserIOContext(context?.subprocess);
    if (parsed.data.preflight === true) {
      const result = await createGitV3DecomposePreflight({
        cwd,
        exec: io.exec,
        readBlob: (ref, path) => readGitBlobBytes(cwd, ref, path),
      }, settings["branch.base"], parsed.data.origin);
      if (result.status === "rejected") {
        const locus = "locus" in result ? result.locus : undefined;
        const evidence = "evidence" in result ? result.evidence : undefined;
        emitV3DecomposeRefusal({
          status: "refused",
          reason: result.reason,
          ...(locus === undefined ? {} : { locus }),
          ...(evidence === undefined ? {} : { evidence }),
          remedy: v3DecomposeRemedy({
            invocation,
            reason: result.reason,
            ...(locus === undefined ? {} : { locus }),
          }),
        }, emissionMode);
        return;
      }
      process.stdout.write(`${canonicalize(result.preflight.starterMap)}\n`);
      return;
    }
    const cohortTemplate = new Uint8Array(await readFile(join(
      getArcTemplatePath(),
      "reference",
      "templates",
      "arc",
      "work-unit",
      "template-cohort.md",
    )));
    const repository = {
      cwd,
      exec: io.exec,
      readBlob: (ref: string, path: string) => readGitBlobBytes(cwd, ref, path),
      readObject: (oid: string, objectKind: string) => readGitObjectBytes(cwd, oid, objectKind),
      cohortTemplate,
    };
    const protection = settings["branch.protection"] === "full" ? "full" : "partial";
    if (parsed.data.finish !== undefined) {
      const applyAuthority = parsed.data.apply ?? null;
      const result = V3ExtractionFinishResultSchema.parse(await finishGitV3Extraction(repository, {
        cwd,
        baseBranch: settings["branch.base"],
        origin: parsed.data.origin,
        cutMapPath: parsed.data.finish,
        applyAuthority,
      }));
      if (result.status === "refused") {
        emitV3DecomposeRefusal(result, emissionMode);
        return;
      }
      process.stdout.write(`${canonicalize(result)}\n`);
      return;
    }
    if (parsed.data.execute !== undefined) {
      const result = await executeGitV3DecomposeCommand({
        ...repository,
        spawningIdentity: await resolveUserIdentity(io.exec),
      }, {
        protection,
        baseBranch: settings["branch.base"],
        origin: parsed.data.origin,
        cutMapPath: parsed.data.execute,
      });
      if (result.status !== "staged") {
        emitV3DecomposeRefusal(result, "execute");
        return;
      }
      process.stdout.write(`${canonicalize(result)}\n`);
      return;
    }
    if (parsed.data.extract !== undefined) {
      const result = await executeGitV3ExtractionCommand({
        ...repository,
        spawningIdentity: await resolveUserIdentity(io.exec),
      }, {
        protection,
        baseBranch: settings["branch.base"],
        origin: parsed.data.origin,
        cutMapPath: parsed.data.extract,
      });
      if (result.status !== "staged") {
        emitV3DecomposeRefusal(result, "extract");
        return;
      }
      process.stdout.write(`${canonicalize(result)}\n`);
      return;
    }
    if (parsed.data.advanceBase !== undefined) {
      let completedMap: unknown;
      try {
        completedMap = JSON.parse(await readFile(resolve(cwd, parsed.data.advanceBase), "utf8"));
      } catch {
        completedMap = null;
      }
      const decoded = decodeV3DecomposeCutMap(completedMap);
      const result = decoded.status === "accepted"
        && decoded.value.machine.source.origin === parsed.data.origin
        ? await advanceGitDecomposeTransitionBase(repository, {
            protection,
            baseBranch: settings["branch.base"],
            completedMap: decoded.value,
          })
        : { status: "refused" as const, reason: "map:invalid" };
      if (result.status === "refused") {
        emitV3DecomposeRefusal({
          ...result,
          remedy: v3DecomposeRemedy({
            invocation,
            reason: result.reason,
            ...(result.locus === undefined ? {} : { locus: result.locus }),
          }),
        }, "advance-base");
        return;
      }
      process.stdout.write(`${canonicalize(result)}\n`);
      return;
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const locus = detail.trim() === "" ? undefined : detail;
    emitV3DecomposeRefusal({
      status: "refused",
      reason: "unexpected-error",
      ...(locus === undefined ? {} : { locus }),
      remedy: v3DecomposeRemedy({
        invocation,
        reason: "unexpected-error",
        ...(locus === undefined ? {} : { locus }),
      }),
    }, emissionMode);
  }
}

/** Command-owned decomposition input. */
export const decomposeCommandInputRegistration = {
    commandPath: "decompose",
    schema: DecomposeCommandInputSchema,
    schemaFields: {
      "operand.origin": "origin",
      "option.preflight": "preflight",
      "option.execute": "execute",
      "option.extract": "extract",
      "option.finish": "finish",
      "option.apply": "apply",
      "option.advance-base": "advanceBase",
    },
  } as const satisfies CommandInputRegistration;
