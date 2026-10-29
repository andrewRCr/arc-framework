/** Pure generic parsers and entry grammars shared by conformance backends. */
import { ConflictRecordSchema, KIND_REGISTRY, KIND_SHAPES, createKindRegistry, type KindDefinition, type KindId, type RecordParser } from "../../../src/lib/store/index.js";
import type { FixtureDeclarations } from "./fixture-contract.js";

const jsonParser: RecordParser = (content) => {
  try {
    const data: unknown = JSON.parse(content);
    return typeof data === "object" && data !== null && !Array.isArray(data)
      ? { success: true, data } : { success: false, error: "Expected a test machine-record object." };
  } catch { return { success: false, error: "Expected the valid test machine-record JSON format." }; }
};
const conflictParser: RecordParser = (content) => {
  try { const parsed = ConflictRecordSchema.safeParse(JSON.parse(content)); return parsed.success ? { success: true, data: parsed.data } : { success: false, error: "Expected a typed conflict record." }; }
  catch { return { success: false, error: "Expected valid conflict-record JSON." }; }
};

/** Build isolated test definitions without importing production field schemas. */
export function createConformanceTestRegistry(entryShapes: FixtureDeclarations["entryShapes"],
  registryOverrides: Partial<Record<KindId, Partial<KindDefinition>>> = {}) {
  const parsers = Object.fromEntries((Object.keys(KIND_SHAPES) as KindId[])
    .filter((kind) => KIND_REGISTRY[kind].merge === "single-writer").map((kind) => [kind, kind.endsWith("/conflict-record") ? conflictParser : jsonParser]));
  const definitions = createKindRegistry(Object.entries(parsers).map(([kind, parser]) => ({ kind: kind as KindId, parser })));
  return Object.fromEntries((Object.keys(definitions) as KindId[]).map((kind) => [kind, {
    ...definitions[kind], ...(entryShapes[kind] ? { entry: entryShapes[kind] } : {}), ...registryOverrides[kind],
  }])) as typeof definitions;
}
