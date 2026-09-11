import type { Post } from "./types";

const pad = (value: number) => String(value).padStart(2, "0");

export function postSlug(post: Post): string {
  const date = new Date(post.createdAt);
  const timestamp = [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    "-",
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
  ].join("");
  const shortId = post.id.replace(/[^a-z0-9]/gi, "").toLowerCase() || "post";
  return `${timestamp}-${shortId}`;
}

export function postPath(post: Post): string {
  return `/fuckxter/${encodeURIComponent(post.author.handle)}/${postSlug(post)}`;
}

export function parsePostPath(
  pathname: string,
): { handle: string; slug: string } | null {
  const match = pathname.match(
    /^\/fuckxter\/([^/]+)\/(\d{8}-\d{6}-[a-z0-9]+)\/?$/i,
  );
  if (!match) return null;
  try {
    return {
      handle: decodeURIComponent(match[1]).toLowerCase(),
      slug: match[2].toLowerCase(),
    };
  } catch {
    return null;
  }
}
