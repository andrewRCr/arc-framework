/** Open archived test corrections through the projection command lifecycle. */
import { join } from "node:path";
import type { ProjectionCommandInput } from "../../../../src/lib/store/projection/engine.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import { projectionEditResult } from "../../../../src/lib/store/projection/edit.js";

export async function openArchivedProjectionFile(input: ProjectionCommandInput, path: string): Promise<void> {
  const started = await startProjection(input);
  if (started.kind !== "ready") throw new Error(`Archive opening could not start: ${JSON.stringify(started)}`);
  const result = await projectionEditResult(input.store, input.checkout, join(input.checkout, path));
  if (result.status !== "ok") throw new Error(`Archive opening refused: ${JSON.stringify(result.refusal)}`);
  await endProjection(input);
}
