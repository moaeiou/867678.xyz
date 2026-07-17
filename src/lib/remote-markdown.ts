const requests = new Map<string, Promise<string>>();

async function download(url: string): Promise<string> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }

      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 500));
      }
    }
  }

  throw new Error(`Failed to download Markdown from ${url}`, {
    cause: lastError,
  });
}

export function fetchRemoteMarkdown(url: string): Promise<string> {
  const pending = requests.get(url) ?? download(url);
  requests.set(url, pending);
  return pending;
}
