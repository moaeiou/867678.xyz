import { navigate } from "astro:transitions/client";
import { getSavedPosts, toggleSave } from "../api";
import { avatarGradient, el, relativeTime } from "../dom";
import { postPath } from "../urls";

export function mountSavedSettings(root: HTMLElement): void {
  const savedList = root.querySelector<HTMLElement>("[data-role=saved-list]")!;
  const savedEmpty = root.querySelector<HTMLElement>(
    "[data-role=saved-empty]",
  )!;
  const postsById = new Map<
    string,
    Awaited<ReturnType<typeof getSavedPosts>>[number]
  >();

  const renderSavedList = () => {
    const posts = getSavedPosts();
    savedEmpty.hidden = posts.length > 0;
    savedList.replaceChildren(
      ...posts.map((post) => {
        const item = el("article", "fk-post fk-saved-item");
        item.dataset.postId = post.id;
        const avatar = el("div", "fk-avatar");
        avatar.setAttribute("style", avatarGradient(post.author.handle));
        avatar.textContent = [...post.author.name][0] ?? "?";
        const body = el("div", "fk-post-body");
        const head = el("header", "fk-post-head");
        const name = el("span", "fk-post-name");
        name.textContent = post.author.name;
        const meta = el("span", "fk-post-meta");
        meta.textContent = `@${post.author.handle} · ${relativeTime(post.createdAt)}`;
        head.append(name, meta);
        const text = el("p", "fk-post-text");
        text.textContent = post.text;
        const remove = el("button", "fk-saved-remove");
        remove.type = "button";
        remove.textContent = "取消收藏";
        remove.title = "取消收藏";
        body.append(head, text, remove);
        item.append(avatar, body);
        return item;
      }),
    );
    for (const post of posts) postsById.set(post.id, post);
  };

  savedList.addEventListener("click", async (event) => {
    const target = event.target as HTMLElement;
    const item = target.closest<HTMLElement>(".fk-saved-item");
    if (!item) return;
    const post = postsById.get(item.dataset.postId ?? "");
    if (!post) return;
    if (target.closest<HTMLButtonElement>(".fk-saved-remove")) {
      try {
        await toggleSave(post, false);
        renderSavedList();
      } catch {}
      return;
    }
    void navigate(postPath(post));
  });

  renderSavedList();
}
