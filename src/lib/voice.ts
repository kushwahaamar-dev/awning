import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

export const voiceEnabled = () => Boolean(process.env.ELEVENLABS_API_KEY);

const client = () => new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID ?? "JBFqnCBsd6RMkjVDRZzb";

/** Speech to text with Scribe. */
export async function transcribe(audio: Blob): Promise<string> {
  const result = await client().speechToText.convert({ file: audio, modelId: "scribe_v2", languageCode: "en", tagAudioEvents: false });
  return "text" in result ? result.text.trim() : "";
}

/** Text to speech, streamed so the first words play before the sentence has finished rendering. */
export async function speak(text: string): Promise<ReadableStream<Uint8Array>> {
  return client().textToSpeech.stream(VOICE_ID, { text, modelId: "eleven_flash_v2_5", outputFormat: "mp3_44100_128" });
}
