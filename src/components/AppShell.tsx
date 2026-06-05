import Link from "next/link";
import { CalendarDays, Layers3, LogOut, Settings } from "lucide-react";
import { signOutAction } from "@/lib/actions/auth";
import { getProfileDisplayName } from "@/lib/profile";
import type { Profile } from "@/lib/types";

type AppShellProps = {
  profile: Profile;
  active: "events" | "seasons" | "admin" | "mvp";
  children: React.ReactNode;
};

export function AppShell({ profile, active, children }: AppShellProps) {
  return (
    <div className="min-h-screen pb-20">
      <header className="sticky top-0 z-20 border-b border-emerald-900/20 bg-primary text-white shadow-sm shadow-emerald-950/10">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link href="/events" className="text-lg font-bold tracking-wide">
            REVISION
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden max-w-32 truncate font-medium sm:inline">
              {getProfileDisplayName(profile)}
            </span>
            {profile.role === "admin" ? (
              <span className="rounded-full bg-amber-300 px-2 py-0.5 text-xs font-semibold text-amber-950">
                管理者
              </span>
            ) : null}
            <form action={signOutAction}>
              <button
                type="submit"
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-white/40 px-2.5 text-xs font-semibold text-white/90 transition hover:bg-white/10"
                title="ログアウト"
                aria-label="ログアウト"
              >
                <LogOut className="h-4 w-4" />
                <span>ログアウト</span>
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-5">{children}</main>

      <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-slate-200 bg-white/95 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] backdrop-blur">
        <div className="mx-auto grid max-w-3xl grid-cols-3">
          <NavItem href="/events" label="イベント" active={active === "events" || active === "mvp"}>
            <CalendarDays className="h-5 w-5" />
          </NavItem>
          <NavItem href="/seasons" label="シーズン" active={active === "seasons"}>
            <Layers3 className="h-5 w-5" />
          </NavItem>
          {profile.role === "admin" ? (
            <NavItem href="/admin" label="管理" active={active === "admin"}>
              <Settings className="h-5 w-5" />
            </NavItem>
          ) : (
            <div />
          )}
        </div>
      </nav>
    </div>
  );
}

function NavItem({
  href,
  label,
  active,
  children,
}: {
  href: string;
  label: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`flex h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium ${
        active ? "text-primary" : "text-slate-500 hover:text-primary"
      }`}
    >
      {children}
      <span>{label}</span>
    </Link>
  );
}
