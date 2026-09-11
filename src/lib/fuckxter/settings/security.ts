import {
  beginTwoFactor,
  changeEmail,
  changePassword,
  confirmTwoFactor,
  generateRecoveryCodes,
} from "../auth";
import {
  downloadRecoveryCodes,
  setStatus,
  type SettingsContext,
} from "./shared";

export function mountSecuritySettings(
  root: HTMLElement,
  context: SettingsContext,
): void {
  const emailForm = root.querySelector<HTMLFormElement>(
    "[data-role=email-form]",
  )!;
  const emailStatus = emailForm.querySelector<HTMLElement>(".fk-form-status")!;

  const fillEmailHint = () => {
    const account = context.getAccount();
    const hint = root.querySelector<HTMLElement>("[data-role=current-email]")!;
    if (account) hint.textContent = account.profile.email;
  };

  emailForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!context.getAccount()) return;
    const data = new FormData(emailForm);
    const button =
      emailForm.querySelector<HTMLButtonElement>(".fk-primary-btn")!;
    button.disabled = true;
    try {
      const account = await changeEmail({
        email: String(data.get("email") ?? ""),
        password: String(data.get("password") ?? ""),
      });
      context.setAccount(account);
      emailForm.reset();
      fillEmailHint();
      setStatus(emailStatus, "邮箱已更新 ✓");
      setTimeout(() => setStatus(emailStatus, ""), 1500);
    } catch (error) {
      setStatus(
        emailStatus,
        error instanceof Error ? error.message : "更新失败",
      );
    } finally {
      button.disabled = false;
    }
  });

  const passwordForm = root.querySelector<HTMLFormElement>(
    "[data-role=password-form]",
  )!;
  const passwordStatus =
    passwordForm.querySelector<HTMLElement>(".fk-form-status")!;

  passwordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!context.getAccount()) return;
    const data = new FormData(passwordForm);
    const next = String(data.get("next") ?? "");
    if (next !== String(data.get("confirm") ?? "")) {
      setStatus(passwordStatus, "两次输入的新密码不一致");
      return;
    }
    const button =
      passwordForm.querySelector<HTMLButtonElement>(".fk-primary-btn")!;
    button.disabled = true;
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
      button.disabled = false;
    }
  });

  const tfaStatus = root.querySelector<HTMLElement>("[data-role=tfa-status]")!;
  const tfaOff = root.querySelector<HTMLElement>("[data-role=tfa-off]")!;
  const tfaSetup = root.querySelector<HTMLElement>("[data-role=tfa-setup]")!;

  const renderTfa = () => {
    const account = context.getAccount();
    if (!account) return;
    tfaStatus.textContent = account.twoFactorEnabled
      ? "两步验证已开启 ✓"
      : "未开启。开启后登录时需要验证器 App 的动态验证码。";
    tfaOff.hidden = Boolean(account.twoFactorEnabled);
    tfaSetup.hidden = true;
    setStatus(root.querySelector<HTMLElement>("[data-role=tfa-secret]"), "");
  };

  root
    .querySelector<HTMLButtonElement>("[data-role=tfa-start]")!
    .addEventListener("click", async () => {
      try {
        const { secret } = await beginTwoFactor();
        setStatus(
          root.querySelector<HTMLElement>("[data-role=tfa-secret]"),
          secret,
        );
        tfaOff.hidden = true;
        tfaSetup.hidden = false;
        setStatus(
          root.querySelector<HTMLElement>("[data-role=tfa-setup-status]"),
          "",
        );
      } catch (error) {
        tfaStatus.textContent =
          error instanceof Error ? error.message : "初始化失败";
      }
    });

  root
    .querySelector<HTMLButtonElement>("[data-role=tfa-cancel]")!
    .addEventListener("click", () => {
      tfaSetup.hidden = true;
      tfaOff.hidden = false;
    });

  root
    .querySelector<HTMLButtonElement>("[data-role=tfa-confirm]")!
    .addEventListener("click", async () => {
      const code = root
        .querySelector<HTMLInputElement>("[data-role=tfa-code]")!
        .value.trim();
      const setupStatus = root.querySelector<HTMLElement>(
        "[data-role=tfa-setup-status]",
      )!;
      try {
        const account = await confirmTwoFactor(code);
        context.setAccount(account);
        renderTfa();
        renderRecovery();
      } catch (error) {
        setStatus(
          setupStatus,
          error instanceof Error ? error.message : "验证失败",
        );
      }
    });

  const recoveryBox = root.querySelector<HTMLElement>(
    "[data-role=recovery-box]",
  )!;
  const recoveryHint = root.querySelector<HTMLElement>(
    "[data-role=recovery-hint]",
  )!;
  const recoveryGenerate = root.querySelector<HTMLButtonElement>(
    "[data-role=recovery-generate]",
  )!;

  const renderRecovery = () => {
    const account = context.getAccount();
    if (!account) return;
    recoveryBox.hidden = true;
    recoveryHint.hidden = account.twoFactorEnabled;
    recoveryGenerate.hidden = !account.twoFactorEnabled;
  };

  recoveryGenerate.addEventListener("click", async () => {
    recoveryGenerate.disabled = true;
    try {
      const codes = await generateRecoveryCodes();
      root
        .querySelector<HTMLElement>("[data-role=recovery-list]")!
        .replaceChildren(
          ...codes.map((code) => {
            const item = document.createElement("li");
            item.textContent = code;
            return item;
          }),
        );
      recoveryBox.hidden = false;
    } catch (error) {
      setStatus(
        root.querySelector<HTMLElement>("[data-role=recovery-status]"),
        error instanceof Error ? error.message : "生成失败",
      );
    } finally {
      recoveryGenerate.disabled = false;
    }
  });

  root
    .querySelector<HTMLButtonElement>("[data-role=recovery-copy]")!
    .addEventListener("click", async (event) => {
      const codes = [
        ...root.querySelectorAll<HTMLElement>("[data-role=recovery-list] li"),
      ].map((item) => item.textContent ?? "");
      try {
        await navigator.clipboard.writeText(codes.join("\n"));
        const button = event.currentTarget as HTMLButtonElement;
        button.textContent = "已复制 ✓";
        setTimeout(() => {
          button.textContent = "复制全部";
        }, 1500);
      } catch {}
    });

  root
    .querySelector<HTMLButtonElement>("[data-role=recovery-download]")!
    .addEventListener("click", () => {
      const codes = [
        ...root.querySelectorAll<HTMLElement>("[data-role=recovery-list] li"),
      ].map((item) => item.textContent ?? "");
      if (codes.length > 0) downloadRecoveryCodes(codes);
    });

  fillEmailHint();
  renderTfa();
  renderRecovery();
}
