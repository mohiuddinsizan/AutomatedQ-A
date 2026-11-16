/**
 * BigBang rolls are 6 digits ("000476"), but a few old records have the leading zeros
 * missing ("476"). Both mean the same student, so every roll is read in one form:
 * numbers shorter than 6 digits are zero-padded. Used by the import and at sign-in.
 */
export function canonicalRoll(roll: string | number): string {
  const r = String(roll).trim();
  return /^\d{1,5}$/.test(r) ? r.padStart(6, "0") : r;
}
