import "@/lib/db/init";

import { randomUUID } from "node:crypto";

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

const googleCalendarConnectionIdentitySchema = z.object({
  generation: z.string().uuid(),
  revision: z.string().uuid(),
});

interface GoogleCalendarConnectionDocument {
  _id: string;
  generation: string;
  revision: string;
  encryptedPayload: EncryptedGoogleCalendarPayload;
  reconnectRequiredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface GoogleCalendarConnectionIdentity {
  generation: string;
  revision: string;
}

export interface GoogleCalendarConnection {
  payload: GoogleCalendarSecretPayload;
  reconnectRequired: boolean;
  identity: GoogleCalendarConnectionIdentity;
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
  const identity = googleCalendarConnectionIdentitySchema.parse({
    generation: document.generation,
    revision: document.revision,
  });
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
    identity,
  };
}

export async function upsertGoogleCalendarConnection(
  discordUserId: string,
  payload: GoogleCalendarSecretPayload,
  generation: string,
): Promise<void> {
  const validated = googleCalendarSecretPayloadSchema.parse(payload);
  const identity = googleCalendarConnectionIdentitySchema.parse({
    generation,
    revision: randomUUID(),
  });
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
        ...identity,
        encryptedPayload,
        reconnectRequiredAt: null,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  );
}

export async function updateGoogleCalendarConnection(
  discordUserId: string,
  identity: GoogleCalendarConnectionIdentity,
  payload: GoogleCalendarSecretPayload,
): Promise<GoogleCalendarConnectionIdentity | null> {
  const validatedIdentity = googleCalendarConnectionIdentitySchema.parse(
    identity,
  );
  const validatedPayload = googleCalendarSecretPayloadSchema.parse(payload);
  const nextIdentity: GoogleCalendarConnectionIdentity = {
    generation: validatedIdentity.generation,
    revision: randomUUID(),
  };
  const { encryptionKey } = getGoogleCalendarConfig();
  const id = connectionId(discordUserId);
  const encryptedPayload = encryptGoogleCalendarPayload(
    validatedPayload,
    encryptionKey,
    id,
  );
  const col = await connectionCollection();
  const result = await col.updateOne(
    {
      _id: id,
      generation: validatedIdentity.generation,
      revision: validatedIdentity.revision,
    },
    {
      $set: {
        revision: nextIdentity.revision,
        encryptedPayload,
        reconnectRequiredAt: null,
        updatedAt: new Date(),
      },
    },
  );
  return result.matchedCount === 1 ? nextIdentity : null;
}

export async function markGoogleCalendarReconnectRequired(
  discordUserId: string,
  identity: GoogleCalendarConnectionIdentity,
): Promise<GoogleCalendarConnectionIdentity | null> {
  const validatedIdentity = googleCalendarConnectionIdentitySchema.parse(
    identity,
  );
  const nextIdentity: GoogleCalendarConnectionIdentity = {
    generation: validatedIdentity.generation,
    revision: randomUUID(),
  };
  const col = await connectionCollection();
  const now = new Date();
  const result = await col.updateOne(
    {
      _id: connectionId(discordUserId),
      generation: validatedIdentity.generation,
      revision: validatedIdentity.revision,
    },
    {
      $set: {
        revision: nextIdentity.revision,
        reconnectRequiredAt: now,
        updatedAt: now,
      },
    },
  );
  return result.matchedCount === 1 ? nextIdentity : null;
}

export async function deleteGoogleCalendarConnection(
  discordUserId: string,
  generation?: string,
): Promise<boolean> {
  const col = await connectionCollection();
  const result = await col.deleteOne({
    _id: connectionId(discordUserId),
    ...(generation ? { generation } : {}),
  });
  return result.deletedCount === 1;
}

export async function getGoogleCalendarConnectionView(
  discordUserId: string,
): Promise<GoogleCalendarConnectionView> {
  const connection = await findGoogleCalendarConnection(discordUserId);
  if (!connection) {
    return {
      enabled: true,
      available: true,
      connected: false,
      reconnectRequired: false,
      selectedCalendarCount: 0,
    };
  }
  return {
    enabled: true,
    available: true,
    connected: true,
    reconnectRequired: connection.reconnectRequired,
    selectedCalendarCount: connection.payload.selectedCalendarIds.length,
  };
}
