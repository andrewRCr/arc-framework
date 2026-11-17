/** Match marker subjects to exact work-unit owners while retaining unbound-name discovery. */

/** A bound UID wins over names; unbound discovery may use current and former names. */
export function markerMatchesWorkUnitOwner(subject: { name: string; uid?: string }, owner: {
  uid: string; names: { current: string; former: readonly string[] };
}, allowUnbound: boolean): boolean {
  return subject.uid === owner.uid || allowUnbound && subject.uid === undefined
    && [owner.names.current, ...owner.names.former].includes(subject.name);
}
