/** Bounded official-provider CLI execution for delivery adapters. */

import { execa } from "execa";

export interface DeliveryProviderProcessRunner {
  run(
    args: readonly string[],
    options: { readonly cwd: string; readonly signal?: AbortSignal },
  ): Promise<{ readonly stdout: string; readonly stderr: string }>;
}

export class DeliveryProviderProcessError extends Error {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;

  constructor(message: string, input: { stdout: string; stderr: string; exitCode: number | null }) {
    super(message);
    this.name = "DeliveryProviderProcessError";
    this.stdout = input.stdout;
    this.stderr = input.stderr;
    this.exitCode = input.exitCode;
  }
}

/** Production `gh` runner for bounded provider-native stack preparation. */
export const deliveryProviderGhRunner: DeliveryProviderProcessRunner = {
  run: async (args, options) => {
    try {
      const result = await execa("gh", [...args], {
        cwd: options.cwd,
        stdin: "ignore",
        timeout: 300_000,
        ...(options.signal === undefined ? {} : { cancelSignal: options.signal }),
      });
      return { stdout: result.stdout, stderr: result.stderr };
    } catch (error) {
      const record = typeof error === "object" && error !== null ? error as Record<string, unknown> : {};
      throw new DeliveryProviderProcessError(error instanceof Error ? error.message : String(error), {
        stdout: typeof record.stdout === "string" ? record.stdout : "",
        stderr: typeof record.stderr === "string" ? record.stderr : "",
        exitCode: typeof record.exitCode === "number" ? record.exitCode : null,
      });
    }
  },
};
