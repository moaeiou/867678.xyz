import { CURRENT_USER, timelineFor } from "./mock";
import { postSlug } from "./urls";
import type {
  FeedPage,
  FeedTab,
  LikeResult,
  Post,
  RepostResult,
  SearchResult,
} from "./types";

const PAGE_SIZE = 5;
const NETWORK_DELAY_MS = 350;

function delay<T>(value: T, ms = NETWORK_DELAY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

const interactions = new Map<string, { liked?: boolean; reposted?: boolean }>();

const createdPosts: Post[] = [];

function withInteractions(post: Post): Post {
  const it = interactions.get(post.id);
  if (!it) return post;
  return {
    ...post,
    liked: it.liked,
    reposted: it.reposted,
    stats: {
      ...post.stats,
      likes: post.stats.likes + (it.liked ? 1 : 0),
      reposts: post.stats.reposts + (it.reposted ? 1 : 0),
    },
  };
}

function poolFor(tab: FeedTab): Post[] {
  const pool = timelineFor(tab).map(withInteractions);
  return [...createdPosts.map(withInteractions), ...pool];
}

export async function getTimeline(
  tab: FeedTab,
  cursor: string | null,
): Promise<FeedPage> {
  const start = cursor ? Number(cursor) : 0;
  const pool = poolFor(tab);
  const posts = pool.slice(start, start + PAGE_SIZE);
  const nextCursor =
    start + PAGE_SIZE < pool.length ? String(start + PAGE_SIZE) : null;
  return delay({ tab, posts, nextCursor });
}

export async function createPost(text: string): Promise<Post> {
  const post: Post = {
    id: `self-${Date.now()}`,
    author: CURRENT_USER,
    text,
    createdAt: new Date().toISOString(),
    stats: { replies: 0, reposts: 0, likes: 0 },
  };
  createdPosts.push(post);
  return delay(post);
}

export async function toggleLike(
  id: string,
  liked: boolean,
): Promise<LikeResult> {
  interactions.set(id, { ...interactions.get(id), liked });
  const post = poolFor("foryou").find((p) => p.id === id);
  return delay({ id, liked, likes: post?.stats.likes ?? 0 });
}

export async function toggleRepost(
  id: string,
  reposted: boolean,
): Promise<RepostResult> {
  interactions.set(id, { ...interactions.get(id), reposted });
  const post = poolFor("foryou").find((p) => p.id === id);
  return delay({ id, reposted, reposts: post?.stats.reposts ?? 0 });
}

const SAVED_KEY = "fk-saved-posts";

function readSaved(): Post[] {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    return raw ? (JSON.parse(raw) as Post[]) : [];
  } catch {
    return [];
  }
}

function writeSaved(posts: Post[]): void {
  localStorage.setItem(SAVED_KEY, JSON.stringify(posts));
}

export function getSavedPosts(): Post[] {
  return readSaved().map(withInteractions);
}

export function isSaved(id: string): boolean {
  return readSaved().some((p) => p.id === id);
}

export async function toggleSave(post: Post, saved: boolean): Promise<Post[]> {
  const list = readSaved();
  const next = saved
    ? [withInteractions(post), ...list.filter((p) => p.id !== post.id)]
    : list.filter((p) => p.id !== post.id);
  writeSaved(next);
  return delay(next.map(withInteractions));
}

export async function getPostById(id: string): Promise<Post | null> {
  const post =
    poolFor("foryou").find((p) => p.id === id) ??
    readSaved().find((p) => p.id === id) ??
    null;
  return delay(post, 120);
}

export async function getPostByPath(
  handle: string,
  slug: string,
): Promise<Post | null> {
  const targetHandle = handle.toLowerCase();
  const post =
    poolFor("foryou").find(
      (item) =>
        item.author.handle.toLowerCase() === targetHandle &&
        postSlug(item) === slug.toLowerCase(),
    ) ??
    readSaved().find(
      (item) =>
        item.author.handle.toLowerCase() === targetHandle &&
        postSlug(item) === slug.toLowerCase(),
    ) ??
    null;
  return delay(post, 120);
}

export async function getPostsByUser(handle: string): Promise<Post[]> {
  const target = handle.toLowerCase();
  const seen = new Set<string>();
  const posts: Post[] = [];
  for (const post of [...poolFor("foryou"), ...poolFor("following")]) {
    if (post.author.handle.toLowerCase() !== target) continue;
    if (seen.has(post.id)) continue;
    seen.add(post.id);
    posts.push(post);
  }
  posts.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return delay(posts, 120);
}

export async function searchPosts(query: string): Promise<SearchResult> {
  const q = query.toLowerCase();
  const posts = poolFor("foryou").filter(
    (p) =>
      p.text.toLowerCase().includes(q) ||
      p.author.name.toLowerCase().includes(q) ||
      p.author.handle.toLowerCase().includes(q),
  );
  return delay({ query, posts });
}
