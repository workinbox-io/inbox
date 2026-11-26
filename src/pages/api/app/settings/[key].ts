/** Data for one section of the settings dialog (lib/server/settings.ts). Signed-in people only, not API keys. */
import { handler, HttpError, json } from "@/lib/server/api";
import { SETTINGS_DATA, settingsData, type SettingsData } from "@/lib/server/settings";

export const GET = handler(async (ctx) => {
  const key = ctx.params.key as SettingsData;
  if (!SETTINGS_DATA.includes(key)) throw new HttpError(404, "Not found");
  const user = ctx.locals.user;
  if (!user || ctx.locals.apiKeyId) throw new HttpError(403, "Sign in to open settings");
  return json(
    await settingsData(key, {
      orgId: ctx.orgId,
      role: ctx.role,
      userId: user.id,
      userName: user.name,
      sessionId: ctx.locals.session?.id,
      user: { name: user.name, email: user.email, twoFactorEnabled: Boolean(user.twoFactorEnabled), locale: (user as { locale?: string | null }).locale ?? null },
      locale: ctx.locals.locale,
    }),
  );
});
