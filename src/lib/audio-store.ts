import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

import { getR2BucketName, getR2Client } from "@/lib/r2";

export interface StoredAudio {
  bytes: Uint8Array;
  size: number;
  contentType: string;
}

const LOCAL_ROOT = path.join(process.cwd(), "data", "audio");

export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ENDPOINT &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET_NAME,
  );
}

function sanitizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9/._-]/g, "");
}

function localPathForKey(key: string): string {
  return path.join(LOCAL_ROOT, ...sanitizeKey(key).split("/"));
}

async function ensureLocalRoot(): Promise<void> {
  await fs.mkdir(LOCAL_ROOT, { recursive: true });
}

async function writeMetaFile(filePath: string, contentType: string): Promise<void> {
  await fs.writeFile(
    `${filePath}.meta.json`,
    JSON.stringify({ contentType, storedAt: new Date().toISOString() }),
    "utf8",
  );
}

async function readMetaFile(filePath: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(`${filePath}.meta.json`, "utf8");
    const meta = JSON.parse(raw) as { contentType?: unknown };
    return typeof meta.contentType === "string" ? meta.contentType : null;
  } catch {
    return null;
  }
}

export async function saveAudioObject(
  key: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  if (isR2Configured()) {
    await getR2Client().send(
      new PutObjectCommand({
        Bucket: getR2BucketName(),
        Key: key,
        Body: Buffer.from(bytes),
        ContentType: contentType,
      }),
    );
    return;
  }

  await ensureLocalRoot();
  const filePath = localPathForKey(key);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, Buffer.from(bytes));
  await writeMetaFile(filePath, contentType);
}

export async function statAudioObject(key: string): Promise<{
  size: number;
  contentType: string;
}> {
  if (isR2Configured()) {
    const head = await getR2Client().send(
      new HeadObjectCommand({ Bucket: getR2BucketName(), Key: key }),
    );
    return {
      size: head.ContentLength ?? 0,
      contentType: head.ContentType ?? "audio/webm",
    };
  }

  const filePath = localPathForKey(key);
  const stat = await fs.stat(filePath);
  const contentType = (await readMetaFile(filePath)) ?? "audio/webm";
  return { size: stat.size, contentType };
}

export async function loadAudioObject(key: string): Promise<StoredAudio> {
  if (isR2Configured()) {
    const object = await getR2Client().send(
      new GetObjectCommand({ Bucket: getR2BucketName(), Key: key }),
    );
    if (!object.Body) throw new Error("AUDIO_NOT_FOUND");
    const bytes = await object.Body.transformToByteArray();
    return {
      bytes,
      size: bytes.byteLength,
      contentType: object.ContentType ?? "audio/webm",
    };
  }

  const filePath = localPathForKey(key);
  const [buffer, contentType] = await Promise.all([
    fs.readFile(filePath),
    readMetaFile(filePath),
  ]);
  return {
    bytes: new Uint8Array(buffer),
    size: buffer.byteLength,
    contentType: contentType ?? "audio/webm",
  };
}

export async function deleteAudioObject(key: string): Promise<void> {
  if (isR2Configured()) {
    await getR2Client().send(
      new DeleteObjectCommand({ Bucket: getR2BucketName(), Key: key }),
    );
    return;
  }

  const filePath = localPathForKey(key);
  await fs.rm(filePath, { force: true });
  await fs.rm(`${filePath}.meta.json`, { force: true });
}
