/** Own native object readers for one public ref-store operation. */
import { GitBatchReadScope } from "../../git/batch-reader.js";
import type { RefBackendContext } from "./context.js";

interface RememberedAnswer { began: number; result: Promise<unknown> }

/** Readers and configuration evidence never escape their owning operation. */
export class RefOperationScope {
  readonly batchReader = new GitBatchReadScope();
  private generation = 0;
  private sequence = 0;
  private readonly heldLocks = new Set<number>();
  private readonly answers = new Map<object, Map<string, RememberedAnswer>>();

  /** Share successful parsed answers by lookup identity and physical arguments. */
  remember<T>(lookup: object, key: string, read: () => Promise<T>): Promise<T> {
    let entries = this.answers.get(lookup);
    if (!entries) { entries = new Map(); this.answers.set(lookup, entries); }
    const cached = entries.get(key);
    if (cached && cached.began >= Math.max(0, ...this.heldLocks)) return cached.result as Promise<T>;
    const generation = this.generation, began = ++this.sequence;
    const pending = read().then((value) => generation === this.generation ? value : this.remember(lookup, key, read));
    const entry = { began, result: pending };
    entries.set(key, entry);
    void pending.catch(() => { if (entries.get(key) === entry) entries.delete(key); });
    return pending;
  }

  /** Wrap ports before repository and deadline binding, preserving every supplied option. */
  bind(context: RefBackendContext): RefBackendContext {
    return { ...context, operationScope: this, batchReader: this.batchReader,
      exec: (...args) => this.invoke(args[1], () => context.exec(...args)),
      execInput: (...args) => this.invoke(args[0], () => context.execInput(...args)),
      rawExec: (...args) => this.invoke(args[0], () => context.rawExec(...args)),
      lock: (...args) => this.acquire(context, args),
    };
  }

  private async acquire(context: RefBackendContext, args: Parameters<RefBackendContext["lock"]>): Promise<() => Promise<void>> {
    const release = await context.lock(...args), stamp = ++this.sequence;
    this.heldLocks.add(stamp);
    return async () => { try { await release(); } finally { this.heldLocks.delete(stamp); } };
  }

  private async invoke<T>(args: string[], operation: () => Promise<T>): Promise<T> {
    const index = subcommandIndex(args), command = args[index];
    if (command && ["fetch", "maintenance", "gc"].includes(command)) await this.batchReader.reset();
    try { return await operation(); }
    finally { if (changesConfiguration(args, index)) this.forget(); }
  }

  private forget(): void { this.generation++; this.answers.clear(); }

  /** Release the abandoned attempt's readers before resolving a new one. */
  async refresh(): Promise<void> { this.forget(); await this.batchReader.reset(); }
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

/** Remember a parsed lookup only inside its current operation, never a rejected lookup. */
export function rememberRefLookup<T>(context: RefBackendContext, lookup: object, args: readonly unknown[],
  read: () => Promise<T>, repository = context.repository?.gitDir ?? context.checkoutRoot): Promise<T> {
  return context.operationScope?.remember(lookup, JSON.stringify([repository, args]), read) ?? read();
}

function changesConfiguration(args: readonly string[], index: number): boolean {
  const command = args[index], rest = args.slice(index + 1);
  if (command === "init") return true;
  if (command === "config") return !rest.some((arg) => ["--get", "--get-all", "--get-regexp", "--list"].includes(arg));
  if (command !== "remote") return false;
  const action = rest.find((arg) => !arg.startsWith("-"));
  return action !== undefined && action !== "get-url" && action !== "show";
}
