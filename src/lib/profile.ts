import type { Profile } from "@/lib/types";

export const INITIAL_PASSWORD = "password123";
export const AUTH_EMAIL_DOMAIN = "revision.local";

type ProfileIdentity = Pick<Profile, "display_name" | "email" | "login_id">;

export function normalizeLoginId(value: string): string {
  return value.trim().toLowerCase().split("@")[0];
}

export function loginIdToAuthEmail(loginId: string): string {
  return `${normalizeLoginId(loginId)}@${AUTH_EMAIL_DOMAIN}`;
}

export function getProfileLoginId(profile: Pick<Profile, "email" | "login_id">): string {
  return profile.login_id ?? profile.email.split("@")[0];
}

export function getProfileDisplayName(profile: ProfileIdentity): string {
  return profile.display_name || getProfileLoginId(profile) || "不明なユーザー";
}

export function isInternalAuthEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${AUTH_EMAIL_DOMAIN}`);
}
