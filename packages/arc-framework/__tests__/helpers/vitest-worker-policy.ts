/** Resolve Vitest worker sizing from local and CI environment facts. */
export function resolveVitestMaxWorkers(env: NodeJS.ProcessEnv): number | string | undefined {
  const override = env["VITEST_MAX_WORKERS"];
  const configuredWorkers = override === undefined || override === ""
    ? (env["CI"] ? undefined : "50%")
    : override;
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
