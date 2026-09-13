import { mountAccountControls } from "./account";
import { hydrateSession } from "./auth";
import { mountFeed } from "./feed";

async function mountFuckxter(container: HTMLElement): Promise<void> {
  if (container.dataset.fkMounted) return;
  container.dataset.fkMounted = "true";

  await hydrateSession();
  const feed = mountFeed(container);
  const account = mountAccountControls(container, {
    onAccountChange: feed.syncUser,
  });

  document.addEventListener(
    "astro:before-swap",
    () => {
      feed.dispose();
      account.dispose();
    },
    { once: true },
  );
}

export function mountFuckxterBySelector(selector: string): void {
  const container = document.querySelector<HTMLElement>(selector);
  if (container) void mountFuckxter(container);
}
