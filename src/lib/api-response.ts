import { NextResponse } from "next/server";

export interface ApiSuccess<T> {
  code: "OK";
  data: T;
  message: string;
}

export interface ApiFailure {
  code: string;
  data: null;
  message: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export function apiSuccess<T>(data: T, message = "请求成功", status = 200) {
  return NextResponse.json<ApiSuccess<T>>(
    { code: "OK", data, message },
    { status },
  );
}

export function apiError(
  code: string,
  message: string,
  status: number,
  headers?: HeadersInit,
) {
  return NextResponse.json<ApiFailure>(
    { code, data: null, message },
    { status, headers },
  );
}
