import { z } from "zod";

const server = z.object({
  host: z.string().min(1).max(253).regex(/^[a-zA-Z0-9.-]+$/),
  username: z.string().min(1).max(320).regex(/^[^\x00-\x1f\x7f]+$/),
  password: z.string().min(1).max(4096),
});
export const externalMailAccountSchema = z.object({
  address: z.email().max(320),
  imap: server.extend({ port: z.literal(993) }),
  smtp: server.extend({ port: z.union([z.literal(465), z.literal(587)]) }),
});
