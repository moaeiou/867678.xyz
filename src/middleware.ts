import { defineMiddleware } from "astro:middleware";

const RESERVED_FIRST_SEGMENTS = new Set([
  "settings",
  "user",
  "post",
  "api",
  "assets",
]);

const POST_PATH = /^\/fuckxter\/post\/([^/]+)\/[^/]+\/?$/i;
const LEGACY_POST_PATH = /^\/fuckxter\/([^/]+)\/[^/]+\/?$/i;
const USER_PATH = /^\/fuckxter\/user\/([^/]+)\/?$/i;

export const onRequest = defineMiddleware((context, next) => {
  const { pathname } = context.url;

  if (POST_PATH.test(pathname)) return next("/fuckxter/post/");

  if (USER_PATH.test(pathname)) return next("/fuckxter/user/");

  const legacy = pathname.match(LEGACY_POST_PATH);
  if (legacy) {
    const handle = decodeURIComponent(legacy[1]).toLowerCase();
    if (!RESERVED_FIRST_SEGMENTS.has(handle)) return next("/fuckxter/post/");
  }

  return next();
});
