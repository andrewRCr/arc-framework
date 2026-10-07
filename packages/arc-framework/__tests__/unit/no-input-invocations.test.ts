/** Pure signal scheduling through the same transport decision used by the CLI helper. */
import { describe, expect, it } from "vitest";
import { NO_INPUT_MATRIX } from "../fixtures/command-input/no-input-matrix.js";
import { selectNoInputInvocations } from "../helpers/no-input-invocations.js";

function entry(commandPath: string) {
  const found = NO_INPUT_MATRIX.find((candidate) => candidate.commandPath === commandPath);
  if (found === undefined) throw new Error(`Missing matrix command ${commandPath}`);
  return found;
}

describe("distinct no-input invocations", () => {
  it("folds JSON pipe signals into the explicit no-input representative", () => {
    const item = entry("attest");
    expect(selectNoInputInvocations(item, "linux")).toEqual([
      { signal: "--no-input", args: ["--no-input", ...item.args], ci: "false", forceNoTty: false },
    ]);
  });

  it("folds stdin pipe signals without changing their argv", () => {
    const item = entry("candidate applicability resolve");
    expect(selectNoInputInvocations(item, "linux").map(({ signal, args }) => ({ signal, args }))).toEqual([
      { signal: "--no-input", args: ["--no-input", ...item.args] },
    ]);
  });

  it("retains explicit TTY and one pipe signal for implicit machine payloads", () => {
    expect(selectNoInputInvocations(entry("base merge"), "linux").map(({ signal }) => signal))
      .toEqual(["--no-input", "CI"]);
  });

  it.each(["win32", "darwin"] as const)("folds all piped signals on %s", (platform) => {
    expect(NO_INPUT_MATRIX.flatMap((item) => selectNoInputInvocations(item, platform))).toHaveLength(80);
  });

  it("reconciles all Linux matrix entries into the distinct transport groups", () => {
    const lengths = NO_INPUT_MATRIX.map((item) => selectNoInputInvocations(item, "linux").length);
    expect([lengths.filter((n) => n === 1).length, lengths.filter((n) => n === 2).length,
      lengths.filter((n) => n === 3).length, lengths.reduce((sum, n) => sum + n, 0)]).toEqual([45, 6, 29, 144]);
  });
});
