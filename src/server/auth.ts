import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { captureMessage } from "@sentry/nextjs";
import { and, eq } from "drizzle-orm";
import {
  getServerSession,
  type DefaultSession,
  type NextAuthOptions,
} from "next-auth";
import { type Adapter } from "next-auth/adapters";
import SpotifyProvider from "next-auth/providers/spotify";

import { env } from "~/env";
import { db } from "~/server/db";
import {
  accounts,
  sessions,
  users,
  verificationTokens,
} from "~/server/db/schema";

/**
 * Module augmentation for `next-auth` types. Allows us to add custom properties to the `session`
 * object and keep type safety.
 *
 * @see https://next-auth.js.org/getting-started/typescript#module-augmentation
 */
declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      accessToken: string;
      providerAccountId: string;
      // ...other properties
      // role: UserRole;
    } & DefaultSession["user"];
    error?: string;
  }

  // interface User {
  //   // ...other properties
  //   // role: UserRole;
  // }
}

export const getSpotifyTokenOrRefresh = async (userId: string) => {
  let spotifyAccount = await db.query.accounts.findFirst({
    where: and(eq(accounts.userId, userId), eq(accounts.provider, "spotify")),
    columns: {
      access_token: true,
      expires_at: true,
      refresh_token: true,
      providerAccountId: true,
      token_type: true,
    },
  });

  if (
    spotifyAccount?.refresh_token &&
    spotifyAccount.expires_at &&
    Date.now() > spotifyAccount.expires_at * 1000
  ) {
    captureMessage("Refreshing Spotify Token");
    // Access token has expired, we need to refresh it
    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        // Authorization: Basic <base64 encoded client_id:client_secret>
        Authorization:
          "Basic " +
          Buffer.from(
            env.SPOTIFY_CLIENT_ID + ":" + env.SPOTIFY_CLIENT_SECRET,
          ).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: spotifyAccount.refresh_token ?? "",
      }),
    });
    const tokensOrError = (await response.json()) as unknown;

    if (!response.ok) throw tokensOrError;

    const newTokens = tokensOrError as {
      access_token: string;
      expires_in: number;
      refresh_token?: string;
    };

    const result = await db
      .update(accounts)
      .set({
        access_token: newTokens.access_token,
        expires_at: Math.floor(Date.now() / 1000 + newTokens.expires_in),
        refresh_token: newTokens.refresh_token ?? spotifyAccount.refresh_token,
      })
      .where(
        and(
          eq(accounts.provider, "spotify"),
          eq(accounts.providerAccountId, spotifyAccount.providerAccountId),
        ),
      )
      .returning({
        access_token: accounts.access_token,
        expires_at: accounts.expires_at,
        refresh_token: accounts.refresh_token,
        providerAccountId: accounts.providerAccountId,
        token_type: accounts.token_type,
      });

    if (result.length > 0) {
      spotifyAccount = result[0];
    }
  }
  return spotifyAccount;
};

/**
 * Options for NextAuth.js used to configure adapters, providers, callbacks, etc.
 *
 * @see https://next-auth.js.org/configuration/options
 */
export const authOptions: NextAuthOptions = {
  callbacks: {
    session: async ({ session, user }) => {
      try {
        const spotifyAccount = await getSpotifyTokenOrRefresh(user.id);
        return {
          ...session,
          user: {
            ...session.user,
            id: user.id,
            accessToken: spotifyAccount?.access_token,
            providerAccountId: spotifyAccount?.providerAccountId,
          },
        };
      } catch (error) {
        console.error("Error refreshing access_token", error);
        // If we fail to refresh the token, return an error so we can handle it on the page
        return {
          ...session,
          user: {
            ...session.user,
            id: user.id,
            accessToken: null,
            providerAccountId: null,
          },
          error: "RefreshTokenError",
        };
      }
    },
  },
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }) as Adapter,
  providers: [
    SpotifyProvider({
      clientId: env.SPOTIFY_CLIENT_ID,
      clientSecret: env.SPOTIFY_CLIENT_SECRET,
      authorization: `https://accounts.spotify.com/authorize/?${new URLSearchParams(
        {
          scope:
            "streaming user-read-private user-read-email playlist-read-private user-read-playback-state user-modify-playback-state playlist-read-collaborative playlist-modify-public playlist-modify-private",
        },
      ).toString()}`,
    }),
  ],
};

/**
 * Wrapper for `getServerSession` so that you don't need to import the `authOptions` in every file.
 *
 * @see https://next-auth.js.org/configuration/nextjs
 */
export const getServerAuthSession = () => getServerSession(authOptions);
