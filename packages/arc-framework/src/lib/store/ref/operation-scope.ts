/** Own native object readers for one public ref-store operation. */
import { GitBatchReadScope } from "../../git/batch-reader.js";
import type { RefBackendContext } from "./context.js";

/** Readers and configuration evidence never escape their owning operation. */
export class RefOperationScope {
  readonly batchReader = new GitBatchReadScope();

  /** Release the abandoned attempt's readers before resolving a new one. */
  async refresh(): Promise<void> { await this.batchReader.reset(); }
}

/** Reuse a supplied scope, or close an operation's own readers before returning. */
export async function withRefOperation<T>(context: RefBackendContext,
  operation: (context: RefBackendContext) => Promise<T>): Promise<T> {
  if (context.operationScope) return operation(context);
  const operationScope = new RefOperationScope();
  let result: T;
  try { result = await operation({ ...context, operationScope, batchReader: operationScope.batchReader }); }
  catch (error) { await operationScope.batchReader.close().catch(() => undefined); throw error; }
  await operationScope.batchReader.close();
  return result;
}
