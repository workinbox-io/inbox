import { env } from "cloudflare:workers";
import { account, and, db, desc, eq, gte, session } from "@/db";
import { describeUserAgent } from "@/lib/user-agent";
import { loadMemberships, planAccountDeletion } from "./org";

export interface SessionRow {
  id: string;
  browser: string;
  os: string;
  mobile: boolean;
  ip: string | null;
  lastActive: string;
  createdAt: string;
  current: boolean;
}

/** Settings → Account: sign-in methods, live sessions and whether the account can be deleted. */
export async function loadAccount(userId: string, currentSessionId: string | undefined) {
  const [accounts, sessions, memberships] = await Promise.all([
    db.select({ id: account.id, providerId: account.providerId, password: account.password }).from(account).where(eq(account.userId, userId)),
    db
      .select()
      .from(session)
      .where(and(eq(session.userId, userId), gte(session.expiresAt, new Date())))
      .orderBy(desc(session.updatedAt)),
    loadMemberships(userId),
  ]);
  return {
    hasPassword: accounts.some((a) => a.providerId === "credential" && a.password),
    googleAccountId: accounts.find((a) => a.providerId === "google")?.id ?? null,
    googleEnabled: Boolean(env.GOOGLE_CLIENT_ID),
    sessions: sessions.map(
      (s): SessionRow => ({
        id: s.id,
        ...describeUserAgent(s.userAgent),
        ip: s.ipAddress || null,
        lastActive: s.updatedAt.toISOString(),
        createdAt: s.createdAt.toISOString(),
        current: s.id === currentSessionId,
      }),
    ),
    deletionBlockers: planAccountDeletion(memberships).blockers,
  };
}

export type AccountData = Awaited<ReturnType<typeof loadAccount>>;
