import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { SpotifyApi } from "@spotify/web-api-ts-sdk";
import { env } from "~/env";
import { getSpotifyTokenOrRefresh } from "~/server/auth";
import IntervalTree from "@flatten-js/interval-tree";
import { isDefined } from "~/lib/utils";

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
      const analysis = await sdk.tracks.audioAnalysis(trackId);

      const segmentsTree = new IntervalTree<
        (typeof analysis.segments)[number]
      >();
      analysis.segments.forEach((segment) => {
        segmentsTree.insert(
          [segment.start, segment.start + segment.duration],
          segment,
        );
      });
      const beats = analysis.beats
        .map((beat) => {
          const segments = segmentsTree.search([
            beat.start,
            beat.start + beat.duration,
          ]);
          if (!segments || segments.length === 0) return null;
          const segment = segments[0] as (typeof analysis.segments)[number];
          return {
            position: beat.start * 1000,
            value: segment.timbre[0] ?? 0, // avg loudness
          };
        })
        .filter(isDefined);

      const minLoudnessBeats = Math.min(...beats.map((beat) => beat?.value));
      const maxLoudnessBeats = Math.max(...beats.map((beat) => beat?.value));

      const normalizedBeats = beats.map((beat) => {
        return {
          ...beat,
          value:
            (beat.value - minLoudnessBeats) /
            (maxLoudnessBeats - minLoudnessBeats),
        };
      });

      console.log("Min loudness beats", minLoudnessBeats);
      return {
        ...features,
        numBeats: Math.round(
          (features.duration_ms / (1000 * 60)) * Math.round(features.tempo),
        ),
        beats: normalizedBeats,
      };
    }),
});
