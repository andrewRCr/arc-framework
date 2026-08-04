/** Handler boundary for the read-only `arc locus` command. */

import { access, lstat, readFile, realpath } from "node:fs/promises";

import { z } from "zod";

import type { LocusEnvelopeV1 } from "../lib/locus/schema/index.js";
import { formatLocusEnvelope, validateLocusEnvelope } from "../commands/locus.js";
import { createLocusEvidenceIO } from "../lib/locus/evidence.js";
import { readLocusEnvelope } from "../lib/locus/reader.js";
import { createPlatformProcessInspector } from "../lib/locus/platform-inspectors.js";
import { resolveIdentity } from "../lib/git/index.js";
import { gitExec } from "../lib/io-context.js";
import { createUserIOContext } from "../lib/io-context.js";
import { readConfigSettings } from "../lib/config/status-reader.js";
import { SlugSchema } from "../lib/kernel/index.js";
import type { CommandInputRegistration } from "../lib/command-input/registry.js";
import { resolveUserSurfaceResolver } from "../lib/user-surfaces.js";
import { requireArcProjectRoot, resolveIdentityWithPrompt } from "./shared.js";
import {
  attachLocusAtRuntime,
  releaseLocusAtRuntime,
  resolveLocusAtRuntime,
} from "../lib/locus/command-runtime.js";
import { formatErrandOpenResult } from "./errand.js";
import { createLocusMutationResult } from "../lib/locus/mutation.js";
import { locusErrorCode, type LocusMutationResultV1 } from "../lib/locus/schema/index.js";
import { abandonOrdinaryErrandAtRuntime } from "../lib/errand/abandon-runtime.js";
import { unmarkCurrentInboxEntry } from "../commands/user/inbox-mutation.js";
import type { LocusResolveAction } from "../lib/locus/resolve-driver.js";

export interface LocusCliOptions {
  json?: boolean;
}

/** Registry contributions owned by the value-bearing session-locus commands. */
export const locusCommandInputRegistrations = [
  {
    commandPath: "locus attach",
    schema: z.object({ checkout: z.string().min(1).optional(), json: z.boolean().optional() }).strict(),
    schemaFields: { "option.checkout": "checkout", "option.json": "json" },
  },
  ...["locus release", "locus resolve"].map((commandPath) => ({
    commandPath,
    schema: z.object({ recordId: z.string().min(1), json: z.boolean().optional() }).strict(),
    schemaFields: { "operand.record-id": "recordId", "option.json": "json" },
  })),
] as const satisfies readonly CommandInputRegistration[];

export interface LocusAttachOptions extends LocusCliOptions { checkout?: string }
export interface LocusReleaseOptions extends LocusCliOptions { lease: string }
export interface LocusResolveOptions extends LocusCliOptions {
  action: string;
  confirmNoLiveSession?: boolean;
}

/** Attach the entering process to one reader-trusted managed checkout. */
export async function handleLocusAttach(options: LocusAttachOptions): Promise<void> {
  await handleLocusMutation("attach", options);
}

/** Release only one caller-named exact lease generation. */
export async function handleLocusRelease(recordId: string, options: LocusReleaseOptions): Promise<void> {
  await handleLocusMutation("release", { ...options, recordId });
}

/** Resume or abandon one exact transient residue generation. */
export async function handleLocusResolve(recordId: string, options: LocusResolveOptions): Promise<void> {
  if (options.action !== "resume" && options.action !== "abandon") {
    emitMutation(createLocusMutationResult({
      outcome: "error", operation: "locus-resolve",
      error: {
        code: locusErrorCode("locus-resolve", "input"),
        message: "--action must be 'resume' or 'abandon'.",
      },
      recommendedPromptText: "Choose one supported residue action.",
    }), options.json === true);
    return;
  }
  const action: LocusResolveAction = options.action;
  await runLocusMutationBoundary(
    "locus-resolve",
    options.json === true,
    "Inspect the retained transient generation before retrying.",
    async () => {
      const cwd = requireArcProjectRoot();
      if (cwd === null) {
        return createHandlerError(
          "locus-resolve", "topology", "ARC project root is unavailable.",
          "Enter an ARC project before retrying.",
        );
      }
      const identity = await resolveIdentityWithPrompt(false);
      if (identity === null) {
        return createHandlerError(
          "locus-resolve", "identity", "No identity resolved.",
          "Set arc.identity before retrying.",
        );
      }
      const io = createUserIOContext();
      if (!io.execInput) {
        return createHandlerError(
          "locus-resolve", "identity", "The stdin Git boundary is unavailable.",
          "Resolve the identity boundary before retrying.",
        );
      }
      const execInput = io.execInput;
      const { settings } = await readConfigSettings(cwd);
      const identityGlobalUserDir = (await resolveUserSurfaceResolver({
        cwd, identity: SlugSchema.parse(identity), exec: io.exec,
      })).identityGlobalRoot;
      const common = {
        recordId, action, base: settings["branch.base"], identity, cwd,
        confirmedNoLiveSession: options.confirmNoLiveSession === true,
        postCreateScript: settings["worktree.post_create"],
        registeredHarnessDirs: settings["worktree.harness_dirs"],
        io: { ...io, execInput },
      };
      return resolveLocusAtRuntime({
        ...common,
        abandon: async ({ subject, key, selected, confirmedNoLiveSession }) => {
          if (subject !== "errand") {
            return createLocusMutationResult({
              outcome: "refused",
              operation: "locus-resolve",
              reason: "role-conflict",
              recommendedPromptText: `The ${subject} abandon driver is unavailable in this command surface.`,
            });
          }
          return abandonOrdinaryErrandAtRuntime({
            slug: key, protection: "full", base: common.base, identity, identityGlobalUserDir,
            postCreateScript: common.postCreateScript,
            registeredHarnessDirs: common.registeredHarnessDirs, exec: io.exec, execInput, selected,
            confirmedNoLiveSession,
            clearExecuteBound: async (record) => {
              if (record.originEntry === null) return { kind: "idempotent" };
              const cleared = await unmarkCurrentInboxEntry({
                cwd, io, identity, title: record.originEntry,
              });
              return { kind: cleared.changed ? "applied" : "idempotent" };
            },
          });
        },
      });
    },
  );
}

async function handleLocusMutation(
  action: "attach" | "release",
  options: LocusAttachOptions | (LocusReleaseOptions & { recordId?: string }),
): Promise<void> {
  const operation = action === "attach" ? "locus-attach" : "locus-release";
  await runLocusMutationBoundary(
    operation,
    options.json === true,
    "Inspect the exact session locus record before retrying.",
    async () => {
      const cwd = requireArcProjectRoot();
      if (cwd === null) {
        return createHandlerError(
          operation, "topology", "ARC project root is unavailable.",
          "Enter an ARC project before retrying.",
        );
      }
      const identity = await resolveIdentityWithPrompt(false);
      if (identity === null) {
        return createHandlerError(
          operation, "identity", "No identity resolved.",
          "Set arc.identity before retrying.",
        );
      }
      const io = createUserIOContext();
      if (!io.execInput) {
        return createHandlerError(
          operation, "identity", "The stdin Git boundary is unavailable.",
          "Resolve the identity boundary before retrying.",
        );
      }
      const { settings } = await readConfigSettings(cwd);
      const runtimeOptions = {
        checkout: "checkout" in options ? options.checkout : undefined,
        recordId: "recordId" in options ? options.recordId : undefined,
        base: settings["branch.base"], identity, cwd,
        postCreateScript: settings["worktree.post_create"],
        registeredHarnessDirs: settings["worktree.harness_dirs"],
        io: { ...io, execInput: io.execInput },
      };
      return action === "attach"
        ? attachLocusAtRuntime(runtimeOptions)
        : releaseLocusAtRuntime({ ...runtimeOptions, leaseId: (options as LocusReleaseOptions).lease });
    },
  );
}

function createHandlerError(
  operation: Parameters<typeof locusErrorCode>[0],
  stage: Parameters<typeof locusErrorCode>[1],
  message: string,
  recommendedPromptText: string,
): LocusMutationResultV1 {
  return createLocusMutationResult({
    outcome: "error",
    operation,
    error: { code: locusErrorCode(operation, stage), message },
    recommendedPromptText,
  });
}

async function runLocusMutationBoundary(
  operation: Parameters<typeof locusErrorCode>[0],
  json: boolean,
  failurePrompt: string,
  run: () => Promise<LocusMutationResultV1>,
): Promise<void> {
  let result: LocusMutationResultV1;
  try {
    result = await run();
  } catch (error) {
    result = createHandlerError(
      operation,
      "failed",
      error instanceof Error ? error.message : String(error),
      failurePrompt,
    );
  }
  emitMutation(result, json);
}

function emitMutation(result: LocusMutationResultV1, json: boolean): void {
  const formatted = formatErrandOpenResult(result, json);
  const text = json ? formatted.text : `${formatted.text.replace(/\n+$/u, "")}\n`;
  (formatted.stream === "stdout" ? process.stdout : process.stderr).write(text);
  process.exitCode = formatted.exitCode;
}

export interface LocusCliOutput {
  stdout(text: string): void;
  stderr(text: string): void;
  exit(code: number): void;
}

export interface LocusCliDependencies {
  read(): Promise<LocusEnvelopeV1>;
  output: LocusCliOutput;
}

/** Emit exactly one validated roster envelope or one human display. */
export async function runLocusCli(
  options: LocusCliOptions,
  dependencies: LocusCliDependencies,
): Promise<void> {
  const envelope = validateLocusEnvelope(await dependencies.read());
  if (options.json) {
    dependencies.output.stdout(`${JSON.stringify(envelope)}\n`);
  } else if (envelope.ok) {
    dependencies.output.stdout(formatLocusEnvelope(envelope));
  } else {
    dependencies.output.stderr(`Error [${envelope.error.code}]: ${envelope.error.message}\n`);
  }
  dependencies.output.exit(envelope.ok ? 0 : 1);
}

/** Bind the public reader to local filesystem, Git, and process-inspector ports. */
export async function handleLocus(options: LocusCliOptions): Promise<void> {
  const cwd = requireArcProjectRoot();
  if (cwd === null) return;
  const identity = await resolveIdentity({ exec: gitExec });
  const inspector = createPlatformProcessInspector();
  const identityGlobalUserDir = identity === null
    ? null
    : (await resolveUserSurfaceResolver({ cwd, identity: SlugSchema.parse(identity), exec: gitExec }))
      .identityGlobalRoot;
  await runLocusCli(options, {
    read: () => readLocusEnvelope({
      identity,
      pathFlavor: process.platform === "win32" ? "windows" : "posix",
      evidenceIO: createLocusEvidenceIO({ exec: gitExec, identity: identity ?? "", inspector }),
      subjectMetaIO: {
        readFile: (path) => readFile(path, "utf8"),
        pathExists: async (path) => access(path).then(() => true, () => false),
        realpath,
        lstat,
      },
      identityGlobalUserDir,
    }),
    output: {
      stdout: (text) => process.stdout.write(text),
      stderr: (text) => process.stderr.write(text),
      exit: (code) => { process.exitCode = code; },
    },
  });
}
