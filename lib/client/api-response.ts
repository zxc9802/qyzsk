type ErrorPayload = {
  error?: unknown;
  message?: unknown;
  redirectUrl?: unknown;
};

export async function readJsonSafely<T = unknown>(response: Response): Promise<T | null> {
  try {
    return await response.json() as T;
  } catch {
    return null;
  }
}

export function extractApiErrorMessage(payload: unknown, fallbackMessage: string) {
  if (payload && typeof payload === "object") {
    const { error, message } = payload as ErrorPayload;
    if (typeof error === "string" && error.trim()) {
      return error;
    }
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return fallbackMessage;
}

export function redirectToMainAppIfNeeded(response: Response, payload: unknown) {
  if (response.status !== 401 || typeof window === "undefined") {
    return false;
  }

  if (payload && typeof payload === "object") {
    const redirectUrl = (payload as ErrorPayload).redirectUrl;
    if (typeof redirectUrl === "string" && redirectUrl.trim()) {
      window.location.href = redirectUrl;
      return true;
    }
  }

  return false;
}
