/**
 * The machine-local index each projected worktree keeps about its copy of the store: per file, what the projection
 * wrote there and the stored version it came from, and beside the files, what the worktree was projected under.
 */
import { z } from "zod";
import { SlugSchema, isManagedPath } from "../../kernel/index.js";
import { RecordReferenceSchema, RecordVersionSchema, StateVersionSchema } from "../identity.js";
import { ArchiveSaveIdSchema } from "../links.js";
import { RemedySchema } from "../refusal.js";
import { isProjectionIndexGroup, projectionIndexGroup } from "./index-memory.js";

/** The index format this build reads and writes. */
export const PROJECTION_INDEX_FORMAT = 3;

/** A Git blob id in the repository's object format, SHA-1 or SHA-256. */
export const BlobIdSchema = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u);

/** A bigint stat field, stored as a decimal string so no precision is lost to JSON numbers. */
const StatBigintSchema = z.codec(z.string().regex(/^(?:0|[1-9][0-9]*)$/u), z.bigint().nonnegative(), {
  decode: (text) => BigInt(text),
  encode: (value) => value.toString(),
});

/** An `lstat` of a projected or ignore file, every field read as a bigint. */
const FileStatSchema = z.strictObject({
  type: z.enum(["file", "symlink", "other"]),
  size: StatBigintSchema,
  mtimeNs: StatBigintSchema,
  ino: StatBigintSchema,
});

/** A stored version: its content's blob id and its record version, the compare-and-swap basis. */
const StoredVersionSchema = z.strictObject({ blob: BlobIdSchema, version: RecordVersionSchema });

/** A refusal the last write-back or adoption met: its reason and the remedy it names. */
const RefusedMarkSchema = z.strictObject({ reason: z.string().min(1), remedy: RemedySchema });

/** The conflict markers a file holds: one length for the file, and what each marker set shows. */
const MarkersSchema = z.strictObject({
  length: z.number().int().positive(),
  sets: z.array(z.discriminatedUnion("shows", [
    z.strictObject({ shows: z.literal("stored"), conflict: RecordReferenceSchema }),
    z.strictObject({ shows: z.literal("checkout") }),
  ])).min(1),
});

/** What the last persisted write-back read: its Markdown stamp or stampless take-in base blob, and content taken in. */
const PersistedSchema = z.strictObject({
  stamp: BlobIdSchema,
  inputBlob: BlobIdSchema.optional(),
  recording: z.literal(true).optional(),
  /** The blob of the file bytes the retained or accepted input was read from. */
  read: BlobIdSchema.optional(),
  /** The repair still required in a live input whose write only partially landed. */
  retained: RefusedMarkSchema.optional(),
  takenIn: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("landed"), version: RecordVersionSchema }),
    z.strictObject({ kind: z.literal("copy"), name: z.string().min(1), blob: BlobIdSchema, version: RecordVersionSchema }),
  ]),
}).refine(value => value.recording !== true || value.takenIn.kind === "copy", "Unfinished recording requires an input copy");

const ArchiveSaveReadSchema = z.strictObject({ stat: FileStatSchema, blob: BlobIdSchema });
const ArchiveSaveSubmissionSchema = z.strictObject({ id: ArchiveSaveIdSchema, stamp: BlobIdSchema,
  name: z.string().regex(/^[a-f0-9]{40,64}\.[a-f0-9]{16}$/u), blob: BlobIdSchema, read: ArchiveSaveReadSchema.optional(),
  aside: z.string().min(1).optional(), retained: RefusedMarkSchema.optional() });

/** An input retained before publishing an archive save. */
export type ArchiveSaveSubmission = z.output<typeof ArchiveSaveSubmissionSchema>;

/** A replacement in progress of a file other than Markdown: the version it replaces and the copy its batch makes. */
const InProgressSchema = z.strictObject({ replaces: StoredVersionSchema, copy: z.string().min(1).nullable() });

/** The marker origins and notice references belonging to one rendered file's bytes. */
export const FileRenderingSchema = z.strictObject({ markers: MarkersSchema.nullable(), notices: z.array(RecordReferenceSchema) });

/** One aside copy a swap made of the file, while it stays in the aside folder. */
const AsideCopyRecordSchema = z.strictObject({
  name: z.string().min(1),
  moving: BlobIdSchema,
  rendering: FileRenderingSchema,
  linked: BlobIdSchema.nullable(),
  writeBackSent: z.boolean(),
  landed: BlobIdSchema.nullable(),
});

/** A file bound to a record, including adoption before its first rendering; null `stat` records absence. */
const RecordBasisSchema = z.strictObject({
  kind: z.literal("record"),
  reference: RecordReferenceSchema,
  stat: FileStatSchema.nullable(),
  written: BlobIdSchema,
  base: StoredVersionSchema,
  markers: MarkersSchema.nullable(),
  notices: z.array(RecordReferenceSchema),
  unshown: z.array(RecordReferenceSchema),
  protected: z.boolean(),
  changed: z.boolean(),
  opened: z.literal(true).optional(),
  pending: z.boolean(),
  withheld: z.boolean(),
  refused: RefusedMarkSchema.nullable(),
  persisted: PersistedSchema.nullable(),
  acceptedInputStat: FileStatSchema.pick({ ino: true, mtimeNs: true }).extend({
    beforeLay: z.literal(true).optional(),
    lay: z.discriminatedUnion("kind", [
      z.strictObject({ kind: z.literal("pending") }),
      z.strictObject({ kind: z.literal("linking"), originalCopy: z.string().min(1).nullable() }),
      z.strictObject({ kind: z.literal("installed") }),
    ]).optional(),
  }).optional(),
  archiveSubmission: ArchiveSaveSubmissionSchema.optional(),
  inProgress: InProgressSchema.nullable(),
  copies: z.array(AsideCopyRecordSchema),
  adoption: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("write-back"), stub: z.literal(true).optional() }),
    z.strictObject({ kind: z.literal("read-back"), read: z.strictObject({ stat: FileStatSchema, blob: BlobIdSchema }),
      retained: RefusedMarkSchema.optional() }),
  ]).optional(),
});

/**
 * A path retains its leaving basis and, during exclusive installation, one complete arriving basis. A record a refresh
 * moves here with changed or opened state, before its arrival can be journaled, is named in `arrivingChanged` or
 * `arrivingOpened` until installation carries that state onto the arrival.
 */
export const RecordEntrySchema = RecordBasisSchema.extend({ handoff: RecordBasisSchema.optional(),
  arrivingChanged: RecordReferenceSchema.optional(), arrivingOpened: RecordReferenceSchema.optional() });

/** The exact accepted creation retained until its metadata basis can be read. */
const MintedStubReceiptSchema = z.strictObject({ reference: RecordReferenceSchema.refine(reference =>
  reference.kind === "work-item/meta" && reference.owner.type === "work-item" && reference.owner.uid !== undefined,
"A minted stub receipt requires an exact metadata generation"), version: RecordVersionSchema });
/** Exact stub authority, without inventing a content blob before its basis is readable. */
export type MintedStubReceipt = z.infer<typeof MintedStubReceiptSchema>;

/** A file not yet bound to a usable record basis, optionally retaining an accepted stub receipt. */
const OwnerlessBasisSchema = z.strictObject({
  kind: z.literal("ownerless"),
  withheld: z.literal(true).optional(),
  minted: MintedStubReceiptSchema.optional(),
  stat: FileStatSchema.nullable(),
  refused: RefusedMarkSchema.optional(),
  opened: z.literal(true).optional(),
  archiveSubmission: ArchiveSaveSubmissionSchema.extend({ reference: RecordReferenceSchema, read: ArchiveSaveReadSchema }).optional(),
});
const OwnerlessEntrySchema = z.union([
  OwnerlessBasisSchema.extend({ refused: RefusedMarkSchema }),
  OwnerlessBasisSchema.extend({ opened: z.literal(true) }),
]);

/** A discovered path still awaiting its first stored binding. */
export type OwnerlessEntry = z.output<typeof OwnerlessEntrySchema>;

/** One index entry, keyed by its repository-relative path. */
const IndexEntrySchema = z.union([RecordEntrySchema, OwnerlessEntrySchema]);

/** An ignore file the guard's last pass rested on, with its stat and blob id, or both null where it was absent. */
const IgnoreFileRecordSchema = z.union([
  z.strictObject({ path: z.string().min(1), stat: FileStatSchema, blob: BlobIdSchema }),
  z.strictObject({ path: z.string().min(1), stat: z.null(), blob: z.null() }),
]);

/** An entry's key: a repository-relative path, validated but not branded, so a caller looks a path up as it is. */
const EntryPathSchema = z.string().refine((path): boolean => isManagedPath(path), "Expected a repository-relative path");

/** The settings and claim a worktree was projected under. */
const ProjectedUnderSchema = z.strictObject({
  view: z.strictObject({ mode: z.enum(["mine", "cohort", "all"]), pins: z.array(SlugSchema) }),
  identity: SlugSchema,
  claim: SlugSchema.nullable(),
  claimUid: z.uuid().optional(),
  layoutActive: z.enum(["nested", "flat"]),
});

/** The excludes source and all ordered settings that affect the ignore verdict. */
const IgnoreRulesSelectionSchema = z.strictObject({
  path: z.string(), values: z.array(z.string()), ignoreCase: z.array(z.string().nullable()),
});

/** The actual roots and captured configuration a passing guard proved, independently of projection settings. */
const IgnoreGuardBasisSchema = z.strictObject({
  // An opaque proof identity: older proofs invalidate the cache without discarding recovery entries.
  personalRules: z.string().min(1),
  roots: z.array(z.string().min(1)).min(1), configuration: IgnoreRulesSelectionSchema,
});

/**
 * The whole index, decoded into bigints and validated references; unknown fields fail. On disk it is stored as a header
 * (`ProjectionIndexHeaderSchema`) and one partition per root (`ProjectionIndexPartitionSchema`).
 */
export const ProjectionIndexSchema = z.strictObject({
  format: z.literal(PROJECTION_INDEX_FORMAT),
  state: StateVersionSchema.nullable(),
  projectedUnder: ProjectedUnderSchema,
  reprojectionPending: z.literal(true).optional(),
  withheldCopies: z.array(z.string().min(1)),
  archiveRecoveryCopies: z.array(z.string().min(1)).optional(),
  tripwires: z.record(z.string().min(1), z.array(z.number().nonnegative()).max(9)),
  ignoreFiles: z.array(IgnoreFileRecordSchema).nullable(),
  ignoreGuard: IgnoreGuardBasisSchema.nullable(),
  entries: z.record(EntryPathSchema, IndexEntrySchema),
});

/** The persisted header's contract, its group keys held to the groups the reader accepts. */
export const ProjectionIndexHeaderSchema = ProjectionIndexSchema.omit({ entries: true }).extend({
  groups: z.record(z.string().refine(isProjectionIndexGroup, "Expected a projection index group"),
    z.strictObject({ name: z.string().regex(/^index-[a-f0-9]{40}$/u), unsettled: z.boolean() })),
});
/** A single root partition's persisted contract: entries of one group only, as the reader loads it. */
export const ProjectionIndexPartitionSchema = ProjectionIndexSchema.shape.entries.refine(
  entries => new Set(Object.keys(entries).map(projectionIndexGroup)).size <= 1, "Expected the paths of one group");

/** A decoded projection index. */
export type ProjectionIndex = z.output<typeof ProjectionIndexSchema>;
/** The complete ignore configuration basis of a passing guard. */
export type IgnoreRulesSelection = z.output<typeof IgnoreRulesSelectionSchema>;
/** The actual paths and configuration authorized by a passing guard. */
export type IgnoreGuardBasis = z.output<typeof IgnoreGuardBasisSchema>;
/** A decoded `lstat`, its fields bigints. */
export type FileStat = z.output<typeof FileStatSchema>;
/** A decoded ignore-file record. */
export type IgnoreFileRecord = z.output<typeof IgnoreFileRecordSchema>;
/** A decoded entry for a file the projection laid from a record. */
export type RecordEntry = z.output<typeof RecordEntrySchema>;
/** The marker and notice mapping a displaced file retains independently of its replacement. */
export type FileRendering = z.output<typeof FileRenderingSchema>;
/** A decoded aside copy's record. */
export type AsideCopyRecord = z.output<typeof AsideCopyRecordSchema>;
/** A decoded refusal mark. */
export type RefusedMark = z.output<typeof RefusedMarkSchema>;

/**
 * Decode a whole index from one parsed JSON value. Only tests hold an index in this form; the file stores a header and
 * partitions.
 * @param value - The parsed JSON value.
 * @returns The decoded index, or the schema's failure.
 */
export function decodeProjectionIndex(value: unknown): z.ZodSafeParseResult<ProjectionIndex> {
  return ProjectionIndexSchema.safeParse(value);
}

/**
 * Encode a whole index as one JSON text, the form only tests hold; the file stores a header and partitions.
 * @param index - A decoded index.
 * @returns Its JSON text, bigints as decimal strings.
 */
export function encodeProjectionIndex(index: ProjectionIndex): string {
  return `${JSON.stringify(ProjectionIndexSchema.encode(index))}\n`;
}
