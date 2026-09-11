import { navigate } from "astro:transitions/client";
import { getSavedPosts, toggleSave } from "./api";
import {
  beginTwoFactor,
  changeEmail,
  changePassword,
  confirmTwoFactor,
  generateRecoveryCodes,
  getAccount,
  getS3Config,
  saveS3Config,
  testS3Connection,
  updateProfile,
  type Account,
  type S3Config,
} from "./auth";
import { avatarGradient, el, relativeTime } from "./dom";

const GENDER_PRESETS = ["男", "女", "跨性别男", "跨性别女"];

function setStatus(element: HTMLElement | null, message: string) {
  if (element) element.textContent = message;
}

function downloadRecoveryCodes(codes: string[]) {
  const content = [
    "FuckXter 恢复密钥",
    `生成时间：${new Date().toLocaleString("zh-CN")}`,
    "",
    ...codes,
    "",
    "请妥善保管：每个恢复密钥只能使用一次。",
  ].join("\n");
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "fuckxter-recovery-codes.txt";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function mountFuckxterSettings(root: HTMLElement): void {
  if (root.dataset.fkSettingsMounted) return;
  root.dataset.fkSettingsMounted = "true";

  let account: Account | null = getAccount();
  if (!account) {
    navigate("/fuckxter");
    return;
  }

  root.querySelector<HTMLButtonElement>("[data-role=back]")!.addEventListener(
    "click",
    () => navigate("/fuckxter"),
  );

  const panes = [...root.querySelectorAll<HTMLElement>("[data-settings-pane]")];
  const navBtns = [
    ...root.querySelectorAll<HTMLButtonElement>("[data-settings-tab]"),
  ];

  const setTab = (tab: string) => {
    for (const btn of navBtns) {
      btn.classList.toggle("is-active", btn.dataset.settingsTab === tab);
    }
    for (const pane of panes) {
      pane.hidden = pane.dataset.settingsPane !== tab;
    }
    if (tab === "saved") renderSavedList();
  };
  for (const btn of navBtns) {
    btn.addEventListener("click", () => setTab(btn.dataset.settingsTab!));
  }

  const params = new URLSearchParams(location.search);
  setTab(params.get("tab") ?? "profile");

  // ---- 个人资料 ----
  const profileForm = root.querySelector<HTMLFormElement>(
    "[data-role=profile-form]",
  )!;
  const bioInput = profileForm.querySelector<HTMLTextAreaElement>("[name=bio]")!;
  const bioCount = root.querySelector<HTMLElement>("[data-role=bio-count]")!;
  const profileStatus =
    profileForm.querySelector<HTMLElement>(".fk-form-status")!;
  const genderSelect =
    profileForm.querySelector<HTMLSelectElement>("[name=gender]")!;
  const genderCustomInput = profileForm.querySelector<HTMLInputElement>(
    "[name=genderCustom]",
  )!;

  const syncGenderField = (gender: string) => {
    if (GENDER_PRESETS.includes(gender) || !gender) {
      genderSelect.value = gender;
    } else {
      genderSelect.value = "自定义";
      genderCustomInput.value = gender;
    }
    genderCustomInput.disabled = genderSelect.value !== "自定义";
  };

  const fillProfileForm = () => {
    if (!account) return;
    profileForm.querySelector<HTMLInputElement>("[name=name]")!.value =
      account.profile.name;
    profileForm.querySelector<HTMLInputElement>("[name=handle]")!.value =
      account.profile.handle;
    bioInput.value = account.profile.bio;
    bioCount.textContent = `${[...account.profile.bio].length} / 200`;
    syncGenderField(account.profile.gender);
    profileForm.querySelector<HTMLInputElement>("[name=region]")!.value =
      account.profile.region;
    profileForm.querySelector<HTMLInputElement>("[name=birthday]")!.value =
      account.profile.birthday;
    setStatus(profileStatus, "");
    const avatar = root.querySelector<HTMLElement>(
      "[data-role=profile-avatar]",
    )!;
    avatar.setAttribute("style", avatarGradient(account.profile.handle));
    avatar.textContent = [...account.profile.name][0] ?? "?";
  };

  genderSelect.addEventListener("change", () => {
    genderCustomInput.disabled = genderSelect.value !== "自定义";
    if (!genderCustomInput.disabled) {
      genderCustomInput.focus();
    } else {
      genderCustomInput.value = "";
    }
  });

  bioInput.addEventListener("input", () => {
    bioCount.textContent = `${[...bioInput.value].length} / 200`;
  });

  profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!account) return;
    const data = new FormData(profileForm);
    const gender =
      genderSelect.value === "自定义"
        ? String(data.get("genderCustom") ?? "").trim() || "自定义"
        : genderSelect.value;
    const btn =
      profileForm.querySelector<HTMLButtonElement>(".fk-primary-btn")!;
    btn.disabled = true;
    try {
      account = await updateProfile({
        name: String(data.get("name") ?? ""),
        bio: String(data.get("bio") ?? ""),
        region: String(data.get("region") ?? ""),
        gender,
        birthday: String(data.get("birthday") ?? ""),
      });
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

  // ---- 收藏 ----
  const savedList = root.querySelector<HTMLElement>("[data-role=saved-list]")!;
  const savedEmpty = root.querySelector<HTMLElement>("[data-role=saved-empty]")!;
  const postsById = new Map<string, Awaited<ReturnType<typeof getSavedPosts>>[number]>();

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
    navigate(`/fuckxter/post/?id=${post.id}`);
  });

  // ---- 更改邮箱 ----
  const emailForm = root.querySelector<HTMLFormElement>("[data-role=email-form]")!;
  const emailStatus = emailForm.querySelector<HTMLElement>(".fk-form-status")!;

  const fillEmailHint = () => {
    const hint = root.querySelector<HTMLElement>("[data-role=current-email]")!;
    if (account) hint.textContent = account.profile.email;
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

  // ---- 更改密码 ----
  const passwordForm = root.querySelector<HTMLFormElement>(
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

  // ---- 两步验证（2FA）----
  const tfaStatus = root.querySelector<HTMLElement>("[data-role=tfa-status]")!;
  const tfaOff = root.querySelector<HTMLElement>("[data-role=tfa-off]")!;
  const tfaSetup = root.querySelector<HTMLElement>("[data-role=tfa-setup]")!;

  const renderTfa = () => {
    if (!account) return;
    tfaStatus.textContent = account.twoFactorEnabled
      ? "两步验证已开启 ✓"
      : "未开启。开启后登录时需要验证器 App 的动态验证码。";
    tfaOff.hidden = Boolean(account.twoFactorEnabled);
    tfaSetup.hidden = true;
    setStatus(root.querySelector<HTMLElement>("[data-role=tfa-secret]"), "");
  };

  root.querySelector<HTMLButtonElement>("[data-role=tfa-start]")!
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

  root.querySelector<HTMLButtonElement>("[data-role=tfa-cancel]")!
    .addEventListener("click", () => {
      tfaSetup.hidden = true;
      tfaOff.hidden = false;
    });

  root.querySelector<HTMLButtonElement>("[data-role=tfa-confirm]")!
    .addEventListener("click", async () => {
      const code = root
        .querySelector<HTMLInputElement>("[data-role=tfa-code]")!
        .value.trim();
      const setupStatus = root.querySelector<HTMLElement>(
        "[data-role=tfa-setup-status]",
      )!;
      try {
        account = await confirmTwoFactor(code);
        renderTfa();
        renderRecovery();
      } catch (error) {
        setStatus(
          setupStatus,
          error instanceof Error ? error.message : "验证失败",
        );
      }
    });

  // ---- 恢复密钥 ----
  const recoveryBox = root.querySelector<HTMLElement>("[data-role=recovery-box]")!;
  const recoveryHint = root.querySelector<HTMLElement>(
    "[data-role=recovery-hint]",
  )!;

  const recoveryGenerate = root.querySelector<HTMLButtonElement>(
    "[data-role=recovery-generate]",
  )!;

  const renderRecovery = () => {
    if (!account) return;
    recoveryBox.hidden = true;
    recoveryHint.hidden = account.twoFactorEnabled;
    recoveryGenerate.hidden = !account.twoFactorEnabled;
  };

  root.querySelector<HTMLButtonElement>("[data-role=recovery-generate]")!
    .addEventListener("click", async () => {
      const btn = root.querySelector<HTMLButtonElement>(
        "[data-role=recovery-generate]",
      )!;
      btn.disabled = true;
      try {
        const codes = await generateRecoveryCodes();
        root
          .querySelector<HTMLElement>("[data-role=recovery-list]")!
          .replaceChildren(
            ...codes.map((code) => {
              const li = document.createElement("li");
              li.textContent = code;
              return li;
            }),
          );
        recoveryBox.hidden = false;
      } catch (error) {
        setStatus(
          root.querySelector<HTMLElement>("[data-role=recovery-status]"),
          error instanceof Error ? error.message : "生成失败",
        );
      } finally {
        btn.disabled = false;
      }
    });

  root.querySelector<HTMLButtonElement>("[data-role=recovery-copy]")!
    .addEventListener("click", async (event) => {
      const codes = [
        ...root.querySelectorAll<HTMLElement>("[data-role=recovery-list] li"),
      ].map((li) => li.textContent ?? "");
      try {
        await navigator.clipboard.writeText(codes.join("\n"));
        const btn = event.currentTarget as HTMLButtonElement;
        btn.textContent = "已复制 ✓";
        setTimeout(() => {
          btn.textContent = "复制全部";
        }, 1500);
      } catch {}
    });

  root.querySelector<HTMLButtonElement>("[data-role=recovery-download]")!
    .addEventListener("click", () => {
      const codes = [
        ...root.querySelectorAll<HTMLElement>("[data-role=recovery-list] li"),
      ].map((li) => li.textContent ?? "");
      if (codes.length === 0) return;
      downloadRecoveryCodes(codes);
    });

  // ---- S3 存储 ----
  const s3Form = root.querySelector<HTMLFormElement>("[data-role=s3-form]")!;
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
      const field = s3Form.querySelector<HTMLInputElement>(`[name=${key}]`);
      if (!field) continue;
      if (field.type === "checkbox") field.checked = Boolean(value);
      else field.value = String(value);
    }
    setStatus(s3Status, "");
  };

  root.querySelector<HTMLButtonElement>("[data-role=s3-test]")!
    .addEventListener("click", async () => {
      const btn = root.querySelector<HTMLButtonElement>("[data-role=s3-test]")!;
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

  fillProfileForm();
  fillEmailHint();
  renderTfa();
  renderRecovery();
  fillS3Form();
  renderSavedList();
}
