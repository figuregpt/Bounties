import type { DefaultSession } from "next-auth";

/**
 * Module augmentation — adds our app-specific identity fields onto the
 * Auth.js Session and JWT types so consumers get typed access without
 * casting.
 */

declare module "next-auth" {
  interface Session {
    user: {
      twitterId: string | null;
      handle: string | null;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    twitterId?: string;
    handle?: string;
  }
}
