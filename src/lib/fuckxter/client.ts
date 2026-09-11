import { navigate } from "astro:transitions/client";
import {
  createPost,
  getSavedPosts,
  getTimeline,
  isSaved,
  searchPosts,
  toggleLike,
  toggleRepost,
  toggleSave,
} from "./api";
import {
  autoSignUp,
  getAccount,
  signIn,
  signOut,
  signUp,
  toFeedUser,
  type Account,
} from "./auth";
import {
  actionButton,
  avatarGradient,
  el,
  fmtCount,
  ICONS,
  renderPost,
  statusRow,
} from "./dom";
import type { FeedTab, Post, SearchResult } from "./types";

const MAX_CHARS = 500;

const COLUMN_QUERIES: [string, number][] = [
  ["(min-width: 2200px)", 4],
  ["(min-width: 1024px)", 3],
  ["(min-width: 700px)", 2],
];

const columnCount = (): number => {
  for (const [query, count] of COLUMN_QUERIES) {
    if (matchMedia(query).matches) return count;
  }
  return 1;
};

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

  let columnsRoot: HTMLElement | null = null;
  let columns: HTMLElement[] = [];
  let activeColumnCount = 0;
  const orderedPosts: HTMLElement[] = [];

  const postsById = new Map<string, Post>();

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
    if (isSaved(post.id)) {
      node
        .querySelector<HTMLElement>('.fk-action[data-action="save"]')
        ?.classList.add("is-saved");
    }
    orderedPosts.push(node);
    postsById.set(post.id, post);
    shortestColumn().append(node);
    return node;
  };

  const setSentinelBusy = (busy: boolean) => {
    sentinel.classList.toggle("is-done", state.done && !busy);
    spinner.style.visibility = busy ? "visible" : "hidden";
  };

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

    if (!replace && (state.loading || state.done)) return;
    const seq = ++state.seq;
    state.loading = true;
    setSentinelBusy(true);
    try {
      const page = await getTimeline(state.tab, replace ? null : state.cursor);
      if (seq !== state.seq) return;
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
    state.done = true;
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

  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) loadPage(false);
    },
    { root: scroller, rootMargin: "360px" },
  );
  observer.observe(sentinel);

  const flashCount = (btn: HTMLElement) => {
    const counter = btn.querySelector<HTMLElement>(".fk-action-count");
    if (!counter) return;
    counter.classList.remove("is-flash");
    void counter.offsetWidth;
    counter.classList.add("is-flash");
  };

  const setCount = (btn: HTMLElement, n: number) => {
    btn.querySelector<HTMLElement>(".fk-action-count")!.textContent =
      n > 0 ? fmtCount(n) : "";
  };

  feed.addEventListener("click", async (event) => {
    const target = event.target as HTMLElement;
    const avatarLink = target.closest<HTMLElement>(".fk-avatar-link");
    if (avatarLink?.dataset.handle) {
      navigate(`/fuckxter/user/?handle=${avatarLink.dataset.handle}`);
      return;
    }
    const btn = target.closest<HTMLButtonElement>(".fk-action");
    if (!btn) {
      const article = target.closest<HTMLElement>(".fk-post");
      const id = article?.dataset.postId;
      if (id) navigate(`/fuckxter/post/?id=${id}`);
      return;
    }
    const article = btn.closest<HTMLElement>(".fk-post");
    const id = article?.dataset.postId;
    const post = id ? postsById.get(id) : undefined;
    if (!id || !post) return;
    const action = btn.dataset.action;

    if (action === "save") {
      const willSave = !btn.classList.contains("is-saved");
      btn.classList.toggle("is-saved", willSave);
      try {
        await toggleSave(post, willSave);
      } catch {
        btn.classList.toggle("is-saved", !willSave);
      }
      return;
    }

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
      const url = `${location.origin}/fuckxter/post/?id=${id}`;
      try {
        await navigator.clipboard.writeText(url);
        btn.title = "已复制链接";
        setTimeout(() => {
          btn.title = "分享";
        }, 1200);
      } catch {}
    }
  });

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

  const authModal = document.querySelector<HTMLElement>(
    "[data-role=auth-modal]",
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
    if (account) {
      closeAccountMenu();
      navigate(`/fuckxter/user/?handle=${account.profile.handle}`);
      return;
    }
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

  const onModalKeydown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    if (!authModal.hidden) closeModal(authModal);
  };
  let modalKeysBound = false;
  const bindModalKeys = () => {
    if (modalKeysBound) return;
    modalKeysBound = true;
    document.addEventListener("keydown", onModalKeydown, true);
  };
  const unbindModalKeys = () => {
    if (!modalKeysBound || !authModal.hidden) return;
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
      if (open.dataset.accountOpen === "settings") {
        closeAccountMenu();
        navigate("/fuckxter/settings");
      }
      return;
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
        identifier: String(data.get("identifier") ?? ""),
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
        handle: String(data.get("handle") ?? ""),
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

  renderAccountUI();

  void autoSignUp().then((auto) => {
    if (!auto || account) return;
    account = auto;
    renderAccountUI();
  });

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
