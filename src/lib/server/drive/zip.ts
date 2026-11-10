/**
 * Downloading several items or a whole folder as one ZIP, streamed (lib/drive/zip.ts) straight from R2. Callers check
 * access to the top items; everything inside a folder comes with it (shares are inherited), minus what's in the trash.
 */
import { env } from "cloudflare:workers";
import { and, db, driveItems, eq, sql } from "@/db";
import { uniquePaths, ZIP_MAX_BYTES, ZIP_MAX_ENTRIES, zipStream, type ZipEntry } from "@/lib/drive/zip";
import { HttpError } from "@/lib/server/api";
import type { DriveItem } from "./access";
import { disposition } from "./serve";

async function entriesFor(tops: DriveItem[]) {
  const out: { path: string; item: DriveItem }[] = [];
  for (const top of tops) {
    if (top.kind === "file") {
      out.push({ path: top.name, item: top });
      continue;
    }
    const rows = await db
      .select()
      .from(driveItems)
      .where(and(eq(driveItems.orgId, top.orgId), sql`instr(${driveItems.path}, ${top.path}) = 1`))
      .limit(ZIP_MAX_ENTRIES + 1);
    if (rows.length > ZIP_MAX_ENTRIES) throw new HttpError(422, "Too many files for one ZIP");
    const trashed = rows.filter((r) => r.trashedAt).map((r) => r.path);
    const byId = new Map(rows.map((r) => [r.id, r]));
    const live = rows.filter((r) => !trashed.some((p) => r.path.startsWith(p)));
    for (const r of live.sort((a, b) => a.path.localeCompare(b.path))) {
      // Names from the top folder down to the item.
      const ids = r.path.split("/").filter(Boolean);
      const names = ids.slice(ids.indexOf(top.id)).map((id) => byId.get(id)?.name ?? "");
      out.push({ path: names.join("/") + (r.kind === "folder" ? "/" : ""), item: r });
    }
  }
  return out;
}

/** What a ZIP of `tops` holds, within the limits (throws 422 otherwise). The browser asks first (?check=1) to show it. */
export async function zipPlan(tops: DriveItem[]) {
  const list = await entriesFor(tops);
  const bytes = list.reduce((n, e) => n + e.item.size, 0);
  if (list.length > ZIP_MAX_ENTRIES) throw new HttpError(422, "Too many files for one ZIP");
  if (bytes > ZIP_MAX_BYTES) throw new HttpError(422, "ZIP downloads can be up to 4 GB; pick fewer files");
  return { list, files: list.filter((e) => e.item.kind === "file").length, bytes };
}

export async function zipResponse(tops: DriveItem[], filename: string) {
  const { list } = await zipPlan(tops);
  const paths = uniquePaths(list.map((e) => e.path));
  const entries: ZipEntry[] = list.map((e, i) => ({
    name: paths[i]!,
    date: e.item.updatedAt,
    open: e.item.r2Key ? async () => (await env.FILES.get(e.item.r2Key!))?.body ?? null : undefined,
  }));
  return new Response(zipStream(entries), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": disposition("attachment", filename.endsWith(".zip") ? filename : `${filename}.zip`),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
