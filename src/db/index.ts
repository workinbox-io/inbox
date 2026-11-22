import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export type Db = ReturnType<typeof createDb>;

const createDb = (d1: D1Database) => drizzle(d1, { schema });

let instance: Db | undefined;

/**
 * The D1 database. Created on first use, so prerendering marketing pages doesn't touch it.
 * D1 has no interactive transactions: use `db.batch([...])` for writes that belong together.
 */
export const db = new Proxy({} as Db, {
  get(_, prop) {
    instance ??= createDb(env.DB);
    const value = Reflect.get(instance, prop, instance);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

export * from "./schema";
// Re-export query operators so the app shares this drizzle-orm instance.
export { and, asc, count, desc, eq, gt, gte, inArray, isNotNull, isNull, like, lt, lte, ne, or, sql } from "drizzle-orm";
export type { SQL } from "drizzle-orm";
