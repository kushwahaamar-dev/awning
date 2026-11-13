import { fail } from "@/lib/api/respond";
import { transcribe, voiceEnabled } from "@/lib/voice";

export async function GET() {
  return Response.json({ enabled: voiceEnabled() });
}

/** Takes a recording as multipart form data (field "audio") and returns what was said. */
export async function POST(request: Request) {
  if (!voiceEnabled()) return Response.json({ error: "Voice is not configured. Set ELEVENLABS_API_KEY." }, { status: 503 });
  try {
    const audio = (await request.formData()).get("audio");
    if (!(audio instanceof Blob)) return Response.json({ error: "audio is required" }, { status: 400 });
    return Response.json({ text: await transcribe(audio) });
  } catch (error) {
    return fail(error);
  }
}
