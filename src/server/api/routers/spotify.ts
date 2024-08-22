import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { SpotifyApi } from "@spotify/web-api-ts-sdk";
import { env } from "~/env";
import { getSpotifyTokenOrRefresh } from "~/server/auth";

const getSpotifySdk = async (userId: string) => {
  const spotifyAccount = await getSpotifyTokenOrRefresh(userId);

  if (!spotifyAccount) {
    throw new Error("No spotify account found");
  }

  const token = {
    access_token: spotifyAccount.access_token!,
    token_type: spotifyAccount.token_type!,
    expires_in: spotifyAccount.expires_at! - Math.floor(Date.now() / 1000),
    refresh_token: spotifyAccount.refresh_token!,
  };
  const sdk = SpotifyApi.withAccessToken(env.SPOTIFY_CLIENT_ID, token);
  return sdk;
};

export const spotifyRouter = createTRPCRouter({
  analysis: protectedProcedure
    .input(z.string().optional())
    .query(async ({ ctx, input: trackId }) => {
      if (!trackId) return null;
      const sdk = await getSpotifySdk(ctx.session.user.id);
      const features = await sdk.tracks.audioFeatures(trackId);
      return {
        ...features,
        numBeats: Math.round(
          (features.duration_ms / (1000 * 60)) * Math.round(features.tempo),
        ),
      };
    }),
});
