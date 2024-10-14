import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import IntervalTree from "@flatten-js/interval-tree";
import { chunk, isDefined } from "~/lib/utils";
import { eq, inArray } from "drizzle-orm";
import { tracks } from "~/server/db/schema";
import { getSpotifySdk } from "~/server/lib/spotify";
import { type Market } from "@spotify/web-api-ts-sdk";

export const spotifyRouter = createTRPCRouter({
  sortByTempo: protectedProcedure
    .input(
      z.object({
        spotifyPlaylistId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id;
      const sdk = await getSpotifySdk(userId);
      const spotifyUserProfile = await sdk.currentUser.profile();
      const playlistTracks = await sdk.playlists.getPlaylistItems(
        input.spotifyPlaylistId,
        spotifyUserProfile.country as Market,
      );
      const trackIds = playlistTracks.items.map((track) => track.track.id);
      const features = await sdk.tracks.audioFeatures(trackIds);
      console.log(`Got ${features.length} features`);
      const ourTracks = await ctx.db.query.tracks.findMany({
        where: inArray(tracks.spotifyTrackId, trackIds),
      });
      const trackTempos = playlistTracks.items.map((track) => ({
        uri: track.track.uri,
        tempo:
          ourTracks.find((x) => x.spotifyTrackId === track.track.id)
            ?.userTapTempo ??
          features.find((feature) => feature?.id === track.track.id)?.tempo ??
          0,
      }));
      const sortedTracks = trackTempos.sort((a, b) => a.tempo - b.tempo);
      const sortTracksUris = sortedTracks.map((track) => track.uri);
      const chunks = chunk(sortTracksUris, 100); // 100 is the max number of tracks per playlist that spotify allows
      await sdk.playlists.updatePlaylistItems(input.spotifyPlaylistId, {
        uris: chunks[0],
      });
      if (chunks.length > 1) {
        // Add the rest of the tracks to the playlist at the end
        for (let i = 1; i < chunks.length; i++) {
          await sdk.playlists.addItemsToPlaylist(
            input.spotifyPlaylistId,
            chunks[i],
          );
        }
      }
    }),
  playOnDevice: protectedProcedure
    .input(
      z.object({
        playlistUri: z.string(),
        trackUri: z.string().optional(),
        trackPosition: z.number().optional(),
        deviceId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id;
      const sdk = await getSpotifySdk(userId);

      const playerDevices = await sdk.player.getAvailableDevices();
      const inputDevice = playerDevices.devices.find(
        (x) => x.id === input.deviceId,
      );
      if (!inputDevice) {
        throw new Error("Input device is not available");
      }

      const playbackState = await sdk.player.getPlaybackState();
      if (playbackState?.device.id !== inputDevice.id) {
        console.log("Transferring playback to current device");
        await sdk.player.transferPlayback([input.deviceId], true);
      }

      // If trackUri is set then use that other wise play the first song
      let trackPosition = input.trackUri ? undefined : 0;

      // If input has track position then prefer that over the trackUri
      if (input.trackPosition) {
        trackPosition = input.trackPosition;
      }

      // Some tracks only play when I send position, there is some weird shit happening
      // maybe it's due to the relinking stuff Spotify does
      await sdk.player.startResumePlayback(
        input.deviceId,
        input.playlistUri,
        undefined,
        trackPosition
          ? { position: trackPosition }
          : input.trackUri
            ? { uri: input.trackUri }
            : undefined,
      );
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
      const items = playlists.items
        .filter((playlist) => playlist.owner.id === spotifyUserId)
        .map((playlist) => ({
          id: playlist.id,
          name: playlist.name,
          totalTracks: playlist.tracks.total,
          imageUrl: playlist.images[0]?.url,
          uri: playlist.uri,
        }));
      const nextCursor = playlists.next ? cursor + limit : undefined;
      return {
        items,
        nextCursor,
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
      const spotifyUserProfile = await sdk.currentUser.profile();
      const playlistTracks = await sdk.playlists.getPlaylistItems(
        playlistId,
        spotifyUserProfile.country as Market,
        undefined,
        limit,
        cursor,
      );
      console.log("Reading Track Ids");
      const trackIds = playlistTracks.items.map((track) => track.track.id);
      const trackFeatures = await sdk.tracks.audioFeatures(trackIds);
      console.log("Reading Our Tracks");
      const ourTracks = await ctx.db.query.tracks.findMany({
        where: inArray(tracks.spotifyTrackId, trackIds),
      });
      const spotifyTracks = playlistTracks.items.map((track) => ({
        id: track.track.id,
        name: track.track.name,
        imageUrl: track.track.album.images[0]?.url,
        duration: track.track.duration_ms,
        isRestricted: !!track.track.restrictions?.reason,
        ...trackFeatures.find((feature) => feature?.id === track.track.id),
      }));
      const combinedTracks = spotifyTracks.map((track) => ({
        ...track,
        ...ourTracks.find((ourTrack) => ourTrack.spotifyTrackId === track.id),
      }));
      return {
        items: combinedTracks,
        nextCursor: playlistTracks.next ? cursor + limit : undefined,
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

      const ourTrack = await ctx.db.query.tracks.findFirst({
        where: eq(tracks.spotifyTrackId, trackId),
      });

      return {
        ...features,
        numBeats: Math.round(
          (features.duration_ms / (1000 * 60)) * Math.round(features.tempo),
        ),
        beats: normalizedBeats,
        ...ourTrack,
      };
    }),
});
