import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { time, user } from "./core";

/** Security state is server-managed, never accepted by Better Auth's update-user endpoint. */
export const mailAccountSecurity = sqliteTable("mail_account_security", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  mustChangePassword: integer("must_change_password", { mode: "boolean" }).notNull().default(false),
  recoveryEmail: text("recovery_email"),
  recoveryVerifiedAt: time("recovery_verified_at"),
  pendingRecoveryEmail: text("pending_recovery_email"),
  recoveryTokenHash: text("recovery_token_hash"),
  recoveryTokenExpiresAt: time("recovery_token_expires_at"),
});
