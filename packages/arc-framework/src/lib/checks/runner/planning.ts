/** Build fixed portable invocations and runtime probes before placement. */
import type { CheckDeclaration } from "../declaration.js";
import type { FrozenSourcePresentation } from "./source-presentation.js";
import { InvocationSchema, ProbeSchema, type Invocation, type Probe } from "./contract-execution.js";
import { relative, resolve } from "node:path";
import { batchPortableCheckPaths, checkFileArguments, portableCheckArgumentBatches } from "../batching.js";
import { resolveSourceDirectory } from "./source-cwd.js";
import { sourcePathContains } from "./source-paths.js";

/** Native selection and captured source used to form one check's execution plan. */
export interface PlanCheckExecutionInput {
  callerRoot: string;
  source: Pick<FrozenSourcePresentation, "root" | "manifest">;
  check: CheckDeclaration["checks"][string];
  paths: readonly string[];
  globalRuntimeInputs?: readonly (readonly string[])[];
}
/** Owned immutable commands whose order and partitions cannot change during preparation. */
export interface CheckExecutionPlan {
  readonly invocations: readonly Invocation[];
  readonly probes: Readonly<{ global: readonly Probe[]; check: readonly Probe[] }>;
}

/** Plan commands against captured source while retaining native selection and content policy. */
export async function planCheckExecution(input: PlanCheckExecutionInput): Promise<CheckExecutionPlan> {
  const check = { ...input.check };
  const callerRoot = input.callerRoot;
  const sourceRoot = input.source.root;
  const command = typeof check.command === "string" ? [check.command] : [...check.command];
  const paths = [...input.paths];
  const globalProbes = (input.globalRuntimeInputs ?? []).map(argv => [...argv]);
  const checkProbes = check.runtime_inputs.map(argv => [...argv]);
  const { tree, base, merged } = input.source.manifest.coordinates;
  const commandContent = check.mode === "files" ? { tree, ...(base === undefined ? {} : { base }),
    ...(merged.length === 0 ? {} : { merged: [...merged] }) } : undefined;
  const declaredCwd = resolve(callerRoot, check.root);
  if (!sourcePathContains(callerRoot, declaredCwd)) {
    throw new Error("Cannot plan check.root outside source paths. Repair the root and retry; keep the check local or declare an explicit input boundary for external files.");
  }
  const directory = await resolveSourceDirectory(sourceRoot, relative(callerRoot, declaredCwd));
  const cwd = directory.cwd;
  const received = checkFileArguments(directory.root, directory.directory, paths, process.platform);
  const invocations = portableCheckArgumentBatches(check, command, received).map((batch, index) => fixedInvocation({
    id: `invocation:${index}`, argv: [...command, ...batch], cwd, shell: check.shell,
    ...(commandContent === undefined ? {} : { commandContent }),
  }));
  return Object.freeze({ invocations: Object.freeze(invocations), probes: Object.freeze({
    global: Object.freeze(planProbes(globalProbes, "global-probe", ".")),
    check: Object.freeze(planProbes(checkProbes, "check-probe", cwd)),
  }) });
}

function planProbes(commands: readonly string[][], group: string, cwd: string): Probe[] {
  return commands.map((argv, index) => {
    batchPortableCheckPaths(argv, []);
    const parsed = ProbeSchema.safeParse({ id: `${group}:${index}`, argv, cwd });
    if (!parsed.success) throw invalidPlanArgv(parsed.error);
    const probe = parsed.data;
    Object.freeze(probe.argv);
    return Object.freeze(probe);
  });
}

function fixedInvocation(value: unknown): Invocation {
  const parsed = InvocationSchema.safeParse(value);
  if (!parsed.success) throw invalidPlanArgv(parsed.error);
  const invocation = parsed.data;
  Object.freeze(invocation.argv);
  if (invocation.commandContent !== undefined) {
    if (invocation.commandContent.merged !== undefined) Object.freeze(invocation.commandContent.merged);
    Object.freeze(invocation.commandContent);
  }
  return Object.freeze(invocation);
}

function invalidPlanArgv(cause: unknown): Error {
  return new Error("Invalid literal argv in a declared command or runtime probe. Repair the command or runtime probe declaration and retry; keep the check local if it cannot use the portable contract.", { cause });
}
