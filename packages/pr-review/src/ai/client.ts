import { createOpencode } from "@opencode-ai/sdk"

export type AIClient = Awaited<ReturnType<typeof createOpencode>>

/**
 * Create opencode AI client
 */
export async function createAIClient(): Promise<AIClient> {
  return await createOpencode()
}

/**
 * Send a prompt and get response
 */
export async function prompt(
  client: AIClient,
  message: string,
  options?: {
    sessionId?: string
    model?: { providerID: string; modelID: string }
  },
): Promise<{ sessionId: string; response: string }> {
  // Create or reuse session
  const sessionId = options?.sessionId ?? (await client.client.session.create()).data?.id
  if (!sessionId) {
    throw new Error("Failed to create AI session")
  }

  // Send prompt
  const result = await client.client.session.prompt({
    path: { id: sessionId },
    body: {
      parts: [{ type: "text", text: message }],
      ...(options?.model && { model: options.model }),
    },
  })

  // Extract text response
  const parts = result.data?.parts
  if (!parts) {
    throw new Error("No response parts from AI")
  }

  const textPart = parts.find((p: any) => p.type === "text")
  if (!textPart || textPart.type !== "text") {
    throw new Error("No text response from AI")
  }

  return {
    sessionId,
    response: textPart.text,
  }
}

/**
 * Close the AI client
 */
export function closeAIClient(client: AIClient): void {
  client.server.close()
}
