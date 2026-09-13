import { navigate } from "astro:transitions/client";
import { getAccount, hydrateSession, type Account } from "../auth";
import { mountProfileSettings } from "./profile";
import { mountSavedSettings } from "./saved";
import { mountSecuritySettings } from "./security";
import { type SettingsContext, type SettingsSection } from "./shared";
import { mountStorageSettings } from "./storage";

export function mountFuckxterSettings(
  root: HTMLElement,
  initialTab: SettingsSection = "profile",
): void {
  if (root.dataset.fkSettingsMounted) return;
  root.dataset.fkSettingsMounted = "true";
  void mountSettings(root, initialTab);
}

async function mountSettings(
  root: HTMLElement,
  initialTab: SettingsSection,
): Promise<void> {
  await hydrateSession();
  let account: Account | null = getAccount();
  if (!account) {
    void navigate("/fuckxter");
    return;
  }

  root
    .querySelector<HTMLButtonElement>("[data-role=back]")!
    .addEventListener("click", () => void navigate("/fuckxter"));

  const panes = [...root.querySelectorAll<HTMLElement>("[data-settings-pane]")];
  const navButtons = [
    ...root.querySelectorAll<HTMLAnchorElement>("[data-settings-tab]"),
  ];

  const setTab = (tab: SettingsSection) => {
    for (const button of navButtons) {
      const active = button.dataset.settingsTab === tab;
      button.classList.toggle("is-active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    }
    for (const pane of panes) {
      pane.hidden = pane.dataset.settingsPane !== tab;
    }
  };

  const selectedTab = panes.some(
    (pane) => pane.dataset.settingsPane === initialTab,
  )
    ? initialTab
    : "profile";
  setTab(selectedTab);

  const context: SettingsContext = {
    getAccount: () => account,
    setAccount: (next) => {
      account = next;
    },
  };

  mountProfileSettings(root, context);
  mountSavedSettings(root);
  mountSecuritySettings(root, context);
  mountStorageSettings(root);
}
