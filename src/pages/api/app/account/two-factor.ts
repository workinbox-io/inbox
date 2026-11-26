import { z } from "zod";
import { env } from "cloudflare:workers";
import { isAPIError } from "better-auth/api";
import { handler, HttpError, json, parseBody } from "@/lib/server/api";
import { getAuth } from "@/lib/server/auth";
import { confirmSecondFactor, finishFactorReplacement, notifyFactorChange, startFactorReplacement } from "@/lib/server/two-factor";

const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), password: z.string().min(1).max(256) }),
  z.object({ action: z.literal("finish"), replacementId: z.string().uuid(), code: z.string().regex(/^\d{6}$/) }),
]);

export const POST = handler(async ({ request, locals }) => {
  if (!locals.user || !locals.session || locals.apiKeyId) throw new HttpError(401, "Sign in to manage two-factor authentication.");
  const user = locals.user;
  if (!user.twoFactorEnabled) throw new HttpError(400, "Enable two-factor authentication first.");
  const { success } = await env.AUTH_RATE_LIMIT.limit({ key: `2fa-manage:${user.id}` });
  if (!success) throw new HttpError(429, "Too many attempts. Wait a minute and try again.");
  const data = await parseBody(request, input);
  try {
    if (data.action === "start") {
      await getAuth().api.verifyPassword({ headers: request.headers, body: { password: data.password } });
      await confirmSecondFactor(user.id, request.headers);
      return json(await startFactorReplacement(user.id, user.email, locals.session.id));
    }
    await finishFactorReplacement(user.id, locals.session.id, data.replacementId, data.code);
    await notifyFactorChange(user, "replaced");
    return json({ status: true });
  } catch (error) {
    if (isAPIError(error)) return json({ error: error.message }, error.statusCode);
    throw error;
  }
});
