/**
 * Deterministic user-facing register composition for base drift.
 *
 * @module
 */

import type {
  BaseDriftRegister,
  IntegrationEvidence,
  IntegrationEvent,
  OverlapEvidence,
} from "./base-drift-types.js";

export function composeBaseDriftRegister(
  base: string,
  behind: number,
  integration: IntegrationEvidence,
  overlap: OverlapEvidence,
): Exclude<BaseDriftRegister, null> {
  const limitation = integrationLimitation(integration);
  if (overlap.status === "available" && overlap.substantivePaths.length > 0) {
    const paths = sample(overlap.substantivePaths);
    const qualifier = limitation === null ? "" : ` ${limitation}`;
    return {
      kind: "attention",
      text: `Base \`${base}\` changed ${behind} commit(s) with substantive overlap: ${paths}. `
        + `Merge the base before continuing edits on those paths.${qualifier}`,
    };
  }

  if (overlap.status === "unavailable") {
    return {
      kind: "degraded",
      text: `Base \`${base}\` is ${behind} commit(s) ahead, but overlap analysis was unavailable `
        + `(${overlap.reason}). Raw distance requires reconciliation before integration.`,
    };
  }
  if (limitation !== null) {
    return {
      kind: "degraded",
      text: `Base \`${base}\` is ${behind} commit(s) ahead. ${limitation} `
        + "Raw distance requires reconciliation before integration.",
    };
  }

  const summary = summarizeEvents(integration);
  const regenerable = overlap.regenerablePaths.length === 0
    ? "No substantive overlap."
    : `No substantive overlap; ${sample(overlap.regenerablePaths)} ${
      overlap.regenerablePaths.length === 1 ? "is a regenerable projection" : "are regenerable projections"
    }.`;
  return {
    kind: "calm",
    text: `Base \`${base}\`: ${summary} ${regenerable} Merge when convenient; required before integration.`,
  };
}

export function composeUnavailableRegister(
  base: string | null,
  reason: string,
): Exclude<BaseDriftRegister, null> {
  return {
    kind: "degraded",
    text: `Current base drift for \`${base ?? "base"}\` could not be established (${reason}); stop before integration.`,
  };
}

function summarizeEvents(integration: IntegrationEvidence): string {
  if (integration.coverage === "unavailable") return "integration evidence unavailable.";
  const siblings = integration.events.filter(hasResolverIdentity);
  const topology = integration.events.filter((event) => !hasResolverIdentity(event));
  const parts: string[] = [];
  if (siblings.length > 0) {
    parts.push(`${siblings.length} sibling integration${siblings.length === 1 ? "" : "s"} ahead${
      describeIdentities(siblings)
    }.`);
  }
  if (topology.length > 0) {
    parts.push(`${topology.length} integration${topology.length === 1 ? "" : "s"} ahead.`);
  }
  return parts.join(" ") || "base movement contains no integration events.";
}

function hasResolverIdentity(event: IntegrationEvent): boolean {
  return event.proof === "resolver" || event.slug !== undefined || event.prUrl !== undefined;
}

function describeIdentities(events: IntegrationEvent[]): string {
  const named = events.slice(0, 3).map((event) => {
    const slug = event.slug === undefined ? null : `\`${event.slug}\``;
    const pr = event.prNumber === undefined ? null : `PR #${event.prNumber}`;
    return [slug, pr].filter((value) => value !== null).join(" ");
  }).filter((value) => value !== "");
  return named.length === 0 ? "" : ` — ${named.join(", ")}`;
}

function integrationLimitation(integration: IntegrationEvidence): string | null {
  if (integration.coverage === "unavailable") {
    return "Integration-event history could not be established.";
  }
  if (integration.coverage === "complete") return null;
  const details: string[] = [];
  if (integration.unclassifiedCommitCount > 0) {
    details.push(`${integration.unclassifiedCommitCount} commit(s) remain unclassified base movement.`);
  }
  if (integration.limitations.includes("resolver-unavailable")) details.push("Resolver evidence was unavailable.");
  if (integration.limitations.includes("resolver-invalid")) details.push("Resolver evidence was invalid.");
  if (integration.truncated) details.push("The history scan was truncated.");
  return details.join(" ") || "Integration evidence was incomplete.";
}

function sample(paths: string[]): string {
  const shown = paths.slice(0, 3).map((path) => `\`${path}\``).join(", ");
  return paths.length > 3 ? `${shown}, and ${paths.length - 3} more` : shown;
}
