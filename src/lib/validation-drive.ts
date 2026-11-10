/** Request bodies of the drive API (/api/app/drive, /api/v1/drive). */
import { z } from "zod";

const id = z.string().uuid();
const role = z.enum(["view", "edit"]);
const name = z.string().trim().min(1, "Enter a name").max(200);

export const driveListSchema = z.object({
  view: z.enum(["mine", "shared", "recent", "starred", "trash"]).default("mine"),
  folder: id.optional(),
  q: z.string().trim().max(200).optional(),
});

export const driveFolderSchema = z.object({ name, parentId: id.nullable().optional() });

export const driveUpdateSchema = z
  .object({ name: name.optional(), parentId: id.nullable().optional(), trashed: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to change" });

export const driveShareSchema = z.object({
  sharing: z.enum(["private", "people", "team"]),
  teamRole: role.default("view"),
  people: z.array(z.object({ userId: z.string().min(1).max(100), role })).max(200).default([]),
});

/** Files up to this size; larger ones need splitting. R2 multipart allows far more, this keeps one upload sane. */
export const DRIVE_MAX_FILE_BYTES = 5 * 1024 ** 3;

export const driveUploadSchema = z.object({
  name,
  parentId: id.nullable().optional(),
  size: z.number().int().min(1).max(DRIVE_MAX_FILE_BYTES, "Files can be up to 5 GB"),
  mediaType: z.string().max(200).default("application/octet-stream"),
});

export const driveCompleteSchema = z.object({
  parts: z.array(z.object({ partNumber: z.number().int().min(1).max(10_000), etag: z.string().max(200) })).min(1).max(10_000),
});

export const driveLinkSchema = z.object({
  password: z.string().min(4, "Use at least 4 characters").max(200).optional(),
  expiresAt: z.number().int().positive().nullable().optional(),
});

export const driveSaveAttachmentSchema = z.object({
  url: z.string().max(1000),
  filename: z.string().max(200),
  parentId: id.nullable().optional(),
});

export const driveBatchSchema = z.object({
  ids: z.array(id).min(1).max(500),
  action: z.enum(["move", "trash", "restore", "delete", "star", "unstar"]),
  parentId: id.nullable().optional(),
});

export const driveCopySchema = z.object({ parentId: id.nullable().optional() });

export const driveStarSchema = z.object({ starred: z.boolean() });

/** Items to put in one ZIP (a folder brings everything in it). */
export const driveZipSchema = z.object({ ids: z.string().max(4000).transform((s) => s.split(",").filter(Boolean)).pipe(z.array(id).min(1).max(100)) });

export type DriveList = z.input<typeof driveListSchema>;
export type DriveUpdate = z.output<typeof driveUpdateSchema>;
export type DriveShare = z.output<typeof driveShareSchema>;
export type DriveUpload = z.output<typeof driveUploadSchema>;
