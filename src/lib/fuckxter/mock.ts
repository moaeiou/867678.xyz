import type { FeedTab, FeedUser, Post } from "./types";

/** Local fallback user for client-created posts until the backend is connected. */
export const CURRENT_USER: FeedUser = {
  id: "u-mo",
  name: "Mo",
  handle: "mo",
  verified: true,
};

export function timelineFor(_tab: FeedTab): Post[] {
  return [];
}
