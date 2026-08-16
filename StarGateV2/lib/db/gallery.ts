import "server-only";

import { createHash } from "node:crypto";

import {
  MongoServerError,
  type ClientSession,
  type Collection,
  type Db,
  type Filter,
  type UpdateFilter,
} from "mongodb";

import type { SessionReport } from "@stargate/shared-db/types";
import {
  getClient,
  getDb,
  sessionReportsCol,
  sessionReportVisibilityFilter,
} from "@stargate/shared-db";

import type {
  GalleryFanartMetadataInput,
  GalleryFanartStatus,
} from "@/types/gallery";
import type { UserRole } from "@/types/user";

import { GALLERY_DAILY_UPLOAD_LIMIT } from "@/lib/gallery/input";

import "./init";

const FANART_COLLECTION_NAME = "gallery_fanarts";
const UPLOAD_COUNTER_COLLECTION_NAME = "gallery_upload_counters";
const BLOB_CLEANUP_COLLECTION_NAME = "gallery_blob_cleanup_queue";
const SESSION_LINK_GUARD_COLLECTION_NAME = "gallery_session_link_guards";
const UPLOAD_LEASE_COLLECTION_NAME = "gallery_upload_leases";
const KST_OFFSET_MS = 9 * 60 * 60 * 1_000;
const BLOB_UPLOAD_INTENT_GRACE_MS = 15 * 60 * 1_000;
const UPLOAD_LEASE_MS = 5 * 60 * 1_000;
const DOCUMENT_CLEANUP_RETRY_MS = 6 * 60 * 60 * 1_000;

export type GallerySessionReportDocument = Pick<
  SessionReport,
  | "_id"
  | "sessionId"
  | "sessionTitle"
  | "reportNumber"
  | "summary"
  | "participants"
  | "createdAt"
>;

export interface GalleryFanartDocument {
  _id: string;
  title: string;
  description: string;
  artistName: string;
  altText: string;
  tags: string[];
  sessionId?: string;
  image: {
    pathname: string;
    sha256: string;
    width: number;
    height: number;
    bytes: number;
    contentType: "image/webp";
    thumbnail?: {
      pathname: string;
      width: number;
      height: number;
      bytes: number;
      contentType: "image/webp";
    };
  };
  requestFingerprint: string;
  authorId: string;
  authorName: string;
  authorRole: UserRole;
  status: GalleryFanartStatus;
  rightsConfirmedAt: Date;
  hiddenReason?: string;
  hiddenAt?: Date;
  hiddenById?: string;
  hiddenByName?: string;
  deletedAt?: Date;
  deletedById?: string;
  blobCleanupPending?: boolean;
  blobCleanupAttempts?: number;
  blobCleanupNextAttemptAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface GalleryUploadCounterDocument {
  _id: string;
  userId: string;
  kstDate: string;
  uploadedCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface GalleryBlobCleanupDocument {
  _id: string;
  pathname: string;
  reason: "UPLOAD_INTENT" | "CREATE_ROLLBACK";
  attempts: number;
  retryAfter: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface GallerySessionLinkGuardDocument {
  _id: string;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

interface GalleryUploadLeaseDocument {
  _id: string;
  userId: string;
  requestId: string;
  ownerToken: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateGalleryFanartResult {
  document: GalleryFanartDocument;
  created: boolean;
}

export class GalleryDailyUploadLimitError extends Error {}
export class GalleryFanartIdConflictError extends Error {}
export class GalleryLinkedSessionNotVisibleError extends Error {}
export class GallerySessionHasActiveFanartError extends Error {}
export class GalleryUploadBusyError extends Error {}

export async function listGallerySessionReports(
  viewerRole: UserRole,
): Promise<GallerySessionReportDocument[]> {
  const reports = await sessionReportsCol();
  return reports
    .find<GallerySessionReportDocument>(
      sessionReportVisibilityFilter(viewerRole),
      {
        projection: {
          _id: 1,
          sessionId: 1,
          sessionTitle: 1,
          reportNumber: 1,
          summary: 1,
          participants: 1,
          createdAt: 1,
        },
      },
    )
    .sort({ createdAt: -1, _id: -1 })
    .toArray();
}

async function fanartsCol(
  database?: Db,
): Promise<Collection<GalleryFanartDocument>> {
  const db = database ?? (await getDb());
  return db.collection<GalleryFanartDocument>(FANART_COLLECTION_NAME);
}

async function uploadCountersCol(
  database?: Db,
): Promise<Collection<GalleryUploadCounterDocument>> {
  const db = database ?? (await getDb());
  return db.collection<GalleryUploadCounterDocument>(
    UPLOAD_COUNTER_COLLECTION_NAME,
  );
}

async function blobCleanupCol(
  database?: Db,
): Promise<Collection<GalleryBlobCleanupDocument>> {
  const db = database ?? (await getDb());
  return db.collection<GalleryBlobCleanupDocument>(
    BLOB_CLEANUP_COLLECTION_NAME,
  );
}

async function sessionLinkGuardsCol(
  database?: Db,
): Promise<Collection<GallerySessionLinkGuardDocument>> {
  const db = database ?? (await getDb());
  return db.collection<GallerySessionLinkGuardDocument>(
    SESSION_LINK_GUARD_COLLECTION_NAME,
  );
}

async function uploadLeasesCol(
  database?: Db,
): Promise<Collection<GalleryUploadLeaseDocument>> {
  const db = database ?? (await getDb());
  return db.collection<GalleryUploadLeaseDocument>(UPLOAD_LEASE_COLLECTION_NAME);
}

function toKstDateString(value: Date): string {
  return new Date(value.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

function uploadCounterId(userId: string, kstDate: string): string {
  const digest = createHash("sha256")
    .update(JSON.stringify([userId, kstDate]))
    .digest("hex");
  return `gallery-upload:${digest}`;
}

async function prepareGalleryUploadCounter(input: {
  userId: string;
  now: Date;
}): Promise<{ _id: string; kstDate: string; uploadedCount: number }> {
  const kstDate = toKstDateString(input.now);
  const _id = uploadCounterId(input.userId, kstDate);
  const counters = await uploadCountersCol();

  try {
    await counters.updateOne(
      { _id, userId: input.userId, kstDate },
      {
        $setOnInsert: {
          uploadedCount: 0,
          createdAt: input.now,
          updatedAt: input.now,
        },
      },
      { upsert: true },
    );
  } catch (error) {
    if (!(error instanceof MongoServerError) || error.code !== 11000) {
      throw error;
    }
  }

  const counter = await counters.findOne({ _id });
  if (
    !counter ||
    counter.userId !== input.userId ||
    counter.kstDate !== kstDate ||
    !Number.isSafeInteger(counter.uploadedCount) ||
    counter.uploadedCount < 0
  ) {
    throw new Error("GALLERY_UPLOAD_COUNTER_INTEGRITY");
  }

  return { _id, kstDate, uploadedCount: counter.uploadedCount };
}

/**
 * Sharp/Blob 작업 전에 이미 소진된 한도를 빠르게 거절한다.
 * 최종 정합성은 create transaction의 조건부 증가가 계속 보장한다.
 */
export async function assertGalleryDailyUploadCapacity(input: {
  userId: string;
  now: Date;
}): Promise<void> {
  const counter = await prepareGalleryUploadCounter(input);
  if (counter.uploadedCount < GALLERY_DAILY_UPLOAD_LIMIT) return;
  throw new GalleryDailyUploadLimitError(
    `하루에 팬아트를 ${GALLERY_DAILY_UPLOAD_LIMIT}개까지 등록할 수 있습니다.`,
  );
}

function galleryUploadLeaseId(userId: string): string {
  return `gallery-lease:${createHash("sha256").update(userId).digest("hex")}`;
}

export async function acquireGalleryUploadLease(input: {
  userId: string;
  requestId: string;
  ownerToken: string;
  now: Date;
}): Promise<void> {
  const _id = galleryUploadLeaseId(input.userId);
  try {
    const lease = await (await uploadLeasesCol()).findOneAndUpdate(
      {
        _id,
        userId: input.userId,
        $or: [
          { expiresAt: { $lte: input.now } },
          { expiresAt: { $exists: false } },
        ],
      },
      {
        $set: {
          userId: input.userId,
          requestId: input.requestId,
          ownerToken: input.ownerToken,
          expiresAt: new Date(input.now.getTime() + UPLOAD_LEASE_MS),
          updatedAt: input.now,
        },
        $setOnInsert: { createdAt: input.now },
      },
      { upsert: true, returnDocument: "after" },
    );
    if (
      lease?.requestId === input.requestId &&
      lease.ownerToken === input.ownerToken
    ) {
      return;
    }
  } catch (error) {
    if (!(error instanceof MongoServerError) || error.code !== 11000) {
      throw error;
    }
  }

  throw new GalleryUploadBusyError(
    "이미 처리 중인 팬아트 업로드가 있습니다. 잠시 후 다시 시도해 주세요.",
  );
}

export async function releaseGalleryUploadLease(input: {
  userId: string;
  requestId: string;
  ownerToken: string;
}): Promise<void> {
  await (await uploadLeasesCol()).deleteOne({
    _id: galleryUploadLeaseId(input.userId),
    userId: input.userId,
    requestId: input.requestId,
    ownerToken: input.ownerToken,
  });
}

async function incrementGalleryUploadCounter(input: {
  counterId: string;
  userId: string;
  kstDate: string;
  now: Date;
  session: ClientSession;
}): Promise<void> {
  const counters = await uploadCountersCol();
  const result = await counters.updateOne(
    {
      _id: input.counterId,
      userId: input.userId,
      kstDate: input.kstDate,
      uploadedCount: { $gte: 0, $lt: GALLERY_DAILY_UPLOAD_LIMIT },
    },
    {
      $inc: { uploadedCount: 1 },
      $set: { updatedAt: input.now },
    },
    { session: input.session },
  );
  if (result.matchedCount === 1) return;

  const existing = await counters.findOne(
    { _id: input.counterId },
    { session: input.session },
  );
  if (
    !existing ||
    existing.userId !== input.userId ||
    existing.kstDate !== input.kstDate ||
    !Number.isSafeInteger(existing.uploadedCount) ||
    existing.uploadedCount < 0 ||
    existing.uploadedCount > GALLERY_DAILY_UPLOAD_LIMIT
  ) {
    throw new Error("GALLERY_UPLOAD_COUNTER_INTEGRITY");
  }
  throw new GalleryDailyUploadLimitError(
    `하루에 팬아트를 ${GALLERY_DAILY_UPLOAD_LIMIT}개까지 등록할 수 있습니다.`,
  );
}

export async function listGalleryFanartsForViewer(input: {
  viewerId: string;
  canModerate: boolean;
  canCleanupOrphans: boolean;
  visibleSessionIds: readonly string[];
}): Promise<GalleryFanartDocument[]> {
  const fanarts = await fanartsCol();
  const statusFilter: Filter<GalleryFanartDocument> = input.canModerate
    ? { status: { $in: ["PUBLISHED", "HIDDEN"] } }
    : {
        $or: [
          { status: "PUBLISHED" },
          { status: "HIDDEN", authorId: input.viewerId },
        ],
      };
  const sessionFilter: Filter<GalleryFanartDocument> = input.canCleanupOrphans
    ? {}
    : {
        $or: [
          { sessionId: { $exists: false } },
          { sessionId: { $in: [...input.visibleSessionIds] } },
          { authorId: input.viewerId },
        ],
      };

  return fanarts
    .find({ $and: [statusFilter, sessionFilter] })
    .sort({ createdAt: -1, _id: -1 })
    .toArray();
}

export async function findGalleryFanartById(
  id: string,
): Promise<GalleryFanartDocument | null> {
  return (await fanartsCol()).findOne({ _id: id });
}

export async function findVisibleGallerySessionReportBySessionId(
  sessionId: string,
  viewerRole: UserRole,
  options: { session?: ClientSession } = {},
): Promise<GallerySessionReportDocument | null> {
  return (await sessionReportsCol()).findOne<GallerySessionReportDocument>(
    {
      $and: [
        { sessionId },
        sessionReportVisibilityFilter(viewerRole),
      ],
    },
    {
      projection: {
        _id: 1,
        sessionId: 1,
        sessionTitle: 1,
        reportNumber: 1,
        summary: 1,
        participants: 1,
        createdAt: 1,
      },
      session: options.session,
    },
  );
}

export async function hasVisibleGallerySessionReportBySessionId(
  sessionId: string,
  viewerRole: UserRole,
  options: { session?: ClientSession } = {},
): Promise<boolean> {
  const report = await (await sessionReportsCol()).findOne(
    {
      $and: [{ sessionId }, sessionReportVisibilityFilter(viewerRole)],
    },
    { projection: { _id: 1 }, session: options.session },
  );
  return report !== null;
}

export async function lockGallerySessionLinkGuard(
  sessionId: string,
  session: ClientSession,
  now = new Date(),
): Promise<void> {
  await (await sessionLinkGuardsCol()).updateOne(
    { _id: sessionId },
    {
      $inc: { revision: 1 },
      $set: { updatedAt: now },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true, session },
  );
}

export async function hasActiveGalleryFanartForSession(
  sessionId: string,
  options: { session?: ClientSession } = {},
): Promise<boolean> {
  const fanart = await (await fanartsCol()).findOne(
    { sessionId, status: { $ne: "DELETED" } },
    { projection: { _id: 1 }, session: options.session },
  );
  return fanart !== null;
}

async function lockGallerySessionLinks(
  sessionIds: readonly (string | null | undefined)[],
  session: ClientSession,
): Promise<void> {
  const uniqueIds = [...new Set(sessionIds.filter((id): id is string => Boolean(id)))].sort();
  for (const sessionId of uniqueIds) {
    await lockGallerySessionLinkGuard(sessionId, session);
  }
}

export async function createGalleryFanartWithDailyLimit(
  document: GalleryFanartDocument,
): Promise<CreateGalleryFanartResult> {
  const prepared = await prepareGalleryUploadCounter({
    userId: document.authorId,
    now: document.createdAt,
  });
  const mongoSession = (await getClient()).startSession();
  let outcome: CreateGalleryFanartResult | null = null;

  try {
    await mongoSession.withTransaction(async () => {
      outcome = null;
      const fanarts = await fanartsCol();
      const existing = await fanarts.findOne(
        { _id: document._id },
        { session: mongoSession },
      );
      if (existing) {
        if (
          existing.authorId !== document.authorId ||
          existing.requestFingerprint !== document.requestFingerprint
        ) {
          throw new GalleryFanartIdConflictError(
            "다른 사용자가 사용한 업로드 요청 식별자입니다.",
          );
        }
        outcome = { document: existing, created: false };
        return;
      }

      if (document.sessionId) {
        await lockGallerySessionLinkGuard(
          document.sessionId,
          mongoSession,
          document.createdAt,
        );
        const visible = await hasVisibleGallerySessionReportBySessionId(
          document.sessionId,
          document.authorRole,
          { session: mongoSession },
        );
        if (!visible) {
          throw new GalleryLinkedSessionNotVisibleError(
            "연결할 수 있는 세션 보고서를 찾지 못했습니다.",
          );
        }
      }

      await incrementGalleryUploadCounter({
        counterId: prepared._id,
        userId: document.authorId,
        kstDate: prepared.kstDate,
        now: document.createdAt,
        session: mongoSession,
      });
      await fanarts.insertOne(document, { session: mongoSession });
      outcome = { document, created: true };
    });
  } finally {
    await mongoSession.endSession();
  }

  if (!outcome) {
    throw new Error("GALLERY_FANART_TRANSACTION_EMPTY");
  }
  return outcome;
}

export async function updateGalleryFanartMetadata(input: {
  id: string;
  expectedUpdatedAt: Date;
  metadata: GalleryFanartMetadataInput;
  previousSessionId?: string;
  viewerRole: UserRole;
  now: Date;
}): Promise<GalleryFanartDocument | null> {
  const fanarts = await fanartsCol();
  const set: Partial<GalleryFanartDocument> = {
    title: input.metadata.title,
    description: input.metadata.description,
    artistName: input.metadata.artistName,
    altText: input.metadata.altText,
    tags: input.metadata.tags,
    updatedAt: input.now,
  };
  if (input.metadata.sessionId) set.sessionId = input.metadata.sessionId;

  const update = input.metadata.sessionId
    ? { $set: set }
    : { $set: set, $unset: { sessionId: "" as const } };
  const mutate = (session?: ClientSession) =>
    fanarts.findOneAndUpdate(
      {
        _id: input.id,
        updatedAt: input.expectedUpdatedAt,
        status: { $ne: "DELETED" },
      },
      update,
      { returnDocument: "after", session },
    );

  if (!input.previousSessionId && !input.metadata.sessionId) {
    return mutate();
  }

  const mongoSession = (await getClient()).startSession();
  let updated: GalleryFanartDocument | null = null;
  try {
    await mongoSession.withTransaction(async () => {
      updated = null;
      await lockGallerySessionLinks(
        [input.previousSessionId, input.metadata.sessionId],
        mongoSession,
      );
      if (
        input.metadata.sessionId &&
        !(await hasVisibleGallerySessionReportBySessionId(
          input.metadata.sessionId,
          input.viewerRole,
          { session: mongoSession },
        ))
      ) {
        throw new GalleryLinkedSessionNotVisibleError(
          "연결할 수 있는 세션 보고서를 찾지 못했습니다.",
        );
      }
      updated = await mutate(mongoSession);
    });
    return updated;
  } finally {
    await mongoSession.endSession();
  }
}

export async function moderateGalleryFanart(input: {
  id: string;
  expectedUpdatedAt: Date;
  status: Exclude<GalleryFanartStatus, "DELETED">;
  reason: string;
  actorId: string;
  actorName: string;
  now: Date;
}): Promise<GalleryFanartDocument | null> {
  const fanarts = await fanartsCol();
  const update: UpdateFilter<GalleryFanartDocument> =
    input.status === "HIDDEN"
      ? {
          $set: {
            status: input.status,
            hiddenReason: input.reason,
            hiddenAt: input.now,
            hiddenById: input.actorId,
            hiddenByName: input.actorName,
            updatedAt: input.now,
          },
        }
      : {
          $set: { status: input.status, updatedAt: input.now },
          $unset: {
            hiddenReason: "" as const,
            hiddenAt: "" as const,
            hiddenById: "" as const,
            hiddenByName: "" as const,
          },
        };
  return fanarts.findOneAndUpdate(
    {
      _id: input.id,
      updatedAt: input.expectedUpdatedAt,
      status: { $ne: "DELETED" },
    },
    update,
    { returnDocument: "after" },
  );
}

export async function softDeleteGalleryFanart(input: {
  id: string;
  expectedUpdatedAt: Date;
  actorId: string;
  linkedSessionId?: string;
  now: Date;
}): Promise<GalleryFanartDocument | null> {
  const fanarts = await fanartsCol();
  const mutate = (session?: ClientSession) =>
    fanarts.findOneAndUpdate(
      {
        _id: input.id,
        updatedAt: input.expectedUpdatedAt,
        status: { $ne: "DELETED" },
      },
      {
        $set: {
          status: "DELETED",
          deletedAt: input.now,
          deletedById: input.actorId,
          blobCleanupPending: true,
          blobCleanupAttempts: 0,
          blobCleanupNextAttemptAt: input.now,
          updatedAt: input.now,
        },
      },
      { returnDocument: "after", session },
    );

  if (!input.linkedSessionId) return mutate();

  const mongoSession = (await getClient()).startSession();
  let deleted: GalleryFanartDocument | null = null;
  try {
    await mongoSession.withTransaction(async () => {
      deleted = null;
      await lockGallerySessionLinkGuard(input.linkedSessionId!, mongoSession);
      deleted = await mutate(mongoSession);
    });
    return deleted;
  } finally {
    await mongoSession.endSession();
  }
}

export async function markGalleryBlobCleanupComplete(id: string): Promise<void> {
  await (await fanartsCol()).updateOne(
    { _id: id, status: "DELETED" },
    {
      $set: { blobCleanupPending: false },
      $unset: {
        blobCleanupAttempts: "" as const,
        blobCleanupNextAttemptAt: "" as const,
      },
    },
  );
}

export async function listGalleryDocumentBlobCleanupPending(
  limit = 25,
  now = new Date(),
): Promise<GalleryFanartDocument[]> {
  return (await fanartsCol())
    .find({
      status: "DELETED",
      blobCleanupPending: true,
      $or: [
        { blobCleanupNextAttemptAt: { $lte: now } },
        { blobCleanupNextAttemptAt: { $exists: false } },
      ],
    })
    .sort({ blobCleanupNextAttemptAt: 1, deletedAt: 1, _id: 1 })
    .limit(limit)
    .toArray();
}

export async function recordGalleryDocumentBlobCleanupFailure(input: {
  id: string;
  now: Date;
}): Promise<void> {
  await (await fanartsCol()).updateOne(
    {
      _id: input.id,
      status: "DELETED",
      blobCleanupPending: true,
    },
    {
      $inc: { blobCleanupAttempts: 1 },
      $set: {
        blobCleanupNextAttemptAt: new Date(
          input.now.getTime() + DOCUMENT_CLEANUP_RETRY_MS,
        ),
      },
    },
  );
}

function galleryBlobCleanupId(pathname: string): string {
  return createHash("sha256").update(pathname).digest("hex");
}

export async function recordGalleryBlobUploadIntent(input: {
  pathname: string;
  now: Date;
}): Promise<void> {
  const _id = galleryBlobCleanupId(input.pathname);
  await (await blobCleanupCol()).updateOne(
    { _id },
    {
      $set: {
        pathname: input.pathname,
        reason: "UPLOAD_INTENT",
        retryAfter: new Date(
          input.now.getTime() + BLOB_UPLOAD_INTENT_GRACE_MS,
        ),
        updatedAt: input.now,
      },
      $setOnInsert: { attempts: 0, createdAt: input.now },
    },
    { upsert: true },
  );
}

export async function recordGalleryOrphanBlobCleanup(input: {
  pathname: string;
  now: Date;
}): Promise<void> {
  const _id = galleryBlobCleanupId(input.pathname);
  await (await blobCleanupCol()).updateOne(
    { _id },
    {
      $set: {
        pathname: input.pathname,
        reason: "CREATE_ROLLBACK",
        retryAfter: new Date(
          input.now.getTime() + DOCUMENT_CLEANUP_RETRY_MS,
        ),
        updatedAt: input.now,
      },
      $setOnInsert: { createdAt: input.now },
      $inc: { attempts: 1 },
    },
    { upsert: true },
  );
}

export async function listGalleryOrphanBlobCleanupPending(
  limit = 25,
): Promise<GalleryBlobCleanupDocument[]> {
  return (await blobCleanupCol())
    .find({
      $or: [
        { retryAfter: { $lte: new Date() } },
        { retryAfter: { $exists: false } },
      ],
    })
    .sort({ retryAfter: 1, updatedAt: 1, _id: 1 })
    .limit(limit)
    .toArray();
}

export async function markGalleryOrphanBlobCleanupComplete(
  id: string,
): Promise<void> {
  await (await blobCleanupCol()).deleteOne({ _id: id });
}

export async function markGalleryBlobUploadIntentComplete(
  pathname: string,
): Promise<void> {
  await markGalleryOrphanBlobCleanupComplete(galleryBlobCleanupId(pathname));
}

export async function isGalleryBlobReferenced(pathname: string): Promise<boolean> {
  const document = await (await fanartsCol()).findOne(
    {
      $or: [
        { "image.pathname": pathname },
        { "image.thumbnail.pathname": pathname },
      ],
    },
    { projection: { _id: 1 } },
  );
  return document !== null;
}
