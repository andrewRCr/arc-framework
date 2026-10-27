/** Ordered process-backed JSON-RPC transport for one check runner conversation. */
import { RunnerRequestSchema, type RecoveryParams, type TerminalOutcome, type RunnerMessage, type RunnerNotification, type RunnerRequest } from "./contract.js";
import { decodeRunnerReply, type RunnerResultByMethod } from "./correlation.js";
import { startCheckRunnerProcess, type CheckRunnerProcess, type CheckRunnerProcessExit, type CheckRunnerProcessInput } from "./session-process.js";
import { RunnerMessageFramer } from "./session-framing.js";
import { RunnerConversationState } from "./session-state.js";

/** One caller operation before the transport assigns its request identity. */
export type CheckRunnerOperation = { [Method in RunnerRequest["method"]]:
  Pick<Extract<RunnerRequest, { method: Method }>, "method" | "params"> }[RunnerRequest["method"]];

/** Transport launch and required notification delivery boundaries. */
export interface CheckRunnerSessionOptions extends CheckRunnerProcessInput {
  readonly launch?: (input: CheckRunnerProcessInput) => CheckRunnerProcess;
  readonly onNotification: (notification: RunnerNotification) => void | Promise<void>;
  readonly onDiagnostic?: (bytes: Uint8Array) => void | Promise<void>;
}

/** Correlated operations and observed transport completion, without a check verdict. */
export interface CheckRunnerSession {
  request<Operation extends CheckRunnerOperation>(operation: Operation): Promise<RunnerResultByMethod[Operation["method"]]>;
  readonly failure: Error | undefined;
  readonly closed: Promise<CheckRunnerProcessExit>;
  readonly recovery: Readonly<RecoveryParams> | undefined;
  readonly observedOutcomes: ReadonlyMap<string, Readonly<TerminalOutcome>>;
  closeInput(): void;
  terminate(): void;
}

/** Open one literal adapter process and correlate its ordered messages. */
export function createCheckRunnerSession(options: CheckRunnerSessionOptions): CheckRunnerSession {
  const process = (options.launch ?? startCheckRunnerProcess)(options);
  return new RunnerSessionTransport(process, options);
}

interface PendingRequest {
  readonly request: RunnerRequest;
  readonly resolve: (result: RunnerResultByMethod[RunnerRequest["method"]]) => void;
  readonly reject: (error: Error) => void;
}

class RunnerSessionTransport implements CheckRunnerSession {
  private readonly pending = new Map<string, PendingRequest>();
  private readonly framer = new RunnerMessageFramer();
  private readonly conversation = new RunnerConversationState();
  private sequence = 0;
  private processing = Promise.resolve();
  private protocolFailure: Error | undefined;
  private inputClosed = false;
  private processClosed = false;
  readonly closed: Promise<CheckRunnerProcessExit>;

  constructor(private readonly process: CheckRunnerProcess, private readonly options: CheckRunnerSessionOptions) {
    process.stdin.on("error", () => { this.fail(sessionError("could not deliver a request")); });
    process.stdout.on("error", () => { this.fail(sessionError("could not collect required protocol/output")); });
    process.stdout.on("data", (chunk: Uint8Array) => {
      process.stdout.pause();
      this.enqueue(async () => {
        try { await this.framer.accept(chunk, message => this.acceptMessage(message)); }
        finally { process.stdout.resume(); }
      });
    });
    process.stdout.on("end", () => { this.enqueue(() => { this.framer.finish(); }); });
    process.stdout.on("close", () => {
      this.enqueue(() => {
        if (!process.stdout.readableEnded) throw sessionError("required protocol/output stream closed before EOF");
      });
    });
    process.stderr.on("data", (chunk: Uint8Array) => { this.deliverDiagnostic(chunk); });
    process.stderr.on("error", () => { /* Adapter diagnostics are best effort. */ });
    this.closed = process.completed.then(async exit => {
      await this.processing;
      this.processClosed = true;
      for (const pending of this.pending.values()) pending.reject(sessionError("closed before replying"));
      this.pending.clear();
      return exit;
    });
  }

  get failure(): Error | undefined { return this.protocolFailure; }
  get recovery(): Readonly<RecoveryParams> | undefined { return this.conversation.recovery; }
  get observedOutcomes(): ReadonlyMap<string, Readonly<TerminalOutcome>> { return this.conversation.observedOutcomes; }

  async request<Operation extends CheckRunnerOperation>(operation: Operation): Promise<RunnerResultByMethod[Operation["method"]]> {
    if (this.protocolFailure !== undefined) throw this.protocolFailure;
    if (this.inputClosed || this.processClosed) throw sessionError("conversation is closed");
    const parsed = RunnerRequestSchema.safeParse({ ...operation, jsonrpc: "2.0", id: `rpc:${this.sequence++}` });
    if (!parsed.success) throw sessionError("caller operation is invalid");
    const request = parsed.data;
    this.conversation.begin(request);
    return new Promise<RunnerResultByMethod[Operation["method"]]>((resolve, reject) => {
      this.pending.set(request.id, { request, resolve: result => { resolve(result as RunnerResultByMethod[Operation["method"]]); }, reject });
      try {
        this.process.stdin.write(`${JSON.stringify(request)}\n`, error => {
          if (error !== null && error !== undefined) this.fail(sessionError("could not deliver a request"));
        });
      } catch { this.fail(sessionError("could not deliver a request")); }
    });
  }

  closeInput(): void {
    if (this.inputClosed) return;
    this.inputClosed = true;
    this.process.stdin.end();
  }

  terminate(): void { this.process.terminate(); }

  private enqueue(operation: () => void | Promise<void>): void {
    this.processing = this.processing.then(async () => {
      if (this.protocolFailure !== undefined) { this.process.stdout.resume(); return; }
      try { await operation(); }
      catch (error) { this.fail(error instanceof Error ? error : sessionError("message processing failed")); }
    });
  }

  private async acceptMessage(message: RunnerMessage): Promise<void> {
    if ("method" in message) {
      if ("id" in message) throw sessionError("adapter sent an unsupported request");
      this.conversation.notify(message);
      try { await this.options.onNotification(message); }
      catch { throw sessionError("required notification/output delivery failed"); }
      return;
    }
    const pending = this.pending.get(message.id);
    if (pending === undefined) throw sessionError("received an unknown or duplicate reply identity");
    const result = decodeRunnerReply(pending.request, message);
    this.conversation.reply(pending.request, result);
    this.pending.delete(message.id);
    pending.resolve(result);
  }

  private deliverDiagnostic(bytes: Uint8Array): void {
    try { void Promise.resolve(this.options.onDiagnostic?.(bytes)).catch(() => undefined); }
    catch { /* Parent diagnostic display is best effort. */ }
  }

  private fail(error: Error): void {
    this.protocolFailure ??= error;
    for (const pending of this.pending.values()) pending.reject(this.protocolFailure);
    this.pending.clear();
  }
}

function sessionError(detail: string): Error {
  return new Error(`Runner protocol ${detail}; repair the runner and retry the check request.`);
}
