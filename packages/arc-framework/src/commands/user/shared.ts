/** Notes ref prefix for ARC user directories. */
const NOTES_REF_PREFIX = "arc/user";

/** Build the notes ref for a given identity. */
export function notesRef(identity: string): string {
  return `${NOTES_REF_PREFIX}/${identity}`;
}

