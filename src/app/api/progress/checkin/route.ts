import { NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { userProgress } from "@/db/schema";

interface CheckinRequestBody {
  userId: string;
  exerciseId: number;
}

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function parseRequestBody(body: unknown): CheckinRequestBody {
  if (!body || typeof body !== "object") {
    throw new Error("请求体格式无效");
  }

  const { userId, exerciseId } = body as Partial<CheckinRequestBody>;

  if (!userId || typeof userId !== "string" || !isValidUuid(userId)) {
    throw new Error("userId 必须是有效的 UUID 字符串");
  }

  if (
    exerciseId === undefined ||
    typeof exerciseId !== "number" ||
    !Number.isInteger(exerciseId) ||
    exerciseId <= 0
  ) {
    throw new Error("exerciseId 必须是正整数");
  }

  return { userId, exerciseId };
}

export async function POST(request: NextRequest) {
  try {
    const body = parseRequestBody(await request.json());
    const completedAt = new Date();

    const [record] = await db
      .insert(userProgress)
      .values({
        userId: body.userId,
        exerciseId: body.exerciseId,
        status: "completed",
        audioUrl: null,
        completedAt,
      })
      .onConflictDoUpdate({
        target: [userProgress.userId, userProgress.exerciseId],
        set: {
          status: "completed",
          completedAt,
        },
      })
      .returning();

    return NextResponse.json({
      success: true,
      progress: record,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "打卡记录保存失败";

    const status =
      message.includes("请求体") ||
      message.includes("userId") ||
      message.includes("exerciseId")
        ? 400
        : 500;

    console.error("[POST /api/progress/checkin]", error);

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status },
    );
  }
}
