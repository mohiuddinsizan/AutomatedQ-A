import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

/**
 * Question attachments live on the server's disk, outside /public, and are only
 * served through /api/files/[id] after an access check. On a host with a
 * temporary filesystem, point UPLOAD_DIR at a persistent volume.
 */
const ROOT = path.resolve(/*turbopackIgnore: true*/ process.env.UPLOAD_DIR || "./uploads");

export const LIMITS = {
  image: { max: 3, bytes: 4 * 1024 * 1024, types: ["image/jpeg", "image/png", "image/webp"] },
  audio: { bytes: 5 * 1024 * 1024, types: ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/aac", "audio/wav", "audio/x-m4a"] },
};

const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
  "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/x-m4a": "m4a",
  "audio/mpeg": "mp3", "audio/aac": "aac", "audio/wav": "wav",
};

/** "audio/webm;codecs=opus" -> "audio/webm" */
export const baseMime = (mime: string) => mime.split(";")[0].trim().toLowerCase();

export async function saveUpload(data: Buffer, mime: string) {
  const now = new Date();
  const dir = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}`;
  const key = `${dir}/${crypto.randomUUID()}.${EXT[baseMime(mime)] ?? "bin"}`;
  await mkdir(/*turbopackIgnore: true*/ path.join(ROOT, dir), { recursive: true });
  await writeFile(/*turbopackIgnore: true*/ path.join(ROOT, key), data);
  return key;
}

function safePath(key: string) {
  const full = path.resolve(/*turbopackIgnore: true*/ ROOT, key);
  if (!full.startsWith(ROOT + path.sep)) throw new Error("Bad storage key");
  return full;
}

export const readUpload = (key: string) => readFile(/*turbopackIgnore: true*/ safePath(key));
export const deleteUpload = (key: string) => rm(/*turbopackIgnore: true*/ safePath(key), { force: true });
