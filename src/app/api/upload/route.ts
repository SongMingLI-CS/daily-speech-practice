import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextRequest, NextResponse } from "next/server";

import { getR2BucketName, getR2Client, getR2PublicUrl } from "@/lib/r2";

const PRESIGNED_URL_EXPIRES_IN = 60;

interface UploadParams {
  userId: string;
  filename?: string;
  contentType?: string;
}

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function parseExtension(filename?: string, contentType?: string): string {
  if (filename) {
    const match = filename.match(/\.([a-zA-Z0-9]+)$/);
    if (match) return match[1].toLowerCase();
  }

  const mimeMap: Record<string, string> = {
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mp4": "m4a",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
  };

  if (contentType && mimeMap[contentType]) {
    return mimeMap[contentType];
  }

  return "webm";
}

function parseUploadParams(
  searchParams: URLSearchParams,
  body?: unknown,
): UploadParams {
  const fromQuery: UploadParams = {
    userId: searchParams.get("userId") ?? "",
    filename: searchParams.get("filename") ?? undefined,
    contentType: searchParams.get("contentType") ?? undefined,
  };

  if (body && typeof body === "object") {
    const { userId, filename, contentType } = body as Partial<UploadParams>;
    return {
      userId: typeof userId === "string" ? userId : fromQuery.userId,
      filename:
        typeof filename === "string" ? filename : fromQuery.filename,
      contentType:
        typeof contentType === "string" ? contentType : fromQuery.contentType,
    };
  }

  return fromQuery;
}

function validateParams(params: UploadParams): string | null {
  if (!params.userId || !isValidUuid(params.userId)) {
    return "userId 必须是有效的 UUID 字符串";
  }
  return null;
}

async function createPresignedUpload(params: UploadParams) {
  const validationError = validateParams(params);
  if (validationError) {
    return { error: validationError, status: 400 as const };
  }

  const extension = parseExtension(params.filename, params.contentType);
  const contentType = params.contentType ?? "audio/webm";
  const key = `audio/${params.userId}/${Date.now()}.${extension}`;

  const command = new PutObjectCommand({
    Bucket: getR2BucketName(),
    Key: key,
    ContentType: contentType,
  });

  const presignedUrl = await getSignedUrl(getR2Client(), command, {
    expiresIn: PRESIGNED_URL_EXPIRES_IN,
  });

  return {
    success: true as const,
    key,
    presignedUrl,
    publicUrl: getR2PublicUrl(key),
    expiresIn: PRESIGNED_URL_EXPIRES_IN,
    contentType,
  };
}

export async function GET(request: NextRequest) {
  try {
    const params = parseUploadParams(request.nextUrl.searchParams);
    const result = await createPresignedUpload(params);

    if ("error" in result) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.status },
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "生成上传授权失败";

    console.error("[GET /api/upload]", error);

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => undefined);
    const params = parseUploadParams(request.nextUrl.searchParams, body);
    const result = await createPresignedUpload(params);

    if ("error" in result) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.status },
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "生成上传授权失败";

    console.error("[POST /api/upload]", error);

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
