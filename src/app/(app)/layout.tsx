import { BottomNav } from "@/components/shared/bottom-nav";
import { DevnetBanner } from "@/components/shared/devnet-banner";
import { Header } from "@/components/shared/header";
import { Sidebar } from "@/components/shared/sidebar";
import { UserMenu } from "@/components/shared/user-menu";
import { getCurrentUser } from "@/lib/auth";

/* ──────────────────────────────────────────────────────────────────────────
   App shell — server-rendered. Public by default; individual routes
   that require a session (Create, Settings, /profile bare) call
   `requireAuth` themselves and redirect to /login. Read-only routes
   (/discover, /bounties/[slug], /profile/[handle]) tolerate a null
   user so anonymous visitors can browse.

   Desktop (md+):
     <Sidebar />                fixed left, 64px (220 on hover), z-50
     <main md:ml-16>
       <DesktopTopBar>          sticky, right-aligned UserMenu, z-30
       <page content>

   Mobile (< md):
     <Header />                 sticky top, logo + balance + avatar
     <main>
     <BottomNav />              sticky bottom, primary tabs

   The session is checked server-side and the row is passed to the client
   components via the `user` prop so we don't double-fetch. When the
   user is anonymous, UserMenu renders a "Connect" CTA that links to
   /login.
   ────────────────────────────────────────────────────────────────────────── */

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  const menuUser = user
    ? {
        handle: user.handle,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        walletAddress: user.walletAddress,
      }
    : null;

  return (
    <div className="min-h-dvh">
      <DevnetBanner />
      <Sidebar user={menuUser} />
      <Header user={menuUser} />

      <div className="md:ml-[72px]">
        <DesktopTopBar user={menuUser} />
        <main className="mx-auto w-full max-w-screen-2xl px-4 pb-20 pt-4 md:px-12 md:py-8">
          {children}
        </main>
      </div>

      <BottomNav />
    </div>
  );
}

function DesktopTopBar({
  user,
}: {
  user: {
    handle: string;
    displayName: string | null;
    avatarUrl: string | null;
    walletAddress: string | null;
  } | null;
}) {
  return (
    <div className="sticky top-0 z-30 hidden h-16 items-center justify-end border-b border-border-subtle bg-bg-base/80 px-12 backdrop-blur-xl md:flex">
      <UserMenu user={user} />
    </div>
  );
}
