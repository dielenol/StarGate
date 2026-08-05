import "@/lib/db/init";

import { getDb } from "@stargate/shared-db";
import { z } from "zod";

import {
  decryptGoogleCalendarPayload,
  encryptGoogleCalendarPayload,
  type EncryptedGoogleCalendarPayload,
} from "@/lib/google-calendar/crypto";
import { getGoogleCalendarConfig } from "@/lib/google-calendar/config";
import type {
  GoogleCalendarConnectionView,
  GoogleCalendarSecretPayload,
} from "@/lib/google-calendar/types";
import { TRPG_GUILD_ID } from "@/lib/env";

const COLLECTION_NAME = "trpg_web_google_calendar_connections";

const googleCalendarSecretPayloadSchema = z.object({
  refreshToken: z.string().min(1),
  accessToken: z.string().min(1).nullable(),
  accessTokenExpiresAt: z.number().int().positive().nullable(),
  selectedCalendarIds: z.array(z.string().min(1)).max(10),
  grantedScopes: z.array(z.string().min(1)),
});

interface GoogleCalendarConnectionDocument {
  _id: string;
  encryptedPayload: EncryptedGoogleCalendarPayload;
  reconnectRequiredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface GoogleCalendarConnection {
  payload: GoogleCalendarSecretPayload;
  reconnectRequired: boolean;
}

function connectionId(discordUserId: string): string {
  return `${TRPG_GUILD_ID}:${discordUserId}`;
}

async function connectionCollection() {
  const db = await getDb();
  return db.collection<GoogleCalendarConnectionDocument>(COLLECTION_NAME);
}

export async function findGoogleCalendarConnection(
  discordUserId: string,
): Promise<GoogleCalendarConnection | null> {
  const col = await connectionCollection();
  const id = connectionId(discordUserId);
  const document = await col.findOne({ _id: id });
  if (!document) return null;

  const { encryptionKey } = getGoogleCalendarConfig();
  const payload = googleCalendarSecretPayloadSchema.parse(
    decryptGoogleCalendarPayload<unknown>(
      document.encryptedPayload,
      encryptionKey,
      id,
    ),
  );
  return {
    payload,
    reconnectRequired: document.reconnectRequiredAt !== null,
  };
}

export async function saveGoogleCalendarConnection(
  discordUserId: string,
  payload: GoogleCalendarSecretPayload,
): Promise<void> {
  const validated = googleCalendarSecretPayloadSchema.parse(payload);
  const { encryptionKey } = getGoogleCalendarConfig();
  const encryptedPayload = encryptGoogleCalendarPayload(
    validated,
    encryptionKey,
    connectionId(discordUserId),
  );
  const now = new Date();
  const col = await connectionCollection();
  await col.updateOne(
    { _id: connectionId(discordUserId) },
    {
      $set: {
        encryptedPayload,
        reconnectRequiredAt: null,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  );
}

export async function markGoogleCalendarReconnectRequired(
  discordUserId: string,
): Promise<void> {
  const col = await connectionCollection();
  const now = new Date();
  await col.updateOne(
    { _id: connectionId(discordUserId) },
    { $set: { reconnectRequiredAt: now, updatedAt: now } },
  );
}

export async function deleteGoogleCalendarConnection(
  discordUserId: string,
): Promise<void> {
  const col = await connectionCollection();
  await col.deleteOne({ _id: connectionId(discordUserId) });
}

export async function getGoogleCalendarConnectionView(
  discordUserId: string,
): Promise<GoogleCalendarConnectionView> {
  try {
    const connection = await findGoogleCalendarConnection(discordUserId);
    if (!connection) {
      return {
        enabled: true,
        connected: false,
        reconnectRequired: false,
        selectedCalendarCount: 0,
      };
    }
    return {
      enabled: true,
      connected: true,
      reconnectRequired: connection.reconnectRequired,
      selectedCalendarCount: connection.payload.selectedCalendarIds.length,
    };
  } catch {
    return {
      enabled: true,
      connected: true,
      reconnectRequired: true,
      selectedCalendarCount: 0,
    };
  }
}
