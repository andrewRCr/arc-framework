/** Real engine and independently commanded editor, coordinated at named projection steps. */
import { open, rename, writeFile, type FileHandle } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { createDefaultRefStorePorts } from "../../../src/lib/store/default-ports.js";
import { createRefStore } from "../../../src/lib/store/create.js";
import { startProjection, endProjection, type ProjectionCommandInput } from "../../../src/lib/store/projection/engine.js";
import { beginProjectionCommand } from "../../../src/lib/store/projection/process-state.js";
import { locateProjection } from "../../../src/lib/store/projection/location.js";
import { bindProjectionFanOut } from "../../../src/lib/store/projection/fan-out-binding.js";
import { runProjectionFanOut } from "../../../src/lib/store/projection/fan-out.js";
import type { ProjectionPersistHooks, ProjectionPersistResult } from "../../../src/lib/store/projection/removal-persist.js";
import { createProjectionEnginePorts } from "../../../src/lib/store/projection/engine-ports.js";
import { createProjectionReporter } from "../../../src/lib/store/projection/report.js";
import { createProjectionFanOutDependencies } from "../../../src/lib/store/projection/fan-out-binding.js";
import { withFanOut } from "../../../src/lib/store/projection/with-fan-out.js";
import { observePersistSave } from "./projection-persist-observation.js";
import { ProjectionProcessCommandSchema, ProjectionProcessJobSchema,
  type ProjectionHook, type ProjectionProcessCommand, type ProjectionProcessMessage,
  type ProjectionProcessReply } from "./projection-process-protocol.js";

const job = ProjectionProcessJobSchema.parse(JSON.parse(process.argv[2] ?? ""));
const native = createRefStore(createDefaultRefStorePorts({ checkoutRoot: job.root, backingRepository: async () => null }));
const store = withFanOut(native, createProjectionFanOutDependencies(job.root));
let editor: FileHandle | undefined, running = false, selected: ProjectionHook | null = null, sequence = 0;
let released: { sequence: number; resume: () => void } | undefined;
const seen = new Set<string>();
const emit = (message: ProjectionProcessMessage): void => { process.stdout.write(JSON.stringify(message) + "\n"); };

async function step(hook: ProjectionHook, root: string, path: string): Promise<void> {
  const key = `${hook}:${root}:${path}`;
  if (hook !== selected || seen.has(key)) return;
  seen.add(key);
  const current = ++sequence;
  const waiting = new Promise<void>(resolve => { released = { sequence: current, resume: resolve }; });
  emit({ kind: "hook", sequence: current, hook, root, path });
  await waiting;
  released = undefined;
}

async function run(command: Extract<ProjectionProcessCommand, { action: "run" }>): Promise<ProjectionProcessReply> {
  if (running) throw new Error("An engine operation is already running");
  running = true; selected = command.hook; seen.clear();
  const swapStep = (hook: ProjectionHook) => (path: string) => step(hook, job.root, path);
  const ports = { ...createProjectionEnginePorts(job.root), hooks: {
    afterRecheck: swapStep("afterRecheck"), afterMove: swapStep("afterMove"),
    afterFirstCheck: swapStep("afterFirstCheck"), beforeRebuildLink: swapStep("beforeRebuildLink"),
  }, beforeFanOutTarget: (root: string) => step("beforeTarget", root, job.path) };
  const input = { checkout: job.root, store, ports: () => ports };
  let report = "";
  const flush = createProjectionReporter(store, text => { report += text; });
  try {
    if (command.operation === "persist") {
      if (command.expectedSave === undefined) throw new Error("A persist needs its target's expected save");
      const receipt = await runPersistence(input, command.expectedSave, {
        beforeAsideCopy: (root, path) => step("beforeAsideCopy", root, path),
        beforeLastCheck: root => step("beforeLastCheck", root, job.path),
      });
      await endProjection(input);
      flush();
      return { report, ...receipt };
    }
    const start = await startProjection(input);
    if (start.kind !== "ready") throw new Error(`Projection start did not complete: ${JSON.stringify(start)}`);
    if (command.operation === "fan-out") {
      if (command.content === undefined) throw new Error("A fan-out needs its stored content");
      const current = await store.read({ reference: job.reference });
      if (current.status !== "ok") throw new Error(`Fan-out read failed: ${JSON.stringify(current)}`);
      const written = await store.write({ action: "put", reference: current.result.reference, expected: current.result.version,
        content: command.content, provenance: { verb: "save", lifecycleAction: "save" } });
      if (written.status !== "ok") throw new Error(`Fan-out write failed: ${JSON.stringify(written)}`);
    }
    await endProjection(input);
    flush();
    return { report };
  } finally { running = false; selected = null; }
}

async function runPersistence(input: ProjectionCommandInput, expectedSave: string, hooks: ProjectionPersistHooks):
Promise<{ persist: ProjectionPersistResult; observedSave: boolean }> {
  // Establish a fresh slot invocation without refreshing away the target's interrupted replacement.
  beginProjectionCommand();
  const observation = observePersistSave(store, job.reference, expectedSave);
  const ports = input.ports?.() ?? createProjectionEnginePorts(job.root);
  const location = await locateProjection(job.root, ports);
  await bindProjectionFanOut({ checkout: job.root, location, ports,
    run: ownWrites => runProjectionFanOut({ ...input, store: observation.store, location }, ownWrites) });
  const [{ createUserIOContext }, { buildExecutorContext }, { createStoreTeardownContext }] = await Promise.all([
    import("../../../src/lib/io-context.js"), import("../../../src/lib/work-unit/executor-context.js"),
    import("../../../src/lib/work-unit/store-teardown-context.js"),
  ]);
  const io = createUserIOContext();
  const executor = buildExecutorContext({ cwd: job.root, io, store: observation.store, identity: "andrew", teamMode: false,
    internalTemplateDir: join(job.root, ".arc/reference/templates") });
  const context = createStoreTeardownContext({ cwd: job.root, identity: "andrew", io }, executor, hooks);
  if (context.projectionRemovalSlots === undefined) throw new Error("The teardown context has no projection slots");
  const { projectionRemovalSlots } = context;
  const receipt = await observation.during(() => projectionRemovalSlots.persist(job.root));
  return { persist: receipt.result, observedSave: receipt.observedSave };
}

async function execute(command: ProjectionProcessCommand): Promise<void> {
  let reply: ProjectionProcessReply | undefined;
  if (command.action === "run") reply = await run(command);
  else if (command.action === "open") {
    if (editor !== undefined) throw new Error("The editor already owns a handle");
    editor = await open(join(job.editorRoot, job.path), "r+");
  } else if (command.action === "save") {
    const file = join(job.editorRoot, job.path);
    if (command.mode === "create") await writeFile(file, command.content);
    else if (command.mode === "rename") {
      const temporary = `${file}.${process.pid}.save`;
      await writeFile(temporary, command.content); await rename(temporary, file);
    } else {
      if (editor === undefined) throw new Error("No editor handle was opened");
      const bytes = Buffer.from(command.content);
      if (command.mode === "truncate") await editor.truncate(0);
      await editor.write(bytes, 0, bytes.length, 0);
      await editor.truncate(bytes.length);
    }
  } else if (command.action === "release") {
    if (released?.sequence !== command.sequence) throw new Error("The hook release does not match its arrival");
    released.resume();
  } else {
    if (running) throw new Error("Cannot close while an engine operation is running");
    await editor?.close(); editor = undefined;
  }
  emit({ kind: "done", id: command.id, ...reply });
}

const lines = createInterface({ input: process.stdin });
lines.on("line", line => {
  const command = ProjectionProcessCommandSchema.parse(JSON.parse(line));
  void execute(command).catch((error: unknown) => {
    emit({ kind: "error", id: command.id, error: error instanceof Error ? error.stack ?? error.message : String(error) });
  });
});
lines.on("close", () => { void editor?.close(); });
emit({ kind: "ready", pid: process.pid });
