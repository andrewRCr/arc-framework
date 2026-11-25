/** Public controller closing shared by supported test execution paths. */
import type { Vitest } from "vitest/node";

type ClosingController = Pick<Vitest, "close"> & {
  readonly logger: Pick<Vitest["logger"], "error" | "printError" | "printUnhandledErrors">;
  readonly state: Pick<Vitest["state"], "getUnhandledErrors">;
};

/**
 * Close a controller and preserve execution failures while observing final cleanup.
 * @param controller - Public controller closing, logging, and final-state surfaces
 * @returns Completion after closing and final error inspection
 */
export async function closeVitestController(controller: ClosingController): Promise<void> {
  const original = controller.logger.error;
  const closing = { logged: false };
  controller.logger.error = (...values: unknown[]): void => {
    closing.logged = true;
    original.apply(controller.logger, values);
  };
  try { await controller.close(); }
  catch (error) {
    process.exitCode ||= 1;
    controller.logger.printError(error);
  } finally { controller.logger.error = original; }
  if (closing.logged) process.exitCode ||= 1;
  const errors = controller.state.getUnhandledErrors();
  if (errors.length > 0) {
    process.exitCode ||= 1;
    controller.logger.printUnhandledErrors(errors);
  }
}
