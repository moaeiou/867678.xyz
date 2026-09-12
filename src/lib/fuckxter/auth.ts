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
const RECOVERY_META_KEY = `${ACCOUNT_KEY}:recovery-meta`;
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

function handleFromEmail(email: string): string {
  const base = email
    .split("@")[0]
    .replace(/[^a-z0-9_]/gi, "")
    .toLowerCase()
    .slice(0, 20);
  if (/^[a-z0-9_]{2,20}$/.test(base) && !RESERVED_HANDLES.has(base)) {
    return base;
  }
  return `guest${randomCode("23456789abcdefghjkmnpqrstuvwxyz", 4)}`;
}

/** 未注册的用户直接用邮箱+密码创建账号 */
async function registerWithIdentifier(
  identifier: string,
  password: string,
): Promise<Account> {
  const id = identifier.trim().replace(/^@/, "").toLowerCase();
  const email = id.includes("@") ? id : `${id}@local.demo`;
  const handle = handleFromEmail(email);
  const account: Account = {
    profile: {
      name: handle,
      handle,
      bio: "",
      email,
      region: "",
      gender: "",
      birthday: "",
    },
    twoFactorEnabled: false,
    createdAt: new Date().toISOString(),
  };
  writeAccount(account);
  writeSecret(obscure(password));
  localStorage.removeItem(SIGNED_OUT_KEY);

  return delay(account);
}

export async function signIn(input: {
  identifier: string;
  password: string;
}): Promise<Account> {
  const account = readAccount();
  if (!account) {
    // 没有账号：自动注册
    if (!input.identifier.trim()) throw new Error("请输入邮箱");
    if (!input.password) throw new Error("请输入密码");
    return registerWithIdentifier(input.identifier, input.password);
  }
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
  localStorage.setItem(
    RECOVERY_META_KEY,
    JSON.stringify({
      count: codes.length,
      generatedAt: new Date().toISOString(),
    }),
  );

  return delay(codes);
}

export function getRecoveryCodeCount(): number {
  try {
    const raw = localStorage.getItem(RECOVERY_META_KEY);
    if (!raw) return 0;
    const meta = JSON.parse(raw) as { count?: unknown };
    return typeof meta.count === "number" && meta.count > 0 ? meta.count : 0;
  } catch {
    return 0;
  }
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
