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
  playOnDevice: protectedProcedure
    .input(
      z.object({
        playlistUri: z.string().optional(),
        trackUri: z.string().optional(),
        deviceId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id;
      const sdk = await getSpotifySdk(userId);
      const playbackState = await sdk.player.getPlaybackState();
      if (playbackState?.device.id !== input.deviceId) {
        await sdk.player.transferPlayback([input.deviceId], true);
      }
      if (input.trackUri) {
        await sdk.player.startResumePlayback(input.deviceId, undefined, [
          input.trackUri,
        ]);
      } else if (input.playlistUri) {
        await sdk.player.startResumePlayback(input.deviceId, input.playlistUri);
      }
    }),
  addToQueue: protectedProcedure
    .input(
      z.object({
        deviceId: z.string(),
        trackUri: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id;
      const sdk = await getSpotifySdk(userId);
      const playbackState = await sdk.player.getPlaybackState();
      if (playbackState.device.id !== input.deviceId) {
        await sdk.player.transferPlayback([input.deviceId], true);
      }
      await sdk.player.addItemToPlaybackQueue(input.trackUri, input.deviceId);
    }),
  playlists: protectedProcedure
    .input(
      z.object({
        cursor: z.number().default(0),
      }),
    )
    .query(async ({ ctx, input: { cursor } }) => {
      const limit = 50;
      const userId = ctx.session.user.id;
      const spotifyUserId = ctx.session.user.providerAccountId;
      const sdk = await getSpotifySdk(userId);
      const playlists = await sdk.playlists.getUsersPlaylists(
        spotifyUserId,
        limit,
        cursor,
      );
      return {
        items: playlists.items.map((playlist) => ({
          id: playlist.id,
          name: playlist.name,
          totalTracks: playlist.tracks.total,
          imageUrl: playlist.images[0]?.url,
          uri: playlist.uri,
        })),
        nextCursor: cursor + limit,
      };
    }),
  getPlaylistTracks: protectedProcedure
    .input(
      z.object({
        playlistId: z.string().nullable(),
        cursor: z.number().default(0),
      }),
    )
    .query(async ({ ctx, input: { playlistId, cursor } }) => {
      if (!playlistId)
        return {
          items: [],
          nextCursor: cursor,
        };
      const limit = 50;
      const userId = ctx.session.user.id;
      const sdk = await getSpotifySdk(userId);
      const playlistTracks = await sdk.playlists.getPlaylistItems(
        playlistId,
        undefined,
        undefined,
        limit,
        cursor,
      );
      const trackIds = playlistTracks.items.map((track) => track.track.id);
      const trackFeatures = await sdk.tracks.audioFeatures(trackIds);
      return {
        items: playlistTracks.items.map((track) => ({
          id: track.track.id,
          name: track.track.name,
          imageUrl: track.track.album.images[0]?.url,
          duration: track.track.duration_ms,
          ...trackFeatures.find((feature) => feature.id === track.track.id),
        })),
        nextCursor: cursor + limit,
      };
    }),
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

      return {
        ...features,
        numBeats: Math.round(
          (features.duration_ms / (1000 * 60)) * Math.round(features.tempo),
        ),
        beats: normalizedBeats,
      };
    }),
});
