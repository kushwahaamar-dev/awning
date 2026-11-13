"use client";

import { useCallback, useRef, useState } from "react";
import useSWR from "swr";

const fetchEnabled = async (url: string): Promise<boolean> => (await (await fetch(url)).json()).enabled === true;

/**
 * Push-to-talk voice: record, transcribe with ElevenLabs Scribe, and speak replies with ElevenLabs TTS.
 * Replies are only spoken after the person has used the microphone, so typing stays silent.
 */
export function useVoice(onHeard: (text: string) => void) {
  const { data: enabled = false } = useSWR("/api/voice/listen", fetchEnabled, { revalidateOnFocus: false });
  const [state, setState] = useState<"idle" | "recording" | "transcribing">("idle");
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const player = useRef<HTMLAudioElement | null>(null);
  const spoken = useRef(false);

  const start = useCallback(async () => {
    setError(null);
    player.current?.pause();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setState("transcribing");
        try {
          const form = new FormData();
          form.set("audio", new Blob(chunks, { type: rec.mimeType }), "speech");
          const res = await fetch("/api/voice/listen", { method: "POST", body: form });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          spoken.current = true;
          if (data.text) onHeard(data.text);
          else setError("I didn't catch that. Try again a little closer to the microphone.");
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        } finally {
          setState("idle");
        }
      };
      rec.start();
      recorder.current = rec;
      setState("recording");
    } catch {
      setError("Awning needs permission to use the microphone.");
    }
  }, [onHeard]);

  const stop = useCallback(() => recorder.current?.stop(), []);

  const say = useCallback(
    async (text: string) => {
      if (!enabled || !spoken.current) return;
      const res = await fetch("/api/voice/speak", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
      if (!res.ok) return;
      player.current?.pause();
      player.current = new Audio(URL.createObjectURL(await res.blob()));
      await player.current.play().catch(() => {});
    },
    [enabled],
  );

  return { enabled, state, error, start, stop, say };
}
