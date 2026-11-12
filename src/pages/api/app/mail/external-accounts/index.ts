import { handler } from "@/lib/server/api";
import { externalAccountsRequest } from "@/lib/server/mail/bridge";

export const GET = handler(ctx => externalAccountsRequest(ctx, "GET"));
