const INTERNAL_WORKSHOP_NOTE =
  /^공방 .+ · equipment-workshop-request:[^\s]+$/i;

export function visibleInventoryNote(
  note: string | undefined,
  revealInternalNotes = false,
): string | undefined {
  if (!note || revealInternalNotes) return note;
  return INTERNAL_WORKSHOP_NOTE.test(note.trim()) ? undefined : note;
}

export function redactInternalInventoryNote<T extends { note?: string }>(
  entry: T,
  revealInternalNotes = false,
): T {
  if (visibleInventoryNote(entry.note, revealInternalNotes) === entry.note) {
    return entry;
  }

  const visibleEntry = { ...entry };
  delete visibleEntry.note;
  return visibleEntry;
}
