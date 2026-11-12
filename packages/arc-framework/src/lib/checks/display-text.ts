/** Summary-safe rendering of text that checks and check runners report. */
import type { TerminalOutcome } from "./runner/contract.js";

/** Longest notice a check may report, so it stays one short line of the summary. */
export const NOTICE_LIMIT = 200;
/** Longest runner explanation, remedy or warning kept on its summary line. */
export const RUNNER_TEXT_LIMIT = 1000;

/**
 * Split reported text into trimmed, nonempty lines. A bare carriage return breaks a line too, and other control
 * characters become spaces, so text printed inside a summary line cannot move the cursor over that line.
 */
export function displayLines(text: string): string[] {
  return text.split(/\r\n|\r|\n/u).map(part => part.replace(/\p{Cc}+/gu, " ").trim()).filter(part => part !== "");
}

/** Join reported text into one bounded summary line, empty when nothing printable remains. */
export function displayLine(text: string, limit: number): string {
  return displayLines(text).join("; ").slice(0, limit);
}

/** Bound an adapter's runner text, keeping a fallback when nothing printable remains. */
export function runnerDisplayText(text: string, fallback = "Runner reported no printable explanation."): string {
  return displayLine(text, RUNNER_TEXT_LIMIT) || fallback;
}

/** Apply native notice policy to an adapter-reported outcome before ARC interprets or renders it. */
export function displayRunnerOutcome(outcome: TerminalOutcome | undefined): TerminalOutcome | undefined {
  if (outcome === undefined) return undefined;
  if (outcome.status === "cancelled") return { ...outcome, reason: runnerDisplayText(outcome.reason) };
  if (outcome.status === "unavailable") {
    return { ...outcome, reason: runnerDisplayText(outcome.reason), remedy: runnerDisplayText(outcome.remedy, "Repair the runner and retry.") };
  }
  const { notice, notRunReason, ...completed } = outcome;
  const line = notice === undefined ? "" : displayLine(notice, NOTICE_LIMIT);
  return { ...completed, ...(line === "" ? {} : { notice: line }),
    ...(notRunReason === undefined ? {} : { notRunReason: displayLine(notRunReason, NOTICE_LIMIT) || "runner reported no check result" }) };
}
