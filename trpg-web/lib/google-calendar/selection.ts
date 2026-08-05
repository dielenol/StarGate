import { z } from "zod";

import { MAX_SELECTED_GOOGLE_CALENDARS } from "./types";

const selectedCalendarIdsSchema = z
  .array(z.string().min(1).max(1024))
  .max(MAX_SELECTED_GOOGLE_CALENDARS)
  .transform((ids) => Array.from(new Set(ids)));

export function parseSelectedGoogleCalendarIds(value: unknown): string[] {
  return selectedCalendarIdsSchema.parse(value);
}
