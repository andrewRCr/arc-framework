/**
 * The shared verb-dispatch core — target resolution and bare-invocation candidates.
 *
 * Every transition-targeting verb (`park` / `resume` / `activate` / … ) needs the
 * same two decisions before it can run: *which* work unit does it act on, and —
 * when that can't be answered — *what could it have acted on*. This module is the
 * pure, CLI-free core of both:
 *
 * - **Dispatch mode.** Each verb is either **context-defaulting** (a bare
 *   invocation acts on the current worktree's WU) or **slug-required** (no safe
 *   current-WU default, or destructive — the slug must be named). {@link DISPATCH_MODE}
 *   is the table.
 * - **Target resolution.** {@link selectVerbTarget} resolves the acted-on slug from
 *   the explicit arg, falling back to the current-WU slug for context-defaulting
 *   verbs; when neither yields a target it reports `needs-candidates`, the signal
 *   the CLI turns into a candidate list.
 * - **Candidate derivation.** {@link findVerbCandidates} lists the work units a verb
 *   could legally act on — the slugs whose derived state is one of the verb's valid
 *   from-states, read straight off the transition table ({@link validFromStates}).
 *   {@link formatVerbCandidates} renders the **non-interactive** one-line surface a
 *   bare invocation prints before exiting (never a TTY-blocking prompt).
 *
 * Pure and synchronous: every function is a total function of the pre-built
 * lifecycle index and the transition table, so the CLI binding owns all I/O.
 *
 * @module
 */

import { deriveState, type LifecycleState } from "../lifecycle-resolver.js";
import type { LifecycleIndex } from "../lifecycle-index.js";
import { TRANSITIONS, type Verb } from "../lifecycle-transitions.js";

/**
 * The transition-targeting verbs whose bare invocation defaults to the current
 * worktree's WU — a slug only names a *different* target. None is destructive,
 * and each has a safe current-WU reading.
 */
export const CONTEXT_DEFAULTING_VERBS = ["park", "reopen", "archive", "activate", "deactivate"] as const;

/**
 * The transition-targeting verbs that always require an explicit slug — either no
 * current-WU default makes sense (a backlog-tier move, a parked-shelf re-attach)
 * or the edge is destructive (`abandon`).
 */
export const SLUG_REQUIRED_VERBS = ["resume", "promote", "demote", "abandon"] as const;

/** A verb routed through the shared dispatch shape (excludes `start` / `stub`, which own their entry handlers). */
export type TransitionVerb =
  | (typeof CONTEXT_DEFAULTING_VERBS)[number]
  | (typeof SLUG_REQUIRED_VERBS)[number];

/** How a verb resolves its target when invoked without an explicit slug. */
export type DispatchMode = "context-defaulting" | "slug-required";

/** The per-verb dispatch mode — the bare-invocation default policy. */
export const DISPATCH_MODE: Record<TransitionVerb, DispatchMode> = {
  park: "context-defaulting",
  reopen: "context-defaulting",
  archive: "context-defaulting",
  activate: "context-defaulting",
  deactivate: "context-defaulting",
  resume: "slug-required",
  promote: "slug-required",
  demote: "slug-required",
  abandon: "slug-required",
};

/**
 * The resolved dispatch target — either the slug to act on, or the signal that no
 * target could be resolved (the CLI prints the candidate list and exits).
 */
export type VerbTarget = { kind: "resolved"; slug: string } | { kind: "needs-candidates" };

/**
 * Resolve which work unit a verb acts on. An explicit slug always wins; otherwise a
 * context-defaulting verb falls back to the current worktree's WU when one resolved.
 * Everything else — a slug-required verb with no slug, or a context verb run with no
 * current WU — is `needs-candidates`.
 *
 * @param verb - The dispatched verb.
 * @param slugArg - The explicit slug argument, if any (whitespace-only is treated as absent).
 * @param currentWuSlug - The current worktree's WU slug, or `null` when none / ambiguous.
 * @returns The resolved slug, or the needs-candidates signal.
 */
export function selectVerbTarget(
  verb: TransitionVerb,
  slugArg: string | undefined,
  currentWuSlug: string | null,
): VerbTarget {
  const trimmed = slugArg?.trim();
  if (trimmed) return { kind: "resolved", slug: trimmed };
  if (DISPATCH_MODE[verb] === "context-defaulting" && currentWuSlug !== null) {
    return { kind: "resolved", slug: currentWuSlug };
  }
  return { kind: "needs-candidates" };
}

/**
 * The derived states a verb may legally transition *from* — read off the transition
 * table (every legal edge for the verb, projected through {@link deriveState}),
 * deduplicated in table order.
 *
 * @param verb - The verb to look up.
 * @returns The verb's valid from-states (empty for a creation verb whose only source is `nonexistent`).
 */
export function validFromStates(verb: Verb): LifecycleState[] {
  const seen = new Set<LifecycleState>();
  const states: LifecycleState[] = [];
  for (const transition of TRANSITIONS) {
    if (transition.verb !== verb || transition.from === null) continue;
    const state = deriveState(transition.from);
    if (!seen.has(state)) {
      seen.add(state);
      states.push(state);
    }
  }
  return states;
}

/** One work unit a verb could act on — its slug and the derived state placing it in range. */
export interface VerbCandidate {
  slug: string;
  state: LifecycleState;
}

/**
 * The work units a verb could legally act on now — every indexed slug whose derived
 * state is one of the verb's valid from-states, sorted by slug for a stable surface.
 *
 * @param index - The lifecycle-complete index from `buildLifecycleIndex`.
 * @param verb - The verb whose actionable targets to list.
 * @returns The matching candidates, slug-sorted.
 */
export function findVerbCandidates(index: LifecycleIndex, verb: Verb): VerbCandidate[] {
  const valid = new Set(validFromStates(verb));
  const candidates: VerbCandidate[] = [];
  for (const [slug, entry] of index) {
    const state = deriveState({ phase: entry.phase, location: entry.location });
    if (valid.has(state)) candidates.push({ slug, state });
  }
  candidates.sort((a, b) => a.slug.localeCompare(b.slug));
  return candidates;
}

/** Title-case a derived-state label for the candidate surface (`parked` → `Parked`). */
function stateLabel(state: LifecycleState): string {
  return state.charAt(0).toUpperCase() + state.slice(1);
}

/**
 * Render the **non-interactive** one-line candidate surface a bare invocation prints
 * before exiting — the actionable targets grouped by state, plus the usage line. With
 * no candidates, names the valid from-states so the surface still orients.
 *
 * E.g. `resume` with parked `foo` / `bar` → ``Parked: `bar`, `foo` · usage `arc resume <slug>` ``.
 *
 * @param verb - The dispatched verb.
 * @param candidates - The actionable candidates (typically from {@link findVerbCandidates}).
 * @returns The single-line surface.
 */
export function formatVerbCandidates(verb: Verb, candidates: readonly VerbCandidate[]): string {
  const usage = `usage \`arc ${verb} <slug>\``;
  if (candidates.length === 0) {
    const states = validFromStates(verb).map(stateLabel).join(" / ");
    return `No ${states} work unit to ${verb} · ${usage}`;
  }
  const bySlug = (a: VerbCandidate, b: VerbCandidate): number => a.slug.localeCompare(b.slug);
  const groups: string[] = [];
  for (const state of validFromStates(verb)) {
    const slugs = candidates.filter((c) => c.state === state).sort(bySlug);
    if (slugs.length === 0) continue;
    groups.push(`${stateLabel(state)}: ${slugs.map((c) => `\`${c.slug}\``).join(", ")}`);
  }
  return `${groups.join(" · ")} · ${usage}`;
}
