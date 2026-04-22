/**
 * Clack summary formatters for `arc status` — the composite probe.
 *
 * JSON emission is not formatter-side — the handler calls `JSON.stringify`
 * on the typed result directly. These builders produce the human-readable
 * Clack note body that pairs with the default (no-`--json`) invocation,
 * rendering four stably-ordered sections (one per probe) plus the identity
 * pointer block.
 *
 * Each probe result delegates to its own probe-specific formatter; failed
 * slots render a single-line "unavailable" marker so one probe's failure
 * does not obscure the other three's output.
 */

import { buildActiveSessionInitSummary, buildActiveStatusSummary } from "../active/format.js";
import { buildConfigSessionInitSummary, buildConfigStatusSummary } from "../config/format.js";
import {
  buildExtensionsSessionInitSummary,
  buildExtensionsStatusSummary,
} from "../extensions/format.js";
import {
  buildUserSessionInitStatusSummary,
  buildUserStatusSummary,
} from "../user/format.js";

import type {
  Probe,
  SessionInitProbeResult,
  StatusIdentity,
  StatusResult,
} from "./types.js";

const SECTION_SEPARATOR = "";

function renderIdentity(identity: StatusIdentity): string {
  const value = (v: string | null): string => (v === null ? "(unset)" : v);
  return [
    "Identity:",
    `  arc.identity: ${value(identity.identity)}`,
    `  arc.role:     ${value(identity.role)}`,
  ].join("\n");
}

function renderSlot<T>(label: string, slot: Probe<T>, render: (value: T) => string): string {
  const header = `${label}:`;
  if (!slot.ok) {
    return [header, `  (unavailable) ${slot.error.message}`].join("\n");
  }
  const body = render(slot.value);
  const indented = body.split("\n").map((line) => (line.length > 0 ? `  ${line}` : line)).join("\n");
  return [header, indented].join("\n");
}

/** Build the Clack summary for `arc status` (full mode). */
export function buildStatusSummary(result: StatusResult): string {
  const sections: string[] = [
    renderIdentity(result.identity),
    renderSlot("User", result.user, buildUserStatusSummary),
    renderSlot("Extensions", result.extensions, buildExtensionsStatusSummary),
    renderSlot("Config", result.config, buildConfigStatusSummary),
    renderSlot("Active", result.active, buildActiveStatusSummary),
  ];
  return sections.join(`\n${SECTION_SEPARATOR}\n`);
}

/** Build the Clack summary for `arc status --session-init`. */
export function buildSessionInitStatusSummary(result: SessionInitProbeResult): string {
  const sections: string[] = [
    renderIdentity(result.identity),
    renderSlot("User", result.user, buildUserSessionInitStatusSummary),
    renderSlot("Extensions", result.extensions, buildExtensionsSessionInitSummary),
    renderSlot("Config", result.config, buildConfigSessionInitSummary),
    renderSlot("Active", result.active, buildActiveSessionInitSummary),
  ];
  return sections.join(`\n${SECTION_SEPARATOR}\n`);
}
