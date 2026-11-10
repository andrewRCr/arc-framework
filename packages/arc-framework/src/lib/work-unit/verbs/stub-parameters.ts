/** Pure creation inputs shared by the command, lifecycle execution, and file adoption. */
import { z } from "zod";
import { COHORT_SEGMENT_CAP, isSafeCohortPath, validateCohortPath } from "../../active/cohort-path.js";
import { PrioritySchema, SLUG_PATTERN, SlugSchema, WorkClassSchema } from "../../kernel/index.js";

/** The backlog tier a stub commits to — both live physically under `backlog/`. */
export type StubCommitment = "provisional" | "planned";

/** The judgment + identity inputs a `stub` creation supplies. */
export interface StubParams {
  /** New work-unit name — must not already exist (the create edge requires a nonexistent source). */
  name: string;
  /** Committed backlog tier — required; no default tier is ever assumed. */
  commitment: StubCommitment | undefined;
  /** Work-unit priority written into the scaffolded meta — required; no silent `P3`. */
  priority: string | undefined;
  /** Identity owning the new stub — the meta `Owner`. */
  owner: string;
  /** Parsed external reference (issue / URL) → meta `Origin`, when supplied. */
  origin?: string;
  /** Parsed ARC artifact (spec / draft) → meta `Design`, when supplied. */
  design?: string;
  /** Ephemeral next-step suggestion to surface (advisory; never persisted). */
  suggestion?: string;
  /**
   * Cohort path to enrol the new member under → meta `Cohort` + a cohort-tree
   * placement (`backlog/planned/<cohort>/<name>/`). Single member only; the
   * batch cohort-tree scaffold is `decompose-matrix`'s.
   */
  cohort?: string;
  /**
   * Initial resolved `Class` (`Light` | `Heavy` | `Novel`) written into the
   * scaffolded meta; required for planned creation. Provisional omission keeps
   * the template's `[TBD]`. An unresolvable explicit value is refused.
   */
  cls?: string;
}

/** Canonical cohort path accepted by the `stub` command boundary. */
const slugSegmentPatternSource = SLUG_PATTERN.source.slice(1, -1);
const stubCohortPathPattern = new RegExp(
  `^${slugSegmentPatternSource}(?:/${slugSegmentPatternSource}){0,${String(COHORT_SEGMENT_CAP - 1)}}$`,
  "u",
);
const StubCohortPathSchema = z.string().regex(
  stubCohortPathPattern,
  "Expected a canonical one- or two-segment cohort path",
);

/** Complete schema-owned stub creation input. */
export const StubCommandInputSchema = z.object({
  name: SlugSchema,
  commitment: z.enum(["provisional", "planned"]),
  priority: PrioritySchema,
  origin: z.string().min(1).optional(),
  design: z.string().min(1).optional(),
  cohort: StubCohortPathSchema.optional(),
  class: WorkClassSchema.optional(),
}).strict();

/** A schema-valid and policy-admitted creation, or an actionable refusal without effects. */
export type StubParameterVerdict =
  | { readonly status: "valid"; readonly params: Omit<z.infer<typeof StubCommandInputSchema>, "class"> & Pick<StubParams, "owner" | "suggestion"> & {
      cls?: z.infer<typeof WorkClassSchema> } }
  | { readonly status: "rejected"; readonly reason: string };

/** Apply the command's schema before creation policy, without consulting an executor or filesystem. */
export function validateStubParameters(params: StubParams): StubParameterVerdict {
  const parsed = StubCommandInputSchema.safeParse({ name: params.name, commitment: params.commitment, priority: params.priority,
    ...(params.origin === undefined ? {} : { origin: params.origin }),
    ...(params.design === undefined ? {} : { design: params.design }),
    ...(params.cohort === undefined ? {} : { cohort: params.cohort }),
    ...(params.cls === undefined ? {} : { class: params.cls }),
  });
  if (!parsed.success) {
    const errors = parsed.error.issues.map(issue => issue.path[0] === "class"
      ? `\`${params.cls ?? ""}\` is not a resolved Class; pass \`--class\` (\`Light\`, \`Heavy\`, or \`Novel\`), or omit \`--class\` and use \`--commitment provisional\`.`
      : `${issue.path.join(".")}: ${issue.message}`);
    return { status: "rejected", reason: `\`stub\` refuses invalid creation input: ${errors.join("\n")}` };
  }
  const input = parsed.data;
  if (input.commitment === "planned" && input.class === undefined) return { status: "rejected",
    reason: "`stub --commitment planned` requires a resolved Class; pass `--class` (`Light`, `Heavy`, or `Novel`), or use `--commitment provisional`." };
  if (input.cohort !== undefined) {
    if (input.commitment !== "planned") return { status: "rejected",
      reason: "`stub --cohort` requires `--commitment planned` — cohort members are planned-tier." };
    if (!isSafeCohortPath(input.cohort)) return { status: "rejected",
      reason: `\`stub --cohort\` rejects an unsafe cohort path "${input.cohort}" (no \`..\`, leading \`/\`, or backslash).` };
    const shapeError = validateCohortPath(input.cohort);
    if (shapeError !== null) return { status: "rejected", reason: `\`stub --cohort\`: ${shapeError}.` };
  }
  const { class: cls, ...validated } = input;
  return { status: "valid", params: { ...validated, owner: params.owner, suggestion: params.suggestion, cls } };
}
