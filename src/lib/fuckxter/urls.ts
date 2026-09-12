import type { Post } from "./types";

/** 短 id：帖子创建时刻的 Unix 秒级时间戳（date +%s）截后四位 */
const shortId = (post: Post): string =>
  String(Math.floor(Date.parse(post.createdAt) / 1000)).slice(-4);

/** 帖子编号：取 id 中的数字段（p-001 → 1），没有数字段时退回创建时间的秒级时间戳 */
export function postNumber(post: Post): string {
  const digits = post.id.match(/(\d+)/)?.[1];
  if (digits) return String(Number(digits));
  return String(Math.floor(Date.parse(post.createdAt) / 1000));
}

export function postSlug(post: Post): string {
  return `${postNumber(post)}-${shortId(post)}`;
}

export function postPath(post: Post): string {
  return `/fuckxter/post/${encodeURIComponent(post.author.handle)}/${postSlug(post)}`;
}

export function userPath(handle: string): string {
  return `/fuckxter/user/${encodeURIComponent(handle.replace(/^@/, "").toLowerCase())}`;
}

export function parsePostPath(
  pathname: string,
): { handle: string; slug: string } | null {
  // 兼容旧格式 /fuckxter/<handle>/<时间戳>-<shortid>
  const match = pathname.match(
    /^\/fuckxter\/(?:post\/)?([^/]+)\/(\d+-[a-z0-9]+|\d{8}-\d{6}-[a-z0-9]+)\/?$/i,
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

export function parseUserPath(pathname: string): string | null {
  const match = pathname.match(/^\/fuckxter\/user\/([^/]+)\/?$/i);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]).replace(/^@/, "").toLowerCase();
  } catch {
    return null;
  }
}
