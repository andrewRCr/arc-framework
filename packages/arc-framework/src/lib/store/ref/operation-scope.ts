/** Own native object readers for one public ref-store operation. */
import { GitBatchReadScope } from "../../git/batch-reader.js";
import type { RefBackendContext } from "./context.js";

/** Readers and configuration evidence never escape their owning operation. */
export class RefOperationScope {
  readonly batchReader = new GitBatchReadScope();

  /** Wrap ports before repository and deadline binding, preserving every supplied option. */
  bind(context: RefBackendContext): RefBackendContext {
    return { ...context, operationScope: this, batchReader: this.batchReader,
      exec: (...args) => this.invoke(args[1], () => context.exec(...args)),
      execInput: (...args) => this.invoke(args[0], () => context.execInput(...args)),
      rawExec: (...args) => this.invoke(args[0], () => context.rawExec(...args)),
    };
  }

  private async invoke<T>(args: string[], operation: () => Promise<T>): Promise<T> {
    const command = args[subcommandIndex(args)];
    if (command && ["fetch", "maintenance", "gc"].includes(command)) await this.batchReader.reset();
    return operation();
  }

  /** Release the abandoned attempt's readers before resolving a new one. */
  async refresh(): Promise<void> { await this.batchReader.reset(); }
}

/** Reuse a supplied scope, or close an operation's own readers before returning. */
export async function withRefOperation<T>(context: RefBackendContext,
  operation: (context: RefBackendContext) => Promise<T>): Promise<T> {
  if (context.operationScope) return operation(context);
  const operationScope = new RefOperationScope();
  let result: T;
  try { result = await operation(operationScope.bind(context)); }
  catch (error) { await operationScope.batchReader.close().catch(() => undefined); throw error; }
  await operationScope.batchReader.close();
  return result;
}

function subcommandIndex(args: readonly string[]): number {
  let index = 0;
  while (args[index]?.startsWith("-")) index += args[index] === "-c" ? 2 : 1;
  return index;
}
