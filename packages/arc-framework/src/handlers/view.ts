/**
 * I/O boundary for the read-only `arc view` command.
 *
 * @module
 */

import { execFile, spawn } from "node:child_process";
import { access, readdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";

import {
  resolveTaskListPath,
  runActiveSessionInitStatus,
  type ActiveSessionInitResult,
  type MetaFileCandidate,
} from "../commands/active.js";
import { runView } from "../commands/view.js";
import { parseMetaFile } from "../lib/active/meta-reader.js";
import { gitConfigGet, resolveIdentity } from "../lib/git/index.js";
import { resolveWorkUnitSessionNotesPath } from "../lib/handoff/session-notes-path.js";
import { createUserIOContext, gitExec } from "../lib/io-context.js";
import { resolveActiveCohortDocPath } from "../lib/session-init/cohort-doc.js";
import { resolveUserSurfaceResolver } from "../lib/user-surfaces.js";
import { resolveViewArtifact, type ViewArtifactDependencies } from "../lib/view-artifact.js";
import {
  renderViewWithPager,
  resolveViewRenderer,
  type PagerProcessInput,
  type PathCommandProbe,
} from "../lib/view-renderer.js";
import type { ViewTargetResult } from "../lib/view/types.js";
import { VIEW_KINDS } from "../lib/view/types.js";
import { SlugSchema } from "../lib/kernel/index.js";
import {
  resolveProcessInteractionContext,
  type InteractionContext,
} from "../lib/command-input/interaction-context.js";
import type { CommandInputRegistration } from "../lib/command-input/registry.js";
import { declareInteractionSite, type CommandInputDeclaration } from "../lib/command-input/declaration.js";
import { resolveViewClock } from "../lib/view/clock.js";
import { buildLifecycleIndex, type LifecycleIndex } from "../lib/work-unit/lifecycle-index.js";
import { requireArcProjectRoot } from "./shared.js";

const execFileAsync = promisify(execFile);

export interface ViewCliOptions {
  project?: boolean;
  current?: boolean;
  for?: string;
}

/** Complete command-owned view input. */
export const ViewCommandInputSchema = z.object({
  kind: z.enum(VIEW_KINDS, {
    error: (issue) => `Unknown view kind ${JSON.stringify(issue.input)}. Valid kinds: ${VIEW_KINDS.join(", ")}`,
  }).optional(),
  project: z.boolean(),
  current: z.boolean(),
  forSlug: z.string().refine(
    (value) => SlugSchema.safeParse(value).success,
    { message: "Invalid work-unit slug" },
  ).optional(),
}).strict().superRefine((value, refinement) => {
  if (value.current && value.kind !== undefined && value.kind !== "tasks") {
    refinement.addIssue({ code: "custom", path: ["current"], message: "--current is only valid with tasks" });
  }
  if (value.project && value.kind !== "inbox") {
    refinement.addIssue({ code: "custom", path: ["project"], message: "--project is only valid with inbox" });
  }
  if (value.forSlug !== undefined && (value.kind === "working-memory" || value.kind === "inbox")) {
    refinement.addIssue({
      code: "custom",
      path: ["forSlug"],
      message: `--for is not valid with identity-global ${value.kind}`,
    });
  }
});

/** Registry contribution owned by the view command. */
export const viewCommandInputRegistration = {
  commandPath: "view",
  schema: ViewCommandInputSchema,
  schemaFields: {
    "operand.kind": "kind",
    "option.project": "project",
    "option.current": "current",
    "option.for": "forSlug",
  },
} satisfies CommandInputRegistration;

/** Presenter-process policies owned by the view adapter. */
export const viewCommandInputPolicyDeclarations = [{
  commandPath: "view",
  aliases: [],
  sites: (["execFileAsync", "spawn"] as const).map((callee) => declareInteractionSite(
    { file: "handlers/view.ts", kind: "subprocess", callee, occurrence: 1 },
    {
      acquisition: "presenter", schemaOwnership: "none", cancellation: "not-applicable",
      automation: { noInput: "render-directly", flags: [], acceptedSyntax: [] },
      mutationBoundary: "view subprocess boundary", subprocess: "presenter",
    },
  )),
}] satisfies readonly CommandInputDeclaration[];

/** Convert the command-owned active envelope into the neutral viewer target. */
export function adaptActiveViewTarget(
  result: ActiveSessionInitResult,
  currentBranch: string | null,
): ViewTargetResult {
  let candidate: MetaFileCandidate | null = null;
  let taskListPath: string | null = null;

  if (result.resolution === "single" && result.path !== null) {
    const slug = /^meta-(.+)\.md$/u.exec(result.path.split("/").at(-1) ?? "")?.[1];
    if (slug === undefined) return { status: "unavailable" };
    return {
      status: "resolved",
      slug,
      location: "active",
      metaPath: result.path,
      taskListPath: result.taskListPath ?? null,
    };
  }
  if (result.resolution === "multiple") {
    const matches = result.candidates.filter(
      (entry) => entry.branch !== null && entry.branch === currentBranch,
    );
    if (matches.length !== 1) return { status: "unavailable" };
    candidate = matches[0] ?? null;
    if (candidate !== null) taskListPath = resolveTaskListPath(candidate.path, candidate.taskList);
  }

  if (candidate === null) return { status: "unavailable" };
  const slug = /^meta-(.+)\.md$/u.exec(candidate.filename)?.[1];
  return slug === undefined
    ? { status: "unavailable" }
    : {
      status: "resolved",
      slug,
      location: "active",
      metaPath: candidate.path,
      taskListPath,
    };
}

/** Resolve CLI context, run the viewer, and preserve stdout/stderr separation. */
export async function handleView(
  kind: string | undefined,
  options: ViewCliOptions,
  suppliedContext?: InteractionContext,
): Promise<void> {
  const parsed = ViewCommandInputSchema.safeParse({
    ...(kind === undefined ? {} : { kind }),
    project: options.project === true,
    current: options.current === true,
    ...(options.for === undefined ? {} : { forSlug: options.for }),
  });
  if (!parsed.success) {
    process.stderr.write(`${parsed.error.issues.map((issue) => issue.message).join("\n")}\n`);
    process.exitCode = 1;
    return;
  }
  const context = suppliedContext ?? resolveProcessInteractionContext({
    noInput: false, machineReadable: false, yes: "absent",
  });
  const cwd = requireArcProjectRoot();
  if (cwd === null) return;
  const io = createUserIOContext(context.subprocess);
  const identity = await resolveIdentity({ exec: gitExec });
  const dependencies = createViewDependencies(cwd, io.readFile);
  const clock = await resolveViewClock({
    cwd,
    exec: (command, args, execOptions) => gitExec(command, args, { ...execOptions, cwd }),
    readFile: io.readFile,
  });
  const result = await runView({
    cwd,
    kind: parsed.data.kind,
    project: parsed.data.project,
    identity,
    current: parsed.data.current,
    ...(parsed.data.forSlug === undefined ? {} : { forSlug: parsed.data.forSlug }),
    nonInteractive: context.subprocess.presenters === "forbidden",
  }, {
    resolveArtifact: (input) => resolveViewArtifact(input, dependencies),
    readFile: io.readFile,
    resolveRenderer: () => resolveViewRenderer({
      cwd,
      exec: (command, args, execOptions) => gitExec(command, args, { ...execOptions, cwd }),
      readFile: io.readFile,
      probe: probePathCommand,
    }),
    renderWithPager: (input) => renderViewWithPager({
      ...input,
      terminalWidth: process.stdout.columns,
    }, { run: runPagerProcess, environment: process.env }),
    clock,
  });

  if (result.stdout !== "") process.stdout.write(result.stdout);
  if (result.stderr !== "") process.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
}

function createViewDependencies(
  cwd: string,
  readUtf8: (path: string) => Promise<string>,
): ViewArtifactDependencies {
  return {
    resolveAmbientTarget: async ({ identity }) => {
      const result = await runActiveSessionInitStatus({
        cwd,
        identity,
        role: await gitConfigGet(gitExec, "arc.role"),
        exec: gitExec,
      });
      return adaptActiveViewTarget(result, await resolveCurrentBranch(cwd));
    },
    resolveExplicitTarget: async ({ slug }) => {
      const index = await buildLifecycleIndex({
        cwd,
        fs: {
          readdir: (path) => readdir(path, { withFileTypes: true }),
          readFile: readUtf8,
        },
      });
      return resolveExplicitViewTarget({ cwd, slug, index, readFile: readUtf8 });
    },
    resolveCohort: ({ activeMetaPath }) => resolveActiveCohortDocPath({
      cwd,
      activeMetaPath,
      fs: { readFile: readUtf8, pathExists },
    }),
    resolveSessionNotes: ({ identity: resolvedIdentity, workUnitName }) =>
      resolveWorkUnitSessionNotesPath(cwd, resolvedIdentity, workUnitName, { access }),
    resolveUserSurfaces: ({ identity: resolvedIdentity }) =>
      resolveUserSurfaceResolver({ cwd, identity: resolvedIdentity, exec: gitExec }),
    pathExists,
  };
}

/** Classify one explicit slug from the checkout-local lifecycle projection. */
export async function resolveExplicitViewTarget(input: {
  cwd: string;
  slug: string;
  index: LifecycleIndex;
  readFile: (path: string) => Promise<string>;
}): Promise<ViewTargetResult> {
  const entry = input.index.get(input.slug);
  if (entry === undefined) return { status: "unavailable", slug: input.slug };
  if (entry.location === "completed") return { status: "completed", slug: input.slug };
  try {
    const meta = parseMetaFile(await input.readFile(join(input.cwd, entry.path)));
    return {
      status: "resolved",
      slug: entry.slug,
      location: entry.location,
      metaPath: entry.path,
      taskListPath: resolveTaskListPath(entry.path, meta.taskList),
    };
  } catch {
    return { status: "unavailable", slug: input.slug };
  }
}

async function resolveCurrentBranch(cwd: string): Promise<string | null> {
  try {
    const result = await gitExec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd });
    const branch = result.stdout.trim();
    return branch === "" || branch === "HEAD" ? null : branch;
  } catch {
    return null;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

const probePathCommand: PathCommandProbe = async (command) => {
  try {
    await execFileAsync(command, ["--version"]);
    return true;
  } catch {
    return false;
  }
};

function runPagerProcess(input: PagerProcessInput): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(input.command, [...input.args], {
      env: input.env,
      stdio: ["pipe", "inherit", "inherit"],
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${input.command} exited with status ${code ?? "unknown"}.`));
    });
    child.stdin.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code !== "EPIPE") reject(error);
    });
    child.stdin.end(input.input);
  });
}
