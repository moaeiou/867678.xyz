/**
 * FuckXter 前端控制器：负责渲染信息流与交互，所有数据经由 ./api 读写。
 */
import {
  createPost,
  getTimeline,
  searchPosts,
  toggleLike,
  toggleRepost,
} from "./api";
import {
  autoSignUp,
  beginTwoFactor,
  changeEmail,
  changePassword,
  confirmTwoFactor,
  generateRecoveryCodes,
  getAccount,
  getS3Config,
  saveS3Config,
  signIn,
  signOut,
  signUp,
  testS3Connection,
  toFeedUser,
  updateProfile,
  type Account,
  type S3Config,
} from "./auth";
import type { FeedTab, Post, SearchResult } from "./types";

const MAX_CHARS = 500;

/** 与 style.css 的断点保持一致：大屏 3~5 列，中屏 2 列，小屏 1 列 */
const COLUMN_QUERIES: [string, number][] = [
  ["(min-width: 1920px)", 5],
  ["(min-width: 1440px)", 4],
  ["(min-width: 1024px)", 3],
  ["(min-width: 700px)", 2],
];

const columnCount = (): number => {
  for (const [query, count] of COLUMN_QUERIES) {
    if (matchMedia(query).matches) return count;
  }
  return 1;
};

const ICONS = {
  reply:
    '<svg class="fk-action-icon" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>',
  repost:
    '<svg class="fk-action-icon" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 1l4 4-4 4"></path><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><path d="M7 23l-4-4 4-4"></path><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>',
  heart:
    '<svg class="fk-action-icon" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>',
  share:
    '<svg class="fk-action-icon" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><path d="M16 6l-4-4-4 4"></path><path d="M12 2v13"></path></svg>',
  verified:
    '<svg class="fk-verified" viewBox="0 0 24 24" aria-label="认证账号" role="img"><path fill="currentColor" d="M12 1.5l2.6 2 3.2-.4 1.2 3 3 1.2-.4 3.2 2 2.5-2 2.5.4 3.2-3 1.2-1.2 3-3.2-.4-2.6 2-2.6-2-3.2.4-1.2-3-3-1.2.4-3.2-2-2.5 2-2.5-.4-3.2 3-1.2 1.2-3 3.2.4z"></path><path class="fk-verified-check" d="M10.7 15.9l-3-3 1.3-1.3 1.7 1.7 4.3-4.3 1.3 1.3z"></path></svg>',
};

const AVATAR_GRADIENTS: [string, string][] = [
  ["#f97316", "#ef4444"],
  ["#8b5cf6", "#6366f1"],
  ["#06b6d4", "#3b82f6"],
  ["#10b981", "#14b8a6"],
  ["#f43f5e", "#ec4899"],
  ["#f59e0b", "#d97706"],
];

function avatarGradient(handle: string): string {
  const hash = [...handle].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const [from, to] = AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
  return `background-image: linear-gradient(135deg, ${from}, ${to})`;
}

function relativeTime(iso: string): string {
  const diffSeconds = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (diffSeconds < 60) return "刚刚";
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}分钟前`;
  if (diffSeconds < 86_400) return `${Math.floor(diffSeconds / 3600)}小时前`;
  if (diffSeconds < 86_400 * 7)
    return `${Math.floor(diffSeconds / 86_400)}天前`;
  return new Date(iso).toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
  });
}

function fmtCount(n: number): string {
  if (n < 10_000) return String(n);
  const wan = n / 10_000;
  return `${wan >= 10 ? Math.round(wan) : Math.round(wan * 10) / 10}万`;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function actionButton(
  action: string,
  icon: string,
  label: string,
  count: number,
): HTMLButtonElement {
  const btn = el("button", "fk-action");
  btn.type = "button";
  btn.dataset.action = action;
  btn.dataset.count = String(count);
  btn.setAttribute("aria-label", label);
  btn.title = label;
  btn.innerHTML = `${icon}<span class="fk-action-count"></span>`;
  btn.querySelector(".fk-action-count")!.textContent =
    count > 0 ? fmtCount(count) : "";
  return btn;
}

function renderPost(post: Post): HTMLElement {
  const article = el("article", "fk-post");
  article.dataset.postId = post.id;
  article.dataset.handle = post.author.handle;

  const avatar = el("div", "fk-avatar");
  avatar.setAttribute("style", avatarGradient(post.author.handle));
  avatar.textContent = [...post.author.name][0] ?? "?";
  avatar.title = `@${post.author.handle}`;

  const body = el("div", "fk-post-body");

  const head = el("header", "fk-post-head");
  const name = el("span", "fk-post-name");
  name.textContent = post.author.name;
  head.append(name);
  if (post.author.verified) {
    head.insertAdjacentHTML("beforeend", ICONS.verified);
  }
  const meta = el("span", "fk-post-meta");
  meta.textContent = `@${post.author.handle} · ${relativeTime(post.createdAt)}`;
  head.append(meta);

  const text = el("p", "fk-post-text");
  text.textContent = post.text;

  body.append(head, text);

  if (post.media) {
    const media = el("div", "fk-media");
    media.setAttribute(
      "style",
      `background-image: linear-gradient(135deg, ${post.media.gradient[0]}, ${post.media.gradient[1]})`,
    );
    media.setAttribute("role", "img");
    media.setAttribute("aria-label", post.media.alt);
    media.textContent = post.media.emoji;
    body.append(media);
  }

  const actions = el("footer", "fk-actions");
  actions.append(
    actionButton("reply", ICONS.reply, "回复", post.stats.replies),
    actionButton("repost", ICONS.repost, "转发", post.stats.reposts),
    actionButton("like", ICONS.heart, "喜欢", post.stats.likes),
    actionButton("share", ICONS.share, "分享", 0),
  );
  if (post.reposted) actions.children[1].classList.add("is-reposted");
  if (post.liked) actions.children[2].classList.add("is-liked");

  body.append(actions);
  article.append(avatar, body);
  return article;
}

function statusRow(message: string): HTMLElement {
  const row = el("div", "fk-status");
  row.textContent = message;
  return row;
}

function searchHead(result: SearchResult, exit: () => void): HTMLElement {
  const head = el("div", "fk-search-head");
  const label = el("span");
  const strong = el("strong");
  strong.textContent = `“${result.query}”`;
  label.append(
    document.createTextNode(
      `搜索 ${strong.textContent} · ${result.posts.length} 条结果`,
    ),
  );
  const exitBtn = el("button", "fk-search-exit");
  exitBtn.type = "button";
  exitBtn.textContent = "返回推荐流";
  exitBtn.addEventListener("click", exit);
  head.append(label, exitBtn);
  return head;
}

interface FeedState {
  tab: FeedTab;
  cursor: string | null;
  done: boolean;
  loading: boolean;
  seq: number;
  search: string | null;
}

function mountFuckxter(container: HTMLElement): void {
  if (container.dataset.fkMounted) return;
  container.dataset.fkMounted = "true";

  const scroller = container.querySelector<HTMLElement>(".fk-main")!;
  const feed = container.querySelector<HTMLElement>(".fk-feed")!;
  const sentinel = container.querySelector<HTMLElement>(".fk-sentinel")!;
  const spinner = sentinel.querySelector<HTMLElement>(".fk-spinner")!;
  const tabs = [...container.querySelectorAll<HTMLButtonElement>(".fk-tab")];
  const composer = container.querySelector<HTMLElement>(".fk-composer")!;
  const composerInput =
    container.querySelector<HTMLTextAreaElement>(".fk-composer-input")!;
  const composerBtn =
    container.querySelector<HTMLButtonElement>(".fk-post-btn")!;
  const charCount = container.querySelector<HTMLElement>(".fk-char-count")!;
  const searchInput =
    container.querySelector<HTMLInputElement>(".fk-search-input")!;

  // 发帖框头像跟随登录态：登录 / 登出后由 renderAccountUI 刷新
  const composerAvatar = container.querySelector<HTMLElement>(
    ".fk-composer .fk-avatar",
  )!;
  const syncComposerUser = () => {
    const me = toFeedUser(getAccount());
    composerAvatar.setAttribute("style", avatarGradient(me.handle));
    composerAvatar.textContent = [...me.name][0] ?? "?";
    composerAvatar.title = `@${me.handle}`;
  };
  syncComposerUser();

  const state: FeedState = {
    tab: "foryou",
    cursor: null,
    done: false,
    loading: false,
    seq: 0,
    search: null,
  };

  // ---------- 多列瀑布流布局 ----------
  // 帖子按「当前最矮列」分配，实现瀑布流；断点变化时整体重新分配。
  let columnsRoot: HTMLElement | null = null;
  let columns: HTMLElement[] = [];
  let activeColumnCount = 0;
  const orderedPosts: HTMLElement[] = [];

  const shortestColumn = (): HTMLElement => {
    let target = columns[0];
    for (const col of columns) {
      if (col.offsetHeight < target.offsetHeight) target = col;
    }
    return target;
  };

  const buildColumns = (count: number): HTMLElement => {
    const root = el("div", "fk-feed-columns");
    if (count > 1) root.classList.add("is-masonry");
    columns = Array.from({ length: count }, () => {
      const col = el("div", "fk-feed-col");
      root.append(col);
      return col;
    });
    activeColumnCount = count;
    return root;
  };

  const ensureLayout = (): void => {
    const count = columnCount();
    if (columnsRoot && count === activeColumnCount) return;
    const root = buildColumns(count);
    if (columnsRoot) columnsRoot.replaceWith(root);
    else feed.append(root);
    columnsRoot = root;
    for (const post of orderedPosts) shortestColumn().append(post);
  };

  const onMediaChange = () => ensureLayout();
  for (const [query] of COLUMN_QUERIES) {
    matchMedia(query).addEventListener("change", onMediaChange);
  }

  const resetFeed = (head?: HTMLElement): void => {
    orderedPosts.length = 0;
    feed.replaceChildren();
    if (head) feed.append(head);
    columnsRoot = null;
    activeColumnCount = 0;
    ensureLayout();
  };

  const addPost = (post: Post): HTMLElement => {
    ensureLayout();
    const node = renderPost(post);
    orderedPosts.push(node);
    shortestColumn().append(node);
    return node;
  };

  const setSentinelBusy = (busy: boolean) => {
    sentinel.classList.toggle("is-done", state.done && !busy);
    spinner.style.visibility = busy ? "visible" : "hidden";
  };

  // 哨兵仍处在触发区（rootMargin 与 IntersectionObserver 一致）就继续补页，
  // 否则首屏内容不满一屏时不会再收到交叉事件，信息流会停在第一页。
  const sentinelReached = (): boolean => {
    const rect = sentinel.getBoundingClientRect();
    const view = scroller.getBoundingClientRect();
    return rect.top - view.bottom < 360;
  };

  const renderError = (retry: () => void) => {
    feed.querySelectorAll(".fk-status").forEach((n) => n.remove());
    const row = el("div", "fk-status");
    row.append(
      document.createTextNode("加载失败了。"),
      Object.assign(el("button", "fk-retry-btn"), {
        type: "button",
        textContent: "重试",
      }),
    );
    row.querySelector("button")!.addEventListener("click", retry);
    feed.append(row);
  };

  const loadPage = async (replace: boolean) => {
    if (state.search !== null) return;
    // 整页替换（切页签/搜索返回/重载）允许打断在途请求：递增 seq 使其过期，
    // 旧响应到达时会被丢弃。否则加载中切页签会被 early-return 挡住，
    // 渲染出旧页签的数据（或让新页签永远等不到内容）。
    if (!replace && (state.loading || state.done)) return;
    const seq = ++state.seq;
    state.loading = true;
    setSentinelBusy(true);
    try {
      const page = await getTimeline(state.tab, replace ? null : state.cursor);
      if (seq !== state.seq) return; // 用户已切换视图，丢弃过期响应
      if (replace) resetFeed();
      for (const post of page.posts) addPost(post);
      state.cursor = page.nextCursor;
      state.done = page.nextCursor === null;
      if (state.done) feed.append(statusRow("你已看完全部内容 🎉"));
      else if (sentinelReached()) {
        window.setTimeout(() => {
          if (seq === state.seq) loadPage(false);
        }, 0);
      }
    } catch {
      if (seq === state.seq) renderError(() => loadPage(replace));
    } finally {
      if (seq === state.seq) {
        state.loading = false;
        setSentinelBusy(false);
      }
    }
  };

  // ---------- 搜索 ----------
  const exitSearch = () => {
    state.search = null;
    state.done = false;
    state.cursor = null;
    composer.hidden = false;
    searchInput.value = "";
    loadPage(true);
  };

  const doSearch = async (rawQuery: string) => {
    const query = rawQuery.trim();
    if (!query) {
      if (state.search !== null) exitSearch();
      return;
    }
    const seq = ++state.seq;
    state.search = query;
    state.done = true; // 搜索结果不分页
    state.loading = true;
    composer.hidden = true;
    setSentinelBusy(true);
    try {
      const result = await searchPosts(query);
      if (seq !== state.seq) return;
      resetFeed(searchHead(result, exitSearch));
      if (result.posts.length === 0) feed.append(statusRow("没有找到相关内容"));
      for (const post of result.posts) addPost(post);
    } catch {
      if (seq === state.seq) renderError(() => doSearch(query));
    } finally {
      if (seq === state.seq) {
        state.loading = false;
        setSentinelBusy(false);
      }
    }
  };

  searchInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    doSearch(searchInput.value);
  });

  // ---------- 页签切换 ----------
  for (const tab of tabs) {
    tab.addEventListener("click", () => {
      const next = tab.dataset.tab as FeedTab | undefined;
      if (!next) return;
      if (state.search === null && next === state.tab) return;
      if (state.search !== null) {
        state.search = null;
        composer.hidden = false;
        searchInput.value = "";
      }
      state.tab = next;
      state.cursor = null;
      state.done = false;
      for (const t of tabs) t.classList.toggle("is-active", t === tab);
      loadPage(true);
    });
  }

  // ---------- 无限滚动 ----------
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) loadPage(false);
    },
    { root: scroller, rootMargin: "360px" },
  );
  observer.observe(sentinel);

  // ---------- 帖子操作（事件委托） ----------
  const flashCount = (btn: HTMLElement) => {
    const counter = btn.querySelector<HTMLElement>(".fk-action-count");
    if (!counter) return;
    counter.classList.remove("is-flash");
    void counter.offsetWidth; // 重启动画
    counter.classList.add("is-flash");
  };

  const setCount = (btn: HTMLElement, n: number) => {
    btn.querySelector<HTMLElement>(".fk-action-count")!.textContent =
      n > 0 ? fmtCount(n) : "";
  };

  feed.addEventListener("click", async (event) => {
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>(
      ".fk-action",
    );
    if (!btn) return;
    const article = btn.closest<HTMLElement>(".fk-post");
    const id = article?.dataset.postId;
    if (!id) return;
    const action = btn.dataset.action;

    if (action === "like" || action === "repost") {
      const active = action === "like" ? "is-liked" : "is-reposted";
      const willActive = !btn.classList.contains(active);
      btn.classList.toggle(active, willActive);
      flashCount(btn);
      const countOf = (n: number, on: boolean) =>
        Math.max(0, n + (on ? 1 : -1));
      const current = Number(btn.dataset.count ?? "0");
      const optimistic = countOf(current, willActive);
      btn.dataset.count = String(optimistic);
      setCount(btn, optimistic);
      try {
        let serverCount: number;
        let serverActive: boolean;
        if (action === "like") {
          const result = await toggleLike(id, willActive);
          serverCount = result.likes;
          serverActive = result.liked;
        } else {
          const result = await toggleRepost(id, willActive);
          serverCount = result.reposts;
          serverActive = result.reposted;
        }
        btn.dataset.count = String(serverCount);
        setCount(btn, serverCount);
        btn.classList.toggle(active, serverActive);
      } catch {
        // 乐观更新失败则回滚
        btn.classList.toggle(active, !willActive);
        btn.dataset.count = String(current);
        setCount(btn, current);
      }
      return;
    }

    if (action === "reply") {
      composer.hidden = false;
      composerInput.value = `@${article.dataset.handle ?? ""} `;
      composerInput.focus();
      composerInput.setSelectionRange(
        composerInput.value.length,
        composerInput.value.length,
      );
      composerInput.scrollIntoView({ behavior: "smooth", block: "center" });
      syncComposer();
      return;
    }

    if (action === "share") {
      const url = `${location.origin}/fuckxter?post=${id}`;
      try {
        await navigator.clipboard.writeText(url);
        btn.title = "已复制链接";
        setTimeout(() => {
          btn.title = "分享";
        }, 1200);
      } catch {
        /* 剪贴板不可用时静默忽略 */
      }
    }
  });

  // ---------- 发帖框 ----------
  const syncComposer = () => {
    const len = [...composerInput.value].length;
    charCount.textContent = `${len} / ${MAX_CHARS}`;
    charCount.classList.toggle("is-over", len > MAX_CHARS);
    composerBtn.disabled = len === 0 || len > MAX_CHARS;
  };
  composerInput.addEventListener("input", syncComposer);
  composerInput.addEventListener("input", () => {
    composerInput.style.height = "auto";
    composerInput.style.height = `${composerInput.scrollHeight}px`;
  });
  syncComposer();

  composerBtn.addEventListener("click", async () => {
    const text = composerInput.value.trim();
    if (!text) return;
    composerBtn.disabled = true;
    const label = composerBtn.textContent;
    composerBtn.textContent = "发送中…";
    try {
      await createPost(text);
      if (state.search !== null) {
        searchInput.value = "";
        state.search = null;
      }
      composer.hidden = false;
      state.cursor = null;
      state.done = false;
      composerInput.value = "";
      composerInput.style.height = "";
      syncComposer();
      // 新帖会出现在池顶，直接整页重拉，避免光标错位导致的重复渲染
      scroller.scrollTo({ top: 0 });
      loadPage(true);
    } catch {
      composerBtn.textContent = "发送失败";
      setTimeout(() => {
        composerBtn.textContent = label;
        syncComposer();
      }, 1200);
      return;
    }
    composerBtn.textContent = label;
  });

  // ---------- 账号菜单（登录态 / 三级主题菜单 / 弹窗入口） ----------
  const accountWrap = container.querySelector<HTMLElement>(".fk-account")!;
  const accountBtn = accountWrap.querySelector<HTMLButtonElement>(
    "[data-role=account-btn]",
  )!;
  const accountMenu = accountWrap.querySelector<HTMLElement>(
    "[data-role=account-menu]",
  )!;
  const authItems = accountMenu.querySelector<HTMLElement>(
    "[data-role=auth-items]",
  )!;
  const userItems = accountMenu.querySelector<HTMLElement>(
    "[data-role=user-items]",
  )!;
  const signoutItems = accountMenu.querySelector<HTMLElement>(
    "[data-role=signout-items]",
  )!;
  const menuAvatar = accountMenu.querySelector<HTMLElement>(
    "[data-role=menu-avatar]",
  )!;
  const menuName = accountMenu.querySelector<HTMLElement>(
    "[data-role=menu-name]",
  )!;
  const menuHandle = accountMenu.querySelector<HTMLElement>(
    "[data-role=menu-handle]",
  )!;
  const themeTrigger = accountMenu.querySelector<HTMLButtonElement>(
    "[data-account-open=theme]",
  )!;
  const themeSubmenu = accountMenu.querySelector<HTMLElement>(
    "[data-role=theme-submenu]",
  )!;

  // 弹窗标记在 .fk-app 之外，从 document 取
  const authModal = document.querySelector<HTMLElement>(
    "[data-role=auth-modal]",
  )!;
  const settingsModal = document.querySelector<HTMLElement>(
    "[data-role=settings-modal]",
  )!;

  let account: Account | null = getAccount();

  const applyThemeChoice = (mode: string) => {
    localStorage.setItem("theme", mode);
    const dark =
      mode === "dark" ||
      (mode === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.themeMode = mode;
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  };

  const syncThemeMenu = () => {
    const current = localStorage.getItem("theme") ?? "auto";
    for (const item of themeSubmenu.querySelectorAll<HTMLButtonElement>(
      "[data-theme-choice]",
    )) {
      item.setAttribute(
        "aria-checked",
        item.dataset.themeChoice === current ? "true" : "false",
      );
    }
  };

  const renderAccountUI = () => {
    const btnAvatar = container.querySelector<HTMLElement>(
      "[data-role=account-avatar]",
    )!;
    const btnIcon = container.querySelector<SVGElement>(
      "[data-role=account-icon]",
    )!;
    if (account) {
      const initial = [...account.profile.name][0] ?? "?";
      btnAvatar.hidden = false;
      btnIcon.setAttribute("style", "display:none");
      btnAvatar.setAttribute("style", avatarGradient(account.profile.handle));
      btnAvatar.textContent = initial;
      menuAvatar.setAttribute("style", avatarGradient(account.profile.handle));
      menuAvatar.textContent = initial;
      menuName.textContent = account.profile.name;
      menuHandle.textContent = `@${account.profile.handle}`;
      authItems.hidden = true;
      userItems.hidden = false;
      signoutItems.hidden = false;
    } else {
      btnAvatar.hidden = true;
      btnIcon.removeAttribute("style");
      authItems.hidden = false;
      userItems.hidden = true;
      signoutItems.hidden = true;
    }
    syncComposerUser();
    syncThemeMenu();
  };

  const closeSubmenu = () => {
    themeSubmenu.hidden = true;
    themeTrigger.setAttribute("aria-expanded", "false");
  };

  const closeAccountMenu = () => {
    accountMenu.hidden = true;
    accountBtn.setAttribute("aria-expanded", "false");
    closeSubmenu();
    document.removeEventListener("click", onDocClick, true);
    document.removeEventListener("keydown", onMenuKeydown, true);
  };
  const onDocClick = (event: MouseEvent) => {
    if (!accountWrap.contains(event.target as Node)) closeAccountMenu();
  };
  const onMenuKeydown = (event: KeyboardEvent) => {
    if (event.key === "Escape") closeAccountMenu();
  };

  accountBtn.addEventListener("click", () => {
    if (accountMenu.hidden) {
      renderAccountUI();
      accountMenu.hidden = false;
      accountBtn.setAttribute("aria-expanded", "true");
      document.addEventListener("click", onDocClick, true);
      document.addEventListener("keydown", onMenuKeydown, true);
    } else {
      closeAccountMenu();
    }
  });

  // 第三级：主题外观子菜单
  themeTrigger.addEventListener("click", () => {
    const willOpen = themeSubmenu.hidden;
    themeSubmenu.hidden = !willOpen;
    themeTrigger.setAttribute("aria-expanded", String(willOpen));
  });

  themeSubmenu.addEventListener("click", (event) => {
    const item = (event.target as HTMLElement).closest<HTMLButtonElement>(
      "[data-theme-choice]",
    );
    if (!item) return;
    applyThemeChoice(item.dataset.themeChoice!);
    syncThemeMenu();
    closeAccountMenu();
  });

  accountMenu.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const authOpen = target.closest<HTMLButtonElement>("[data-auth-open]");
    if (authOpen) {
      closeAccountMenu();
      openAuthModal(authOpen.dataset.authOpen as "signin" | "signup");
      return;
    }
    const open = target.closest<HTMLButtonElement>("[data-account-open]");
    if (open) {
      const action = open.dataset.accountOpen;
      if (action === "settings") {
        closeAccountMenu();
        openSettingsModal("profile");
      } else if (action === "s3") {
        closeAccountMenu();
        openSettingsModal("storage");
      }
      return; // theme 由上面的子菜单处理器处理，不关闭菜单
    }
    const action = target.closest<HTMLButtonElement>("[data-account-action]")
      ?.dataset.accountAction;
    if (action === "signout") {
      void signOut().then(() => {
        account = null;
        closeAccountMenu();
        renderAccountUI();
      });
    }
  });

  // ---------- 弹窗通用 ----------
  const onModalKeydown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    if (!settingsModal.hidden) closeModal(settingsModal);
    else if (!authModal.hidden) closeModal(authModal);
  };
  let modalKeysBound = false;
  const bindModalKeys = () => {
    if (modalKeysBound) return;
    modalKeysBound = true;
    document.addEventListener("keydown", onModalKeydown, true);
  };
  const unbindModalKeys = () => {
    if (!modalKeysBound || !authModal.hidden || !settingsModal.hidden) return;
    modalKeysBound = false;
    document.removeEventListener("keydown", onModalKeydown, true);
  };
  const openModal = (modal: HTMLElement) => {
    modal.hidden = false;
    bindModalKeys();
  };
  const closeModal = (modal: HTMLElement) => {
    modal.hidden = true;
    unbindModalKeys();
  };
  const setStatus = (el: HTMLElement | null, message: string) => {
    if (el) el.textContent = message;
  };

  // ---------- 登录 / 注册弹窗 ----------
  const signinForm = authModal.querySelector<HTMLFormElement>(
    "[data-role=signin-form]",
  )!;
  const signupForm = authModal.querySelector<HTMLFormElement>(
    "[data-role=signup-form]",
  )!;
  const signinStatus = authModal.querySelector<HTMLElement>(
    "[data-role=signin-status]",
  )!;
  const signupStatus = authModal.querySelector<HTMLElement>(
    "[data-role=signup-status]",
  )!;

  const setAuthTab = (tab: "signin" | "signup") => {
    for (const t of authModal.querySelectorAll<HTMLButtonElement>(
      "[data-auth-tab]",
    )) {
      const active = t.dataset.authTab === tab;
      t.classList.toggle("is-active", active);
      t.setAttribute("aria-selected", String(active));
    }
    signinForm.hidden = tab !== "signin";
    signupForm.hidden = tab !== "signup";
    setStatus(signinStatus, "");
    setStatus(signupStatus, "");
  };

  const openAuthModal = (tab: "signin" | "signup") => {
    setAuthTab(tab);
    signinForm.reset();
    signupForm.reset();
    openModal(authModal);
  };

  for (const t of authModal.querySelectorAll<HTMLButtonElement>(
    "[data-auth-tab]",
  )) {
    t.addEventListener("click", () =>
      setAuthTab(t.dataset.authTab as "signin" | "signup"),
    );
  }
  authModal
    .querySelector<HTMLButtonElement>("[data-role=auth-close]")!
    .addEventListener("click", () => closeModal(authModal));
  authModal
    .querySelector<HTMLElement>("[data-role=auth-backdrop]")!
    .addEventListener("click", () => closeModal(authModal));

  signinForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(signinForm);
    const btn = signinForm.querySelector<HTMLButtonElement>(".fk-primary-btn")!;
    btn.disabled = true;
    setStatus(signinStatus, "登录中…");
    try {
      account = await signIn({
        email: String(data.get("email") ?? ""),
        password: String(data.get("password") ?? ""),
      });
      renderAccountUI();
      closeModal(authModal);
    } catch (error) {
      setStatus(
        signinStatus,
        error instanceof Error ? error.message : "登录失败",
      );
    } finally {
      btn.disabled = false;
    }
  });

  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(signupForm);
    const btn = signupForm.querySelector<HTMLButtonElement>(".fk-primary-btn")!;
    btn.disabled = true;
    setStatus(signupStatus, "创建中…");
    try {
      account = await signUp({
        name: String(data.get("name") ?? ""),
        email: String(data.get("email") ?? ""),
        password: String(data.get("password") ?? ""),
      });
      renderAccountUI();
      closeModal(authModal);
    } catch (error) {
      setStatus(
        signupStatus,
        error instanceof Error ? error.message : "注册失败",
      );
    } finally {
      btn.disabled = false;
    }
  });

  // ---------- 账号设置弹窗（个人资料 / 安全 / S3） ----------
  const settingsPanes = [
    ...settingsModal.querySelectorAll<HTMLElement>("[data-settings-pane]"),
  ];
  const settingsNavBtns = [
    ...settingsModal.querySelectorAll<HTMLButtonElement>("[data-settings-tab]"),
  ];

  const setSettingsTab = (tab: "profile" | "security" | "storage") => {
    for (const btn of settingsNavBtns) {
      btn.classList.toggle("is-active", btn.dataset.settingsTab === tab);
    }
    for (const pane of settingsPanes) {
      pane.hidden = pane.dataset.settingsPane !== tab;
    }
  };

  const openSettingsModal = (tab: "profile" | "security" | "storage") => {
    if (!account) return;
    setSettingsTab(tab);
    fillProfileForm();
    fillEmailHint();
    renderTfa();
    fillS3Form();
    openModal(settingsModal);
  };

  for (const btn of settingsNavBtns) {
    btn.addEventListener("click", () =>
      setSettingsTab(
        btn.dataset.settingsTab as "profile" | "security" | "storage",
      ),
    );
  }
  settingsModal
    .querySelector<HTMLButtonElement>("[data-role=settings-close]")!
    .addEventListener("click", () => closeModal(settingsModal));
  settingsModal
    .querySelector<HTMLElement>("[data-role=settings-backdrop]")!
    .addEventListener("click", () => closeModal(settingsModal));

  // 个人资料
  const profileForm = settingsModal.querySelector<HTMLFormElement>(
    "[data-role=profile-form]",
  )!;
  const bioInput =
    profileForm.querySelector<HTMLTextAreaElement>("[name=bio]")!;
  const bioCount = settingsModal.querySelector<HTMLElement>(
    "[data-role=bio-count]",
  )!;
  const profileStatus =
    profileForm.querySelector<HTMLElement>(".fk-form-status")!;

  const fillProfileForm = () => {
    if (!account) return;
    profileForm.querySelector<HTMLInputElement>("[name=name]")!.value =
      account.profile.name;
    profileForm.querySelector<HTMLInputElement>("[name=handle]")!.value =
      account.profile.handle;
    bioInput.value = account.profile.bio;
    bioCount.textContent = `${[...account.profile.bio].length} / 200`;
    setStatus(profileStatus, "");
    const avatar = settingsModal.querySelector<HTMLElement>(
      "[data-role=profile-avatar]",
    )!;
    avatar.setAttribute("style", avatarGradient(account.profile.handle));
    avatar.textContent = [...account.profile.name][0] ?? "?";
  };

  bioInput.addEventListener("input", () => {
    bioCount.textContent = `${[...bioInput.value].length} / 200`;
  });

  profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!account) return;
    const data = new FormData(profileForm);
    const btn =
      profileForm.querySelector<HTMLButtonElement>(".fk-primary-btn")!;
    btn.disabled = true;
    try {
      account = await updateProfile({
        name: String(data.get("name") ?? ""),
        bio: String(data.get("bio") ?? ""),
      });
      renderAccountUI();
      fillProfileForm();
      setStatus(profileStatus, "已保存 ✓");
      setTimeout(() => setStatus(profileStatus, ""), 1500);
    } catch (error) {
      setStatus(
        profileStatus,
        error instanceof Error ? error.message : "保存失败",
      );
    } finally {
      btn.disabled = false;
    }
  });

  // 更改邮箱
  const emailForm = settingsModal.querySelector<HTMLFormElement>(
    "[data-role=email-form]",
  )!;
  const emailStatus = emailForm.querySelector<HTMLElement>(".fk-form-status")!;

  const fillEmailHint = () => {
    const el = settingsModal.querySelector<HTMLElement>(
      "[data-role=current-email]",
    )!;
    if (account) el.textContent = account.profile.email;
  };

  emailForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!account) return;
    const data = new FormData(emailForm);
    const btn = emailForm.querySelector<HTMLButtonElement>(".fk-primary-btn")!;
    btn.disabled = true;
    try {
      account = await changeEmail({
        email: String(data.get("email") ?? ""),
        password: String(data.get("password") ?? ""),
      });
      emailForm.reset();
      renderAccountUI();
      fillEmailHint();
      setStatus(emailStatus, "邮箱已更新 ✓");
      setTimeout(() => setStatus(emailStatus, ""), 1500);
    } catch (error) {
      setStatus(
        emailStatus,
        error instanceof Error ? error.message : "更新失败",
      );
    } finally {
      btn.disabled = false;
    }
  });

  // 更改密码
  const passwordForm = settingsModal.querySelector<HTMLFormElement>(
    "[data-role=password-form]",
  )!;
  const passwordStatus =
    passwordForm.querySelector<HTMLElement>(".fk-form-status")!;

  passwordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!account) return;
    const data = new FormData(passwordForm);
    const next = String(data.get("next") ?? "");
    if (next !== String(data.get("confirm") ?? "")) {
      setStatus(passwordStatus, "两次输入的新密码不一致");
      return;
    }
    const btn =
      passwordForm.querySelector<HTMLButtonElement>(".fk-primary-btn")!;
    btn.disabled = true;
    try {
      await changePassword({
        current: String(data.get("current") ?? ""),
        next,
      });
      passwordForm.reset();
      setStatus(passwordStatus, "密码已更新 ✓");
      setTimeout(() => setStatus(passwordStatus, ""), 1500);
    } catch (error) {
      setStatus(
        passwordStatus,
        error instanceof Error ? error.message : "更新失败",
      );
    } finally {
      btn.disabled = false;
    }
  });

  // 两步验证 + 恢复密钥
  const tfaStatus = settingsModal.querySelector<HTMLElement>(
    "[data-role=tfa-status]",
  )!;
  const tfaOff = settingsModal.querySelector<HTMLElement>(
    "[data-role=tfa-off]",
  )!;
  const tfaSetup = settingsModal.querySelector<HTMLElement>(
    "[data-role=tfa-setup]",
  )!;
  const tfaOn = settingsModal.querySelector<HTMLElement>("[data-role=tfa-on]")!;
  const recoveryBox = settingsModal.querySelector<HTMLElement>(
    "[data-role=recovery-box]",
  )!;

  const renderTfa = () => {
    if (!account) return;
    tfaStatus.textContent = account.twoFactorEnabled
      ? "两步验证已开启 ✓"
      : "未开启。开启后登录时需要验证器 App 的动态验证码。";
    tfaOff.hidden = Boolean(account.twoFactorEnabled);
    tfaSetup.hidden = true;
    tfaOn.hidden = !account.twoFactorEnabled;
    recoveryBox.hidden = true;
  };

  settingsModal
    .querySelector<HTMLButtonElement>("[data-role=tfa-start]")!
    .addEventListener("click", async () => {
      try {
        const { secret } = await beginTwoFactor();
        setStatus(
          settingsModal.querySelector<HTMLElement>("[data-role=tfa-secret]"),
          secret,
        );
        tfaOff.hidden = true;
        tfaSetup.hidden = false;
        setStatus(
          settingsModal.querySelector<HTMLElement>(
            "[data-role=tfa-setup-status]",
          ),
          "",
        );
      } catch (error) {
        tfaStatus.textContent =
          error instanceof Error ? error.message : "初始化失败";
      }
    });

  settingsModal
    .querySelector<HTMLButtonElement>("[data-role=tfa-cancel]")!
    .addEventListener("click", () => {
      tfaSetup.hidden = true;
      tfaOff.hidden = false;
    });

  settingsModal
    .querySelector<HTMLButtonElement>("[data-role=tfa-confirm]")!
    .addEventListener("click", async () => {
      const code = settingsModal
        .querySelector<HTMLInputElement>("[data-role=tfa-code]")!
        .value.trim();
      const setupStatus = settingsModal.querySelector<HTMLElement>(
        "[data-role=tfa-setup-status]",
      )!;
      try {
        account = await confirmTwoFactor(code);
        renderTfa();
      } catch (error) {
        setStatus(
          setupStatus,
          error instanceof Error ? error.message : "验证失败",
        );
      }
    });

  settingsModal
    .querySelector<HTMLButtonElement>("[data-role=recovery-generate]")!
    .addEventListener("click", async () => {
      const btn = settingsModal.querySelector<HTMLButtonElement>(
        "[data-role=recovery-generate]",
      )!;
      btn.disabled = true;
      try {
        const codes = await generateRecoveryCodes();
        const list = settingsModal.querySelector<HTMLElement>(
          "[data-role=recovery-list]",
        )!;
        list.replaceChildren(
          ...codes.map((code) => {
            const li = document.createElement("li");
            li.textContent = code;
            return li;
          }),
        );
        recoveryBox.hidden = false;
      } catch (error) {
        tfaStatus.textContent =
          error instanceof Error ? error.message : "生成失败";
      } finally {
        btn.disabled = false;
      }
    });

  settingsModal
    .querySelector<HTMLButtonElement>("[data-role=recovery-copy]")!
    .addEventListener("click", async (event) => {
      const codes = [
        ...settingsModal.querySelectorAll<HTMLElement>(
          "[data-role=recovery-list] li",
        ),
      ].map((li) => li.textContent ?? "");
      try {
        await navigator.clipboard.writeText(codes.join("\n"));
        const btn = event.currentTarget as HTMLButtonElement;
        btn.textContent = "已复制 ✓";
        setTimeout(() => {
          btn.textContent = "复制全部";
        }, 1500);
      } catch {
        /* 剪贴板不可用时静默忽略 */
      }
    });

  // S3 兼容存储
  const s3Form = settingsModal.querySelector<HTMLFormElement>(
    "[data-role=s3-form]",
  )!;
  const s3Status = s3Form.querySelector<HTMLElement>(".fk-form-status")!;

  const s3ConfigFromForm = (): S3Config => {
    const data = new FormData(s3Form);
    return {
      endpoint: String(data.get("endpoint") ?? "").trim(),
      region: String(data.get("region") ?? "").trim(),
      bucket: String(data.get("bucket") ?? "").trim(),
      accessKeyId: String(data.get("accessKeyId") ?? "").trim(),
      secretAccessKey: String(data.get("secretAccessKey") ?? ""),
      pathStyle: data.get("pathStyle") === "on",
    };
  };

  const fillS3Form = () => {
    const config = getS3Config();
    if (!config) return;
    for (const [key, value] of Object.entries(config)) {
      const field = s3Form.querySelector<HTMLInputElement | HTMLInputElement>(
        `[name=${key}]`,
      );
      if (!field) continue;
      if (field.type === "checkbox") field.checked = Boolean(value);
      else field.value = String(value);
    }
    setStatus(s3Status, "");
  };

  settingsModal
    .querySelector<HTMLButtonElement>("[data-role=s3-test]")!
    .addEventListener("click", async () => {
      const btn = settingsModal.querySelector<HTMLButtonElement>(
        "[data-role=s3-test]",
      )!;
      btn.disabled = true;
      setStatus(s3Status, "测试中…");
      try {
        setStatus(s3Status, await testS3Connection(s3ConfigFromForm()));
      } catch (error) {
        setStatus(
          s3Status,
          error instanceof Error ? error.message : "连接失败",
        );
      } finally {
        btn.disabled = false;
      }
    });

  s3Form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const btn = s3Form.querySelector<HTMLButtonElement>(".fk-primary-btn")!;
    btn.disabled = true;
    try {
      await saveS3Config(s3ConfigFromForm());
      setStatus(s3Status, "已保存 ✓");
      setTimeout(() => setStatus(s3Status, ""), 1500);
    } catch (error) {
      setStatus(s3Status, error instanceof Error ? error.message : "保存失败");
    } finally {
      btn.disabled = false;
    }
  });

  renderAccountUI();

  // 首次访问自动注册访客账号；主动退出登录的本机账号不会被重新登入
  void autoSignUp().then((auto) => {
    if (!auto || account) return;
    account = auto;
    renderAccountUI();
  });

  // 离开页面（客户端路由）时释放观察器与断点监听，避免僵尸回调
  document.addEventListener(
    "astro:before-swap",
    () => {
      observer.disconnect();
      for (const [query] of COLUMN_QUERIES) {
        matchMedia(query).removeEventListener("change", onMediaChange);
      }
      document.removeEventListener("keydown", onModalKeydown, true);
      modalKeysBound = false;
    },
    { once: true },
  );

  loadPage(true);
}

export function mountFuckxterBySelector(selector: string): void {
  const container = document.querySelector<HTMLElement>(selector);
  if (container) mountFuckxter(container);
}
