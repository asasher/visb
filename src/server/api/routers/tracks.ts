import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { buildConflictUpdateColumns } from "~/lib/utils";
import { and, eq, inArray, not } from "drizzle-orm";
import { trackSlices } from "~/server/db/schema";

export const tracksRouter = createTRPCRouter({
  getSlices: protectedProcedure
    .input(z.string().optional())
    .query(async ({ ctx, input: trackId }) => {
      if (!trackId) return [];
      const slices = await ctx.db.query.trackSlices.findMany({
        where: eq(trackSlices.spotifyTrackId, trackId),
      });
      return slices.map((slice) => ({
        id: slice.id,
        startPosition: slice.startPosition,
        endPosition: slice.endPosition,
        shouldPlay: slice.shouldPlay,
      }));
    }),
  upsertSlices: protectedProcedure
    .input(
      z.object({
        trackId: z.string(),
        slices: z.array(
          z.object({
            id: z.string(),
            startPosition: z.number().min(0),
            endPosition: z.number().min(1),
            shouldPlay: z.boolean(),
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input: { trackId, slices } }) => {
      const values = slices.map((slice) => ({
        id: slice.id,
        spotifyTrackId: trackId,
        startPosition: Math.round(slice.startPosition),
        endPosition: Math.round(slice.endPosition),
        shouldPlay: slice.shouldPlay,
      }));
      const sliceIds = slices.map((slice) => slice.id);

      if (sliceIds.length === 0) {
        await ctx.db
          .delete(trackSlices)
          .where(eq(trackSlices.spotifyTrackId, trackId));
        return;
      }

      await ctx.db.transaction(async (trx) => {
        await trx
          .delete(trackSlices)
          .where(
            and(
              eq(trackSlices.spotifyTrackId, trackId),
              not(inArray(trackSlices.id, sliceIds)),
            ),
          );

        await trx
          .insert(trackSlices)
          .values(values)
          .onConflictDoUpdate({
            target: [trackSlices.id, trackSlices.spotifyTrackId],
            set: buildConflictUpdateColumns(trackSlices, [
              "startPosition",
              "endPosition",
              "shouldPlay",
            ]),
          });
      });
    }),
});
