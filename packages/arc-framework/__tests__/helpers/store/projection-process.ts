/** Bounded command acknowledgments and named hook arrivals from real projection writers. */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { onTestFinished } from "vitest";
import { ProjectionProcessJobSchema, ProjectionProcessMessageSchema, type ProjectionProcessJob,
  type ProjectionProcessCommand, type ProjectionProcessMessage } from "../../fixtures/store/projection-process-protocol.js";

type HookArrival = Extract<ProjectionProcessMessage, { kind: "hook" }>;
type Command = ProjectionProcessCommand extends infer T ? T extends ProjectionProcessCommand ? Omit<T, "id"> : never : never;

export function startProjectionWriter(input: ProjectionProcessJob, timeoutMs: number) {
  const job = ProjectionProcessJobSchema.parse(input), env = { ...process.env };
  delete env.FORCE_COLOR;
  const child = spawn(process.execPath, ["--import", "tsx",
    fileURLToPath(new URL("../../fixtures/store/projection-process-writer.ts", import.meta.url)), JSON.stringify(job)],
  { stdio: ["pipe", "pipe", "pipe"], env });
  let errors = "", nextId = 0, lastSequence = 0, announced = false, closing = false, dead: Error | undefined;
  const pending = new Map<number, { resolve: (report: string) => void; reject: (error: Error) => void }>();
  const arrivals: HookArrival[] = [], waiting: { resolve: (arrival: HookArrival) => void; reject: (error: Error) => void }[] = [];
  let announce: (pid: number) => void = () => {}, rejectReady: (error: Error) => void = () => {};
  const ready = new Promise<number>((resolve, reject) => { announce = resolve; rejectReady = reject; });
  void ready.catch(() => {});
  function fail(error: Error): void {
    dead = error; rejectReady(error);
    for (const each of pending.values()) each.reject(error);
    pending.clear();
    for (const each of waiting.splice(0)) each.reject(error);
  }
  const timer = setTimeout(() => { fail(new Error(`Projection writer exceeded ${timeoutMs}ms: ${errors}`)); child.kill(); }, timeoutMs);
  child.stderr.on("data", (data: Buffer) => { errors += data.toString(); });
  child.on("error", fail);
  child.stdin.on("error", fail);
  const exit = new Promise<void>((resolve, reject) => child.on("close", code => {
    clearTimeout(timer);
    const error = new Error(`Projection writer exited ${code}: ${errors}`);
    if (!closing || code !== 0 || pending.size > 0 || waiting.length > 0) { fail(error); reject(error); }
    else resolve();
  }));
  void exit.catch(() => {});
  const lines = createInterface({ input: child.stdout });
  lines.on("line", line => {
    try {
      const message = ProjectionProcessMessageSchema.parse(JSON.parse(line));
      if (message.kind === "ready") {
        if (announced) throw new Error("The writer announced readiness twice");
        announced = true; announce(message.pid); return;
      }
      if (message.kind === "hook") {
        if (message.sequence !== lastSequence + 1) throw new Error("The writer repeated or skipped a hook sequence");
        lastSequence = message.sequence;
        const next = waiting.shift();
        if (next) next.resolve(message); else arrivals.push(message);
        return;
      }
      const request = pending.get(message.id);
      if (!request) throw new Error(`Unexpected writer acknowledgment ${message.id}`);
      pending.delete(message.id);
      if (message.kind === "error") request.reject(new Error(message.error)); else request.resolve(message.report ?? "");
    } catch (error) { fail(error instanceof Error ? error : new Error(String(error))); child.kill(); }
  });
  const send = (command: Command): Promise<string> => {
    if (dead) return Promise.reject(dead);
    const id = ++nextId;
    const result = new Promise<string>((resolve, reject) => { pending.set(id, { resolve, reject }); });
    void result.catch(() => {});
    child.stdin.write(JSON.stringify({ ...command, id }) + "\n");
    return result;
  };
  onTestFinished(async () => {
    if (child.exitCode === null) child.kill();
    await exit.catch(() => {});
  });
  return { ready, send,
    hook: async (operation: Promise<string>): Promise<HookArrival> => {
      const arrival = arrivals.shift();
      if (arrival) return arrival;
      if (dead) throw dead;
      return Promise.race([
        new Promise<HookArrival>((resolve, reject) => { waiting.push({ resolve, reject }); }),
        operation.then(() => { throw new Error("The engine completed without reaching its required hook"); }),
      ]);
    },
    close: async () => { await send({ action: "close" }); closing = true; child.stdin.end(); await exit; },
  };
}
