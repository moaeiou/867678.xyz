/**
 * 账号数据层（UI 与后端之间的接缝），约定与 ./api 一致。
 *
 * 后端未就绪：以下全部为前端占位实现。账号会话保存在 localStorage，
 * 密码只做演示级混淆（非哈希、非加密，绝不用于真实场景）；
 * 后端就绪后，把各函数替换为真正的请求，签名与返回类型不变。
 *
 * 约定的后端接口：
 *   POST  /api/fuckxter/auth/signup            body: { name, email, password } -> Account
 *   POST  /api/fuckxter/auth/guest                                             -> Account | null
 *   POST  /api/fuckxter/auth/signin            body: { email, password }       -> Account
 *   POST  /api/fuckxter/auth/signout
 *   PATCH /api/fuckxter/account/profile        body: { name, bio }             -> Account
 *   POST  /api/fuckxter/account/email          body: { email, password }       -> Account
 *   POST  /api/fuckxter/account/password       body: { current, next }
 *   POST  /api/fuckxter/account/2fa                                            -> { secret }
 *   POST  /api/fuckxter/account/2fa/confirm    body: { code }                  -> Account
 *   POST  /api/fuckxter/account/recovery-codes                                 -> { codes }
 *   GET   /api/fuckxter/account/s3                                             -> S3Config | null
 *   PUT   /api/fuckxter/account/s3             body: S3Config
 */

import type { FeedUser } from "./types";

export interface Account {
  profile: {
    name: string;
    /** 不带 @ 前缀 */
    handle: string;
    bio: string;
    email: string;
  };
  twoFactorEnabled: boolean;
  createdAt: string;
}

export interface S3Config {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  pathStyle: boolean;
}

const ACCOUNT_KEY = "fk-account";
const S3_KEY = "fk-s3-config";
const NETWORK_DELAY_MS = 350;

function delay<T>(value: T, ms = NETWORK_DELAY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

/** 演示级混淆：仅为避免明文落盘，不是哈希，不代表任何安全性 */
const obscure = (password: string): string =>
  btoa(unescape(encodeURIComponent(password)));

function readAccount(): Account | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY);
    return raw ? (JSON.parse(raw) as Account) : null;
  } catch {
    return null;
  }
}

function writeAccount(account: Account | null): void {
  if (account) localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
  else localStorage.removeItem(ACCOUNT_KEY);
}

/** 退出登录只结束会话，账号记录保留，登录时可再次校验密码 */
const SIGNED_OUT_KEY = `${ACCOUNT_KEY}:signed-out`;

function isSignedOut(): boolean {
  return localStorage.getItem(SIGNED_OUT_KEY) === "1";
}

/** mock 会话里额外保存混淆后的密码，供改邮箱/改密码时校验（真实后端不会这样做） */
function readSecret(): string {
  return localStorage.getItem(`${ACCOUNT_KEY}:secret`) ?? "";
}

function writeSecret(obscured: string): void {
  localStorage.setItem(`${ACCOUNT_KEY}:secret`, obscured);
}

const handleFromEmail = (email: string): string => {
  const base = email
    .split("@")[0]
    ?.toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
  return base || `user${Date.now() % 10_000}`;
};

const randomCode = (alphabet: string, length: number): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
};

export function getAccount(): Account | null {
  return isSignedOut() ? null : readAccount();
}

/** 已登录账号对应的当前用户（发帖头像等场景），未登录回退到访客身份 */
export function toFeedUser(account: Account | null): FeedUser {
  if (!account) return { id: "guest", name: "访客", handle: "guest" };
  return {
    id: `self-${account.profile.handle}`,
    name: account.profile.name,
    handle: account.profile.handle,
  };
}

export async function signUp(input: {
  name: string;
  email: string;
  password: string;
}): Promise<Account> {
  if (readAccount())
    throw new Error("本机已有账号，请直接登录（演示环境单账号）");
  const account: Account = {
    profile: {
      name: input.name.trim(),
      handle: handleFromEmail(input.email),
      bio: "",
      email: input.email.trim(),
    },
    twoFactorEnabled: false,
    createdAt: new Date().toISOString(),
  };
  writeAccount(account);
  writeSecret(obscure(input.password));
  // TODO(后端): return fetch("/api/fuckxter/auth/signup", { method: "POST", body: JSON.stringify(input) }).then((r) => r.json())
  return delay(account);
}

/**
 * 自动注册：首次访问时静默创建一个访客账号并直接登录，免去手动注册。
 * 本机已有账号（含主动退出登录的）时不做任何事，返回 null。
 * 后端就绪后应替换为匿名/游客会话接口。
 */
export async function autoSignUp(): Promise<Account | null> {
  if (readAccount()) return null;
  const suffix = randomCode("23456789abcdefghjkmnpqrstuvwxyz", 4);
  const account: Account = {
    profile: {
      name: `访客${suffix}`,
      handle: `guest${suffix}`,
      bio: "",
      email: `guest${suffix}@local.demo`,
    },
    twoFactorEnabled: false,
    createdAt: new Date().toISOString(),
  };
  writeAccount(account);
  // 随机密码：自动账号没有已知的登录口令，登录仅限手动注册的账号
  writeSecret(obscure(randomCode("ACDEFGHJKLMNPQRSTUVWXY3456789", 24)));
  // TODO(后端): return fetch("/api/fuckxter/auth/guest", { method: "POST" }).then((r) => r.json())
  return delay(account);
}

export async function signIn(input: {
  email: string;
  password: string;
}): Promise<Account> {
  const account = readAccount();
  if (!account) throw new Error("本机还没有账号，请先注册（演示环境）");
  const email = input.email.trim().toLowerCase();
  if (email !== account.profile.email.toLowerCase()) {
    throw new Error("邮箱不匹配（演示环境仅支持本机注册的账号）");
  }
  if (obscure(input.password) !== readSecret()) throw new Error("密码不正确");
  localStorage.removeItem(SIGNED_OUT_KEY);
  // TODO(后端): return fetch("/api/fuckxter/auth/signin", { method: "POST", body: JSON.stringify(input), credentials: "include" }).then((r) => r.json())
  return delay(account);
}

export async function signOut(): Promise<void> {
  localStorage.setItem(SIGNED_OUT_KEY, "1");
  // TODO(后端): await fetch("/api/fuckxter/auth/signout", { method: "POST", credentials: "include" })
  return delay(undefined);
}

export async function updateProfile(input: {
  name: string;
  bio: string;
}): Promise<Account> {
  const account = readAccount();
  if (!account) throw new Error("未登录");
  account.profile.name = input.name.trim() || account.profile.name;
  account.profile.bio = input.bio.trim();
  writeAccount(account);
  // TODO(后端): return fetch("/api/fuckxter/account/profile", { method: "PATCH", body: JSON.stringify(input), credentials: "include" }).then((r) => r.json())
  return delay(account);
}

export async function changeEmail(input: {
  email: string;
  password: string;
}): Promise<Account> {
  const account = readAccount();
  if (!account) throw new Error("未登录");
  if (obscure(input.password) !== readSecret())
    throw new Error("当前密码不正确");
  account.profile.email = input.email.trim();
  writeAccount(account);
  // TODO(后端): return fetch("/api/fuckxter/account/email", { method: "POST", body: JSON.stringify(input), credentials: "include" }).then((r) => r.json())
  return delay(account);
}

export async function changePassword(input: {
  current: string;
  next: string;
}): Promise<void> {
  const account = readAccount();
  if (!account) throw new Error("未登录");
  if (obscure(input.current) !== readSecret())
    throw new Error("当前密码不正确");
  writeSecret(obscure(input.next));
  // TODO(后端): await fetch("/api/fuckxter/account/password", { method: "POST", body: JSON.stringify(input), credentials: "include" })
  return delay(undefined);
}

/** 生成演示用的 2FA 密钥（base32）。真实后端应返回 otpauth:// 二维码 */
export async function beginTwoFactor(): Promise<{ secret: string }> {
  const account = readAccount();
  if (!account) throw new Error("未登录");
  const secret = randomCode("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567", 16);
  sessionStorage.setItem(`${ACCOUNT_KEY}:2fa-secret`, secret);
  // TODO(后端): return fetch("/api/fuckxter/account/2fa", { method: "POST", credentials: "include" }).then((r) => r.json())
  return delay({ secret });
}

export async function confirmTwoFactor(code: string): Promise<Account> {
  const account = readAccount();
  if (!account) throw new Error("未登录");
  if (!/^\d{6}$/.test(code))
    throw new Error("请输入 6 位数字验证码（演示环境任意 6 位均可）");
  account.twoFactorEnabled = true;
  writeAccount(account);
  sessionStorage.removeItem(`${ACCOUNT_KEY}:2fa-secret`);
  // TODO(后端): return fetch("/api/fuckxter/account/2fa/confirm", { method: "POST", body: JSON.stringify({ code }), credentials: "include" }).then((r) => r.json())
  return delay(account);
}

/** 生成一次性的恢复密钥。真实后端需要把哈希落库并保证只显示一次 */
export async function generateRecoveryCodes(): Promise<string[]> {
  const account = readAccount();
  if (!account) throw new Error("未登录");
  if (!account.twoFactorEnabled) throw new Error("请先开启两步验证");
  const codes = Array.from(
    { length: 8 },
    () =>
      `${randomCode("ACDEFGHJKLMNPQRSTUVWXY3456789", 4)}-${randomCode("ACDEFGHJKLMNPQRSTUVWXY3456789", 4)}`,
  );
  // TODO(后端): return fetch("/api/fuckxter/account/recovery-codes", { method: "POST", credentials: "include" }).then((r) => r.json())
  return delay(codes);
}

export function getS3Config(): S3Config | null {
  try {
    const raw = localStorage.getItem(S3_KEY);
    return raw ? (JSON.parse(raw) as S3Config) : null;
  } catch {
    return null;
  }
}

export async function saveS3Config(config: S3Config): Promise<S3Config> {
  if (!/^https?:\/\//.test(config.endpoint))
    throw new Error("Endpoint 需以 http(s):// 开头");
  localStorage.setItem(S3_KEY, JSON.stringify(config));
  // TODO(后端): return fetch("/api/fuckxter/account/s3", { method: "PUT", body: JSON.stringify(config), credentials: "include" }).then((r) => r.json())
  return delay(config);
}

/** 演示环境的连接测试：仅校验字段格式，不发真实请求 */
export async function testS3Connection(config: S3Config): Promise<string> {
  if (!/^https?:\/\//.test(config.endpoint))
    throw new Error("Endpoint 需以 http(s):// 开头");
  if (!config.bucket) throw new Error("Bucket 不能为空");
  // TODO(后端): 真实的 ListBuckets/HeadBucket 探测
  return delay(
    `连接成功（演示）：${config.bucket} @ ${new URL(config.endpoint).host}`,
  );
}
