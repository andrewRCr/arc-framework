/** Resolve Vitest worker sizing from local capacity and CI environment facts. */
import { availableParallelism } from "node:os";
/**
 * Select native CI sizing, an explicit override, or the bounded local default.
 * @param env - Local or CI environment
 * @param parallelism - Available concurrency, supplied by the host unless injected
 * @returns Worker bound, explicit percentage, or undefined for native CI sizing
 */
export function resolveVitestMaxWorkers(
  env: NodeJS.ProcessEnv, parallelism: number = availableParallelism(),
): number | string | undefined {
  const override = env["VITEST_MAX_WORKERS"];
  const ciValue = env["CI"]?.trim().toLowerCase();
  const isCi = ciValue === "true" || ciValue === "1";
  if (override === undefined || override === "") {
    return isCi ? undefined : Math.max(1, Math.min(8, Math.floor(parallelism / 2)));
  }
  const configuredWorkers = override;
  if (configuredWorkers !== undefined && !/^(?:[1-9]\d*|[1-9]\d?%|100%)$/u.test(configuredWorkers)) {
    throw new Error(
      `VITEST_MAX_WORKERS must be a positive integer or a percentage; received "${configuredWorkers}"`,
    );
  }
  if (configuredWorkers?.endsWith("%") === false) {
    const workerCount = Number(configuredWorkers);
    if (!Number.isSafeInteger(workerCount)) {
      throw new Error(
        `VITEST_MAX_WORKERS must be a positive safe integer or a percentage; received "${configuredWorkers}"`,
      );
    }
    return workerCount;
  }
  return configuredWorkers;
}
