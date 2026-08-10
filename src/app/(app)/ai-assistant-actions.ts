"use server";

import { getSessionProfile } from "@/lib/auth";
import { getAiProvider } from "@/lib/ai";

export async function askCareerAssistant(
  message: string,
  history?: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<string> {
  const session = await getSessionProfile();
  if (!session) {
    throw new Error("Not signed in");
  }

  const ai = getAiProvider();
  return ai.careerAssist(message, history);
}
