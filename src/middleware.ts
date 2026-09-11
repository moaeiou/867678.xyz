import { defineMiddleware } from "astro:middleware";

const RESERVED_FIRST_SEGMENTS = new Set([
  "settings",
  "user",
  "post",
  "api",
  "assets",
]);

const POST_PATH = /^\/fuckxter\/([^/]+)\/(\d{8}-\d{6}-[a-z0-9]+)\/?$/i;

export const onRequest = defineMiddleware((context, next) => {
  const match = context.url.pathname.match(POST_PATH);
  if (!match) return next();

  const handle = decodeURIComponent(match[1]).toLowerCase();
  if (RESERVED_FIRST_SEGMENTS.has(handle)) return next();

  return next("/fuckxter/post/");
});
