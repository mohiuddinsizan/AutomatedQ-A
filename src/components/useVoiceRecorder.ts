"use client";

import { useEffect, useRef, useState } from "react";

const AUDIO_TYPES = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"];

export type VoiceNote = { blob: Blob; url: string; seconds: number };

/** Records one voice note in the browser (up to maxSeconds), small enough for mobile data. */
export function useVoiceRecorder(maxSeconds = 120) {
  const [audio, setAudio] = useState<VoiceNote | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
    recorder.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);

  async function start() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Voice recording isn't supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = AUDIO_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 32000 } : undefined);
      const chunks: Blob[] = [];
      const started = Date.now();
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        setAudio({ blob, url: URL.createObjectURL(blob), seconds: Math.round((Date.now() - started) / 1000) });
        setRecording(false);
        if (timer.current) clearInterval(timer.current);
      };
      rec.start();
      recorder.current = rec;
      setRecording(true);
      setElapsed(0);
      timer.current = setInterval(() => {
        const s = Math.round((Date.now() - started) / 1000);
        setElapsed(s);
        if (s >= maxSeconds) rec.stop();
      }, 250);
    } catch {
      setError("Microphone permission was blocked. Allow it in the browser settings.");
    }
  }

  const stop = () => recorder.current?.stop();
  const clear = () => setAudio(null);

  /** Adds the recording to a form submission as "audio" + "audioDuration". */
  function appendTo(fd: FormData) {
    if (!audio) return;
    const ext = audio.blob.type.includes("mp4") ? "m4a" : audio.blob.type.includes("ogg") ? "ogg" : "webm";
    fd.append("audio", audio.blob, `voice.${ext}`);
    fd.append("audioDuration", String(audio.seconds));
  }

  return { audio, recording, elapsed, error, setError, start, stop, clear, appendTo, maxSeconds };
}

export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
