/** Typed refusals when an existing frontline admission cannot serve a requested transition. */

/** Distinguish stale targets, withdrawn admissions, and already-consumed review authority. */
export class FrontlineAdmissionError extends Error {
  readonly code = "invalid-input" as const;

  constructor(
    readonly reason: "stale-target" | "missing-admission" | "conditional-authority-consumed",
    message: string,
  ) {
    super(message);
    this.name = "FrontlineAdmissionError";
  }
}
