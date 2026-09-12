import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { exercises, userProgress } from "@/db/schema";
import {
  buildCompletedExerciseIds,
  mergeExercisesWithProgress,
  type CompleteExercise,
  type ExerciseLanguage,
  type ProgressInput,
} from "@/types/exercise";

export interface ExercisesWithProgress {
  exercises: CompleteExercise[];
  completedExerciseIds: number[];
}

/** 读取某天某语言已生成的全部练习（按展示顺序）。 */
export async function fetchExercisesByDate(
  language: ExerciseLanguage,
  date: string,
) {
  return db
    .select()
    .from(exercises)
    .where(and(eq(exercises.date, date), eq(exercises.language, language)))
    .orderBy(asc(exercises.index), asc(exercises.id));
}

/** 读取当前用户在一批练习上的打卡/评分进度。 */
export async function loadUserProgress(
  userId: string,
  exerciseIds: number[],
): Promise<{
  completedExerciseIds: number[];
  progressByExerciseId: Map<number, ProgressInput>;
}> {
  if (exerciseIds.length === 0) {
    return { completedExerciseIds: [], progressByExerciseId: new Map() };
  }

  const records = await db
    .select({
      exerciseId: userProgress.exerciseId,
      status: userProgress.status,
      completedAt: userProgress.completedAt,
      audioUrl: userProgress.audioUrl,
      score: userProgress.score,
      pronunciationScore: userProgress.pronunciationScore,
      fluencyScore: userProgress.fluencyScore,
      completenessScore: userProgress.completenessScore,
      transcript: userProgress.transcript,
      feedback: userProgress.feedback,
      lastError: userProgress.lastError,
    })
    .from(userProgress)
    .where(
      and(
        eq(userProgress.userId, userId),
        inArray(userProgress.exerciseId, exerciseIds),
      ),
    );

  return {
    completedExerciseIds: buildCompletedExerciseIds(
      records.filter((record) => record.status === "completed"),
    ),
    progressByExerciseId: new Map(
      records.map((record) => [record.exerciseId, record]),
    ),
  };
}

/** 组合「当日练习 + 用户进度」，供今日挑战的生成/恢复接口共用。 */
export async function loadExercisesWithProgress(
  userId: string,
  language: ExerciseLanguage,
  count: number,
  date: string,
): Promise<ExercisesWithProgress> {
  const rows = (await fetchExercisesByDate(language, date)).slice(0, count);
  const { completedExerciseIds, progressByExerciseId } = await loadUserProgress(
    userId,
    rows.map((row) => row.id),
  );

  return {
    exercises: mergeExercisesWithProgress(rows, progressByExerciseId),
    completedExerciseIds,
  };
}
