"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderStatus =
  | "idle"
  | "requesting-permission"
  | "recording"
  | "paused"
  | "recorded"
  | "error";

export interface AudioRecording {
  blob: Blob;
  url: string;
  durationMs: number;
  contentType: string;
}

const MAX_DURATION_MS = 180_000;
const MIME_TYPE_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/ogg;codecs=opus",
  "audio/mp4",
  "audio/webm",
];

function selectMimeType(): string | undefined {
  return MIME_TYPE_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type));
}

export function useAudioRecorder() {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [level, setLevel] = useState(0);
  const [recording, setRecording] = useState<AudioRecording | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef(0);
  const pausedAtRef = useRef<number | null>(null);
  const pausedDurationRef = useRef(0);
  const objectUrlRef = useRef<string | null>(null);

  const getDuration = useCallback(() => {
    const now = pausedAtRef.current ?? performance.now();
    return Math.min(
      MAX_DURATION_MS,
      Math.max(0, now - startedAtRef.current - pausedDurationRef.current),
    );
  }, []);

  const clearRuntimeResources = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    animationFrameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    setLevel(0);
  }, []);

  const reset = useCallback(() => {
    if (recorderRef.current?.state !== "inactive") recorderRef.current?.stop();
    clearRuntimeResources();
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
    setRecording(null);
    setElapsedMs(0);
    setError(null);
    setStatus("idle");
  }, [clearRuntimeResources]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }, []);

  const start = useCallback(async (): Promise<boolean> => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("当前浏览器不支持录音，请使用最新版 Chrome、Edge 或 Safari");
      setStatus("error");
      return false;
    }

    reset();
    setStatus("requesting-permission");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const mimeType = selectMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 96_000 })
        : new MediaRecorder(stream, { audioBitsPerSecond: 96_000 });

      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      startedAtRef.current = performance.now();
      pausedAtRef.current = null;
      pausedDurationRef.current = 0;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        clearRuntimeResources();
        setError("录音发生错误，请重新尝试");
        setStatus("error");
      };
      recorder.onstop = () => {
        const durationMs = Math.round(getDuration());
        const contentType = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: contentType });
        clearRuntimeResources();
        if (blob.size === 0 || durationMs < 1_000) {
          setError("录音时间太短，请至少朗读 1 秒");
          setStatus("error");
          return;
        }
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;
        setElapsedMs(durationMs);
        setRecording({ blob, url, durationMs, contentType });
        setStatus("recorded");
      };

      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      audioContext.createMediaStreamSource(stream).connect(analyser);
      audioContextRef.current = audioContext;
      const samples = new Uint8Array(analyser.frequencyBinCount);
      const updateLevel = () => {
        analyser.getByteFrequencyData(samples);
        const average = samples.reduce((sum, sample) => sum + sample, 0) / samples.length;
        setLevel(Math.min(1, average / 128));
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();

      timerRef.current = setInterval(() => {
        const duration = getDuration();
        setElapsedMs(Math.round(duration));
        if (duration >= MAX_DURATION_MS) stop();
      }, 200);

      recorder.start(250);
      setStatus("recording");
      return true;
    } catch (caught) {
      clearRuntimeResources();
      setError(
        caught instanceof DOMException && caught.name === "NotAllowedError"
          ? "麦克风权限被拒绝，请在浏览器设置中允许访问"
          : "无法启动录音，请检查麦克风设备",
      );
      setStatus("error");
      return false;
    }
  }, [clearRuntimeResources, getDuration, reset, stop]);

  const pause = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    recorder.pause();
    pausedAtRef.current = performance.now();
    setStatus("paused");
  }, []);

  const resume = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "paused") return;
    if (pausedAtRef.current !== null) {
      pausedDurationRef.current += performance.now() - pausedAtRef.current;
    }
    pausedAtRef.current = null;
    recorder.resume();
    setStatus("recording");
  }, []);

  useEffect(() => {
    return () => {
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        recorder.stop();
      }
      clearRuntimeResources();
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, [clearRuntimeResources]);

  return {
    status,
    elapsedMs,
    maxDurationMs: MAX_DURATION_MS,
    level,
    recording,
    error,
    start,
    pause,
    resume,
    stop,
    reset,
  };
}
