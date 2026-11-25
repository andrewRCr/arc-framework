/** JSON transport and direct native-store composition for explicit approval-root repair. */
import { readFile } from "node:fs/promises";
import { createRefStore } from "../lib/store/create.js";
import { runReviewRootRepair, rootRepairRequestRefusal } from "../lib/store/review-root-repair.js";
import { ReviewRootRepairResultSchema, STORE_REPAIR_REVIEW_ROOTS_REQUEST_SCHEMA_ID,
  type ReviewRootRepairResult } from "../lib/store/review-root-repair-schema.js";
import { createProductionSchemaRegistry } from "../production-schema-registry.js";
import { lookupKernelSchema } from "../lib/kernel/schema/generate.js";
import { storeCommandDependencies, type StoreCommandDependencies } from "./store-output.js";
import { StoreReviewRootRepairCommandInputSchema } from "./store-input.js";

/** Schema discovery is available without a selected repository or work item. */
export interface StoreReviewRootRepairOptions { schema?: boolean }
/** Explicit transport and clock ports around the real native-store engine. */
export interface StoreReviewRootRepairDependencies extends StoreCommandDependencies {
  readText(source: string): Promise<string>;
  now(): string;
}

/** Preview or apply one JSON request through the authoritative ref backend, before or after cutover. */
export async function handleStoreReviewRootRepair(file: string | undefined, options: StoreReviewRootRepairOptions,
  overrides: Partial<StoreReviewRootRepairDependencies> = {}): Promise<ReviewRootRepairResult | null> {
  const write = overrides.write ?? ((text: string) => { process.stdout.write(text); });
  const setExitCode = overrides.setExitCode ?? ((code: number) => { process.exitCode = code; });
  const emit = (result: ReviewRootRepairResult): ReviewRootRepairResult => {
    const parsed = ReviewRootRepairResultSchema.parse(result);
    write(`${JSON.stringify(parsed)}\n`);
    setExitCode(parsed.status === "refused" || parsed.result.state === "policy-blocked" ? 1 : 0);
    return parsed;
  };
  const syntax = StoreReviewRootRepairCommandInputSchema.safeParse({ file, schema: options.schema === true ? true : undefined });
  if (!syntax.success) return emit({ status: "refused", refusal: rootRepairRequestRefusal(syntax.error.message) });
  if (syntax.data.schema === true) {
    const registered = lookupKernelSchema(createProductionSchemaRegistry(), STORE_REPAIR_REVIEW_ROOTS_REQUEST_SCHEMA_ID);
    if (registered.status !== "found") throw new Error("The registered approval-root repair request schema is unavailable.");
    write(`${JSON.stringify({ rootId: registered.schema.$id, schemas: { [STORE_REPAIR_REVIEW_ROOTS_REQUEST_SCHEMA_ID]: registered.schema } })}\n`);
    setExitCode(0);
    return null;
  }
  const source = syntax.data.file;
  if (source === undefined) throw new Error("Validated repair syntax lost its request source.");
  let request: unknown;
  try { request = JSON.parse(await (overrides.readText ?? readRequestText)(source)) as unknown; }
  catch (error) {
    return emit({ status: "refused", refusal: rootRepairRequestRefusal(
      `Cannot read the JSON repair request: ${error instanceof Error ? error.message : String(error)}`) });
  }
  const io = await storeCommandDependencies(overrides);
  return emit(await runReviewRootRepair({ store: createRefStore(io.ports), request,
    now: overrides.now ?? (() => new Date().toISOString()) }));
}

async function readRequestText(source: string): Promise<string> {
  if (source !== "-") return readFile(source, "utf8");
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin as AsyncIterable<Buffer | string>) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}
