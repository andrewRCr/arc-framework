/** Disposable full logs and advisory measured costs for repository checks. */
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { z } from "zod";

const MeasurementSchema = z.strictObject({
  schemaVersion: z.literal(1), id: z.string(), logPath: z.string(), costMs: z.number().nonnegative(),
});
/** Full-log location and wall-clock execution cost. */
export type CheckMeasurement = z.infer<typeof MeasurementSchema>;
/** Best-effort logging and latest-cost lookup, independent of pass reuse. */
export interface CheckReportStore {
  save(id: string, output: string, costMs: number): Promise<CheckMeasurement | undefined>;
  latest(id: string): Promise<CheckMeasurement | undefined>;
}

/** Filesystem boundaries for disposable execution reports. */
export interface CheckReportIO {
  directory(): Promise<string>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
}

/**
 * Bind full logs and timing metadata to a checkout's disposable record directory.
 * @param io - Directory and atomic complete-file boundaries
 * @returns Advisory storage whose failures never change a check outcome
 */
export function createCheckReportStore(io: CheckReportIO): CheckReportStore {
  return {
    save: async (id, output, costMs) => {
      try {
        const directory = await io.directory();
        const logPath = join(directory, `${encodeURIComponent(id)}.${randomUUID()}.log`);
        const measurement = MeasurementSchema.parse({ schemaVersion: 1, id, logPath, costMs });
        await io.writeFile(logPath, output);
        await io.writeFile(`${logPath}.json`, `${JSON.stringify(measurement)}\n`);
        await io.writeFile(join(directory, `${encodeURIComponent(id)}.latest.json`), `${JSON.stringify(measurement)}\n`);
        return measurement;
      } catch {
        return undefined;
      }
    },
    latest: async id => {
      try {
        const directory = await io.directory();
        const parsed = MeasurementSchema.safeParse(JSON.parse(await io.readFile(join(directory, `${encodeURIComponent(id)}.latest.json`))));
        return parsed.success && parsed.data.id === id ? parsed.data : undefined;
      } catch {
        return undefined;
      }
    },
  };
}
