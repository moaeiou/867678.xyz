import type { FeedUser } from "./types";

export interface Account {
  profile: {
    name: string;

    handle: string;
    bio: string;
    email: string;

    region: string;

    gender: string;

    birthday: string;
  };
  twoFactorEnabled: boolean;
  createdAt: string;
}

function normalizeProfile(
  profile: Partial<Account["profile"]>,
): Account["profile"] {
  return {
    name: profile.name ?? "",
    handle: profile.handle ?? "",
    bio: profile.bio ?? "",
    email: profile.email ?? "",
    region: profile.region ?? "",
    gender: profile.gender ?? "",
    birthday: profile.birthday ?? "",
  };
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
const RESERVED_HANDLES = new Set(["user", "post", "settings", "api", "assets"]);

function delay<T>(value: T, ms = NETWORK_DELAY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

const obscure = (password: string): string => {
  const bytes = new TextEncoder().encode(password);
  return btoa(String.fromCharCode(...bytes));
};

function readAccount(): Account | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY);
    if (!raw) return null;
    const account = JSON.parse(raw) as Account;
    account.profile = normalizeProfile(account.profile);
    return account;
  } catch {
    return null;
  }
}

function writeAccount(account: Account | null): void {
  if (account) localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
  else localStorage.removeItem(ACCOUNT_KEY);
}

const SIGNED_OUT_KEY = `${ACCOUNT_KEY}:signed-out`;

function isSignedOut(): boolean {
  return localStorage.getItem(SIGNED_OUT_KEY) === "1";
}

function readSecret(): string {
  return localStorage.getItem(`${ACCOUNT_KEY}:secret`) ?? "";
}

function writeSecret(obscured: string): void {
  localStorage.setItem(`${ACCOUNT_KEY}:secret`, obscured);
}

const randomCode = (alphabet: string, length: number): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
};

export function getAccount(): Account | null {
  return isSignedOut() ? null : readAccount();
}

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
  handle: string;
  email: string;
  password: string;
}): Promise<Account> {
  if (readAccount())
    throw new Error("本机已有账号，请直接登录（演示环境单账号）");
  const handle = input.handle.trim().replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9_]{2,20}$/.test(handle))
    throw new Error("用户名需为 2~20 位字母、数字或下划线");
  if (RESERVED_HANDLES.has(handle))
    throw new Error("该用户名为系统保留名称，请换一个");
  const account: Account = {
    profile: {
      name: input.name.trim() || handle,
      handle,
      bio: "",
      email: input.email.trim(),
      region: "",
      gender: "",
      birthday: "",
    },
    twoFactorEnabled: false,
    createdAt: new Date().toISOString(),
  };
  writeAccount(account);
  writeSecret(obscure(input.password));

  return delay(account);
}

export async function autoSignUp(): Promise<Account | null> {
  if (readAccount()) return null;
  const suffix = randomCode("23456789abcdefghjkmnpqrstuvwxyz", 4);
  const account: Account = {
    profile: {
      name: `访客${suffix}`,
      handle: `guest${suffix}`,
      bio: "",
      email: `guest${suffix}@local.demo`,
      region: "",
      gender: "",
      birthday: "",
    },
    twoFactorEnabled: false,
    createdAt: new Date().toISOString(),
  };
  writeAccount(account);

  writeSecret(obscure(randomCode("ACDEFGHJKLMNPQRSTUVWXY3456789", 24)));

  return delay(account);
}

export async function signIn(input: {
  identifier: string;
  password: string;
}): Promise<Account> {
  const account = readAccount();
  if (!account) throw new Error("本机还没有账号（演示环境）");
  const id = input.identifier.trim().replace(/^@/, "").toLowerCase();
  if (
    id !== account.profile.email.toLowerCase() &&
    id !== account.profile.handle.toLowerCase()
  ) {
    throw new Error("邮箱或用户名不匹配（演示环境仅支持本机注册的账号）");
  }
  if (!input.password) throw new Error("请输入密码");
  localStorage.removeItem(SIGNED_OUT_KEY);

  return delay(account);
}

export async function signOut(): Promise<void> {
  localStorage.setItem(SIGNED_OUT_KEY, "1");

  return delay(undefined);
}

export async function updateProfile(input: {
  name: string;
  bio: string;
  region: string;
  gender: string;
  birthday: string;
}): Promise<Account> {
  const account = readAccount();
  if (!account) throw new Error("未登录");
  account.profile.name = input.name.trim() || account.profile.name;
  account.profile.bio = input.bio.trim();
  account.profile.region = input.region.trim();
  account.profile.gender = input.gender.trim();
  account.profile.birthday = input.birthday.trim();
  writeAccount(account);

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

  return delay(undefined);
}

export async function beginTwoFactor(): Promise<{ secret: string }> {
  const account = readAccount();
  if (!account) throw new Error("未登录");
  const secret = randomCode("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567", 16);
  sessionStorage.setItem(`${ACCOUNT_KEY}:2fa-secret`, secret);

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

  return delay(account);
}

export async function generateRecoveryCodes(): Promise<string[]> {
  const account = readAccount();
  if (!account) throw new Error("未登录");
  if (!account.twoFactorEnabled) throw new Error("请先开启两步验证");
  const codes = Array.from(
    { length: 8 },
    () =>
      `${randomCode("ACDEFGHJKLMNPQRSTUVWXY3456789", 4)}-${randomCode("ACDEFGHJKLMNPQRSTUVWXY3456789", 4)}`,
  );

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
  return delay(config);
}

export async function testS3Connection(config: S3Config): Promise<string> {
  if (!/^https?:\/\//.test(config.endpoint))
    throw new Error("Endpoint 需以 http(s):// 开头");
  if (!config.bucket) throw new Error("Bucket 不能为空");
  return delay(
    `连接成功（演示）：${config.bucket} @ ${new URL(config.endpoint).host}`,
  );
}
