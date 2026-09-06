import "server-only";

import { S3Client } from "@aws-sdk/client-s3";

function requireEnvironmentVariable(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

let client: S3Client | null = null;

export function getR2Client(): S3Client {
  if (client) return client;
  client = new S3Client({
    region: "auto",
    endpoint: requireEnvironmentVariable("R2_ENDPOINT"),
    credentials: {
      accessKeyId: requireEnvironmentVariable("R2_ACCESS_KEY_ID"),
      secretAccessKey: requireEnvironmentVariable("R2_SECRET_ACCESS_KEY"),
    },
  });
  return client;
}

export function getR2BucketName(): string {
  return requireEnvironmentVariable("R2_BUCKET_NAME");
}
