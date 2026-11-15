import { db, lt, session, verification } from "@/db";

/** Daily: drops expired sessions and verification tokens Better Auth leaves behind. */
export async function cleanupExpiredAuth() {
  const now = new Date();
  await db.batch([db.delete(session).where(lt(session.expiresAt, now)), db.delete(verification).where(lt(verification.expiresAt, now))]);
}
