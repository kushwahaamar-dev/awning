"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import useSWR from "swr";

const fetchEnabled = async (url: string): Promise<boolean> => (await (await fetch(url)).json()).enabled === true;

// The last thing the microphone heard. Until it has heard something nothing is said aloud, so typing stays silent;
// after that replies are spoken for the rest of the visit, whichever screen they are on.
let lastHeard: string | null = null;

/** Whether this sentence is the one the visitor has just said aloud, however it got to where it is being read. */
export const wasSpoken = (sentence: string) => sentence === lastHeard;

const GO = ["yes", "yeah", "yep", "yup", "do it", "go ahead", "go for it", "ok", "okay", "sure", "confirm", "approve", "please do", "sounds good", "take it"];
// These two words also begin a bad day ("cover my bakery against rain"), so they only count in a very short answer.
const GO_IF_SHORT = ["cover", "buy"];
const STOP = ["no", "nope", "nah", "cancel", "not now", "not yet", "never mind", "nevermind", "dont", "do not", "stop", "wait", "forget it"];
const MOST_WORDS = 8;
const SHORT_WORDS = 4;

/**
 * What a few spoken words mean as an answer to a quote: go ahead, don't, or neither, in which case they are a
 * new bad day. A refusal anywhere in it wins, so nothing is ever bought on an answer that could be read both ways.
 */
export function answerTo(heard: string): "yes" | "no" | null {
  const said = ` ${heard.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim()} `;
  const words = said.trim().split(" ").length;
  // A bad day has a figure in it, or an "if", or is about "my" something, or runs on. An answer is a handful of words.
  if (/\d/.test(said) || said.includes(" if ") || said.includes(" my ") || words > MOST_WORDS) return null;
  const has = (phrases: string[]) => phrases.some((phrase) => said.includes(` ${phrase} `));
  if (has(STOP)) return "no";
  return has(GO) || (words <= SHORT_WORDS && has(GO_IF_SHORT)) ? "yes" : null;
}

/**
 * Voice: record, transcribe with ElevenLabs Scribe, and speak replies with ElevenLabs TTS.
 * Replies are only spoken after the person has used the microphone, so typing stays silent.
 */
export function useVoice(onHeard: (text: string) => void) {
  const { data: enabled = false } = useSWR("/api/voice/listen", fetchEnabled, { revalidateOnFocus: false });
  const [state, setState] = useState<"idle" | "recording" | "transcribing">("idle");
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const player = useRef<HTMLAudioElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // From the moment a recording starts until what was said has been handed on, so two never run at once.
  const working = useRef(false);
  // Counts recordings and things said, so that one which has been overtaken or called off can tell.
  const take = useRef(0);
  const line = useRef(0);
  // What is heard goes to whoever is listening now, not to whoever was when the recording began.
  const latest = useRef(onHeard);
  useEffect(() => {
    latest.current = onHeard;
  });

  /** @param forMs when given, the recording was not asked for by a press: it stops by itself, and if it can't start or hears nothing it says nothing about it */
  const begin = useCallback(async (forMs?: number) => {
    if (working.current) return;
    working.current = true;
    const mine = ++take.current;
    const quiet = forMs !== undefined;
    setError(null);
    player.current?.pause();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = async () => {
        clearTimeout(timer.current);
        stream.getTracks().forEach((track) => track.stop());
        if (mine !== take.current) return setState("idle");
        setState("transcribing");
        try {
          const form = new FormData();
          form.set("audio", new Blob(chunks, { type: rec.mimeType }), "speech");
          const res = await fetch("/api/voice/listen", { method: "POST", body: form });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          if (mine !== take.current) return;
          lastHeard = data.text ?? "";
          if (data.text) latest.current(data.text);
          else if (!quiet) setError("I didn’t catch that. Try again a little closer to the microphone.");
        } catch (e) {
          if (!quiet && mine === take.current) setError(e instanceof Error ? e.message : String(e));
        } finally {
          if (mine === take.current) working.current = false;
          setState("idle");
        }
      };
      rec.start();
      recorder.current = rec;
      setState("recording");
      if (quiet) timer.current = setTimeout(() => rec.state === "recording" && rec.stop(), forMs);
    } catch {
      working.current = false;
      if (!quiet) setError("Awning needs permission to use the microphone.");
    }
  }, []);

  /** Push to talk: records until `stop`. */
  const start = useCallback(() => begin(), [begin]);
  /** Listens unasked, for an answer to something just said aloud, and stops by itself after `ms`. */
  const listen = useCallback((ms: number) => begin(ms), [begin]);
  const stop = useCallback(() => {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);
  /** Stops listening and throws away whatever was being heard: what the visitor has just done by hand answers for them. */
  const cancel = useCallback(() => {
    take.current++;
    working.current = false;
    stop();
  }, [stop]);

  /** Says it aloud, if the visitor is using their voice. Resolves once it has been said to the end, and with false if it wasn't. */
  const say = useCallback(
    async (text: string): Promise<boolean> => {
      if (!enabled || lastHeard === null) return false;
      const mine = ++line.current;
      const sound = await fetch("/api/voice/speak", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) })
        .then((res) => (res.ok ? res.blob() : null))
        .catch(() => null);
      // By the time it is ready there may be something newer to say, or the visitor may be speaking. Either way it goes unsaid.
      if (!sound || mine !== line.current || working.current) return false;
      player.current?.pause();
      const audio = new Audio(URL.createObjectURL(sound));
      player.current = audio;
      return new Promise((resolve) => {
        audio.onended = () => resolve(true);
        // Cut off by something newer to say, or by the microphone. Reaching the end pauses it too, which is not that.
        audio.onpause = () => !audio.ended && resolve(false);
        audio.onerror = () => resolve(false);
        audio.play().catch(() => resolve(false));
      });
    },
    [enabled],
  );

  return { enabled, state, error, start, listen, stop, cancel, say };
}

export type Voice = ReturnType<typeof useVoice>;
