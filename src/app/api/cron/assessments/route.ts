import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-response";
import {
  claimAssessment,
  getStaleProcessingJobs,
  markAssessmentFailed,
  runAssessmentJob,
} from "@/lib/assessment-runner";

export const maxDuration = 300;

function isAuthorized(request: NextRequest): boolean {
  if (request.headers.get("x-vercel-cron") === "1") return true;
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("x-cron-secret") === secret);
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return apiError("UNAUTHORIZED", "无权访问", 401);
  }

  const jobs = await getStaleProcessingJobs(5);
  let processed = 0;

  for (const job of jobs) {
    if (!job.audioKey) continue;
    const claimed = await claimAssessment(job.userId, job.exerciseId, job.audioKey);
    if (claimed) {
      await runAssessmentJob(job.userId, job.exerciseId, job.audioKey);
    } else {
      await markAssessmentFailed(
        job.userId,
        job.exerciseId,
        job.audioKey,
        "评分超时，请重试",
      );
    }
    processed += 1;
  }

  return apiSuccess({ processed }, "清扫完成");
}
