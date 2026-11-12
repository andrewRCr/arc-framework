/** JSON request grammar for the repository-owned retained test-cost comparison entry. */

export type TestCostComparisonPathRequest =
  | {
    readonly kind: "lever";
    readonly before: readonly string[];
    readonly after: readonly string[];
  }
  | {
    readonly kind: "sizing-sweep";
    readonly groups: readonly (readonly string[])[];
  };

/**
 * Parse one external comparison request.
 *
 * @param value - Untrusted JSON input.
 * @returns The validated retained-run path groups.
 */
export function parseTestCostComparisonRequest(value: unknown): TestCostComparisonPathRequest {
  if (typeof value !== "object" || value === null) {
    throw new Error("Test-cost comparison request must be an object with a recognized kind");
  }
  const candidate = value as Readonly<Record<string, unknown>>;
  if (candidate["kind"] === "lever") {
    return {
      kind: "lever",
      before: pathGroup(candidate["before"], "before"),
      after: pathGroup(candidate["after"], "after"),
    };
  }
  if (candidate["kind"] === "sizing-sweep") {
    const groups = candidate["groups"];
    if (!Array.isArray(groups) || groups.length < 2) {
      throw new Error("A sizing-sweep request requires at least two retained-run groups");
    }
    return {
      kind: "sizing-sweep",
      groups: groups.map((group, index) => pathGroup(group, `groups[${index}]`)),
    };
  }
  throw new Error("Test-cost comparison request kind must be lever or sizing-sweep");
}

function pathGroup(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Test-cost comparison ${label} must be a non-empty path group`);
  }
  return value.map((path, index) => {
    if (typeof path !== "string" || path.trim().length === 0) {
      throw new Error(`Test-cost comparison ${label}[${index}] must be a non-empty path`);
    }
    return path;
  });
}
