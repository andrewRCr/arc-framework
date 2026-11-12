# Repository record backend

The public factory in the parent directory owns backend loading. Callers supply the complete port object and use
logical record references; this directory translates those operations to the checkout's existing records.

Flat active metas and held checkout listings use regular files directly, without Git. Other live work-unit reads
use the existing local lifecycle composition, including fetched remote-tracking refs, and share its selected copy
with companion reads and write admission. A saved state selects only the immutable tree at that branch commit.
Malformed listed records retain a diagnostic; reads preserve raw prose and meta bytes where their format permits it.

Tracked writes compare exact content digests under the checkout's own advisory lock. Internal tracked records use
existing canonical writers and their per-file locks. Batches capture all targets, reject every stale target before
mutation, and restore attempted writes after failure. Writes leave the Git index untouched. Placement moves, UIDs,
links, and completed creation retain explicit refusal routes to the existing lifecycle verbs.

History and changes follow committed tracked record bytes and preserve commit messages. Logical lookup derives current
slugs, transition aliases, checkout claims, branch names, and final Context footers. Tracked state lives on the branch.

Personal files use the existing primary identity root and checkout workspace roots. Reads and listings take no lock;
whole-file digest writes and batches take the existing notes lock. A failed batch restores and verifies every attempted
target, including removals. Machine state and derived identity status remain outside personal storage.

Transient identity records read the current local ref without fetching and retain each blob object ID as the mutation
basis. Writes use the existing complete-basis transaction, checking expected versions after remote reconciliation.
Stale writes leave caller changes unapplied while landing the reconciled basis. History preserves raw ref commit
messages; claims and canonical Errand branches resolve through local records.

Sync saves and reconciles personal notes before pushing the independent transient ref, without pushing the branch.
Returned notes outcomes allow the second publish; a thrown local failure ends sync before it. Configured remote Git
failures carry structured publication facts, while local failures retain their original causes. Producer behavior
includes repeated `pushed` results, same-key transient conflicts, and notes reconciliation without loading working files.
Batches spanning substrates refuse before changing files, notes, refs or the index; retry them separately in order.
