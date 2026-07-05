import type { OpenAIContentPart } from "@/lib/server/media-parts";

export type ProviderMessage = {
  role: "system" | "user" | "assistant";
  content: string | OpenAIContentPart[];
};

type ClaudeContentBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: {
        type: "base64";
        media_type: string;
        data: string;
      };
    };

type ClaudeRequestMessage = {
  role: "user" | "assistant";
  content: string | ClaudeContentBlock[];
};

export function buildClaudeMessagesPayload(options: {
  model: string;
  messages: ProviderMessage[];
  stream: boolean;
  maxTokens: number;
  temperature: number;
}) {
  const systemMessages: string[] = [];
  const messages: ClaudeRequestMessage[] = [];

  for (const message of options.messages) {
    if (message.role === "system") {
      const systemText = readTextContent(message.content);
      if (systemText) {
        systemMessages.push(systemText);
      }
      continue;
    }

    messages.push({
      role: message.role,
      content: toClaudeContent(message.content),
    });
  }

  return {
    model: options.model,
    stream: options.stream,
    max_tokens: options.maxTokens,
    temperature: options.temperature,
    ...(systemMessages.length > 0 ? { system: systemMessages.join("\n\n") } : {}),
    messages,
  };
}

export function extractClaudeStreamContent(data: string): string | null {
  try {
    const parsed = JSON.parse(data);
    const text = parsed?.type === "content_block_delta" ? parsed.delta?.text : null;
    return typeof text === "string" && text ? text : null;
  } catch {
    return null;
  }
}

export function readClaudeMessagesText(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const content = (payload as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((block) =>
      block && typeof block === "object" && "type" in block && block.type === "text" && "text" in block
        ? block.text
        : ""
    )
    .filter((text): text is string => typeof text === "string" && text.trim().length > 0)
    .join("\n\n");
}

function readTextContent(content: string | OpenAIContentPart[]): string {
  if (typeof content === "string") return content.trim();

  return content
    .map((part) => (part.type === "text" ? part.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

function toClaudeContent(content: string | OpenAIContentPart[]): string | ClaudeContentBlock[] {
  if (typeof content === "string") return content;

  return content.flatMap((part): ClaudeContentBlock[] => {
    if (part.type === "text") {
      return [{ type: "text", text: part.text }];
    }

    const image = parseDataUrlImage(part.image_url.url);
    return image
      ? [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: image.mimeType,
              data: image.data,
            },
          },
        ]
      : [];
  });
}

function parseDataUrlImage(url: string): { mimeType: string; data: string } | null {
  const match = url.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) return null;

  return {
    mimeType: match[1],
    data: match[2],
  };
}
