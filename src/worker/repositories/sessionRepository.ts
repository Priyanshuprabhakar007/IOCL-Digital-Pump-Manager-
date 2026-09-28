import { AppDatabase } from '../../db';
import * as schema from '../../db/schema';
import { eq, and, isNull, gte } from 'drizzle-orm';
import { Session } from '../../shared/types';

export class SessionRepository {
  constructor(private db: AppDatabase) {}

  async createSession(data: {
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: string;
    createdAt: string;
    lastSeenAt: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<Session> {
    await this.db.insert(schema.sessions).values({
      id: data.id,
      userId: data.userId,
      tokenHash: data.tokenHash,
      expiresAt: data.expiresAt,
      createdAt: data.createdAt,
      lastSeenAt: data.lastSeenAt,
      ipAddress: data.ipAddress ?? null,
      userAgent: data.userAgent ?? null,
    });

    return {
      id: data.id,
      userId: data.userId,
      tokenHash: data.tokenHash,
      expiresAt: data.expiresAt,
      createdAt: data.createdAt,
      lastSeenAt: data.lastSeenAt,
      ipAddress: data.ipAddress ?? null,
      userAgent: data.userAgent ?? null,
      revokedAt: null,
    };
  }

  async findActiveSessionByTokenHash(tokenHash: string, nowIso: string): Promise<Session | null> {
    const result = await this.db
      .select()
      .from(schema.sessions)
      .where(
        and(
          eq(schema.sessions.tokenHash, tokenHash),
          isNull(schema.sessions.revokedAt),
          gte(schema.sessions.expiresAt, nowIso)
        )
      )
      .limit(1);

    if (result.length === 0) return null;

    const s = result[0];
    return {
      id: s.id,
      userId: s.userId,
      tokenHash: s.tokenHash,
      expiresAt: s.expiresAt,
      createdAt: s.createdAt,
      lastSeenAt: s.lastSeenAt,
      ipAddress: s.ipAddress,
      userAgent: s.userAgent,
      revokedAt: s.revokedAt,
    };
  }

  async updateLastSeen(sessionId: string, nowIso: string): Promise<void> {
    await this.db
      .update(schema.sessions)
      .set({ lastSeenAt: nowIso })
      .where(eq(schema.sessions.id, sessionId));
  }

  async revokeSession(tokenHash: string, nowIso: string): Promise<void> {
    await this.db
      .update(schema.sessions)
      .set({ revokedAt: nowIso })
      .where(eq(schema.sessions.tokenHash, tokenHash));
  }

  async revokeAllUserSessions(userId: string, nowIso: string): Promise<void> {
    await this.db
      .update(schema.sessions)
      .set({ revokedAt: nowIso })
      .where(and(eq(schema.sessions.userId, userId), isNull(schema.sessions.revokedAt)));
  }
}
