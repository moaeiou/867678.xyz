import { navigate } from "astro:transitions/client";
import {
  autoSignUp,
  getAccount,
  signIn,
  signOut,
  signUp,
  type Account,
} from "./auth";
import { avatarGradient } from "./dom";

interface AccountControlsOptions {
  onAccountChange: () => void;
}

export interface AccountControls {
  dispose: () => void;
}

export function mountAccountControls(
  container: HTMLElement,
  options: AccountControlsOptions,
): AccountControls {
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
  const autoAccount = account ? null : autoSignUp();

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
      accountBtn.setAttribute("aria-label", "账号菜单");
      accountBtn.title = "账号菜单";
    } else {
      btnAvatar.hidden = true;
      btnIcon.removeAttribute("style");
      authItems.hidden = false;
      userItems.hidden = true;
      signoutItems.hidden = true;
      accountBtn.setAttribute("aria-label", "登录或注册");
      accountBtn.title = "登录或注册";
    }
    options.onAccountChange();
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

  accountBtn.addEventListener("click", async () => {
    if (!account && autoAccount) {
      account = (await autoAccount) ?? account;
      renderAccountUI();
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
  const setStatus = (element: HTMLElement | null, message: string) => {
    if (element) element.textContent = message;
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
      if (open.dataset.accountOpen === "profile" && account) {
        closeAccountMenu();
        navigate(`/fuckxter/user/?handle=${account.profile.handle}`);
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
    for (const button of authModal.querySelectorAll<HTMLButtonElement>(
      "[data-auth-tab]",
    )) {
      const active = button.dataset.authTab === tab;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
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

  for (const button of authModal.querySelectorAll<HTMLButtonElement>(
    "[data-auth-tab]",
  )) {
    button.addEventListener("click", () =>
      setAuthTab(button.dataset.authTab as "signin" | "signup"),
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
    const button =
      signinForm.querySelector<HTMLButtonElement>(".fk-primary-btn")!;
    button.disabled = true;
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
      button.disabled = false;
    }
  });

  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(signupForm);
    const button =
      signupForm.querySelector<HTMLButtonElement>(".fk-primary-btn")!;
    button.disabled = true;
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
      button.disabled = false;
    }
  });

  renderAccountUI();

  void autoAccount?.then((auto) => {
    if (!auto || account) return;
    account = auto;
    renderAccountUI();
  });

  return {
    dispose: () => {
      document.removeEventListener("click", onDocClick, true);
      document.removeEventListener("keydown", onMenuKeydown, true);
      document.removeEventListener("keydown", onModalKeydown, true);
      modalKeysBound = false;
    },
  };
}
