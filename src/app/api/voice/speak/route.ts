import { z } from "zod";
import { fail, readBody } from "@/lib/api/respond";
import { speak, voiceEnabled } from "@/lib/voice";

export async function POST(request: Request) {
  if (!voiceEnabled()) return Response.json({ error: "Voice is not configured. Set ELEVENLABS_API_KEY." }, { status: 503 });
  const body = await readBody(request, z.object({ text: z.string().min(1).max(800) }));
  if (body instanceof Response) return body;
  try {
    return new Response(await speak(body.text), { headers: { "content-type": "audio/mpeg", "cache-control": "no-store" } });
  } catch (error) {
    return fail(error);
  }
}
