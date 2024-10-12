"use client";

import Image from "next/image";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";
import { ScrollArea } from "~/components/ui/scroll-area";
import {
  forwardRef,
  Fragment,
  MutableRefObject,
  Ref,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Button } from "~/components/ui/button";
import { ArrowDown01, Loader2 } from "lucide-react";
import { Waypoint } from "react-waypoint";
import { Player } from "./spotify-player";
import { captureException } from "@sentry/nextjs";

type SpotifyPlaylistProps = {
  deviceId: string;
};
export const SpotifyPlaylist = forwardRef(function SpotifyPlaylist(
  { deviceId }: SpotifyPlaylistProps,
  playerRef,
) {
  const {
    data: playlists,
    isLoading: isPlaylistsLoading,
    fetchNextPage: fetchMorePlaylists,
    hasNextPage: hasMorePlaylists,
    isFetchingNextPage: isFetchingMorePlaylists,
  } = api.spotify.playlists.useInfiniteQuery(
    {
      cursor: 0,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      initialCursor: 0,
    },
  );
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);

  const { mutate: playOnDevice, isPending: isPlayOnDeviceLoading } =
    api.spotify.playOnDevice.useMutation({
      async onSettled(data, input, ctx) {
        if (playerRef && "current" in playerRef && playerRef.current) {
          console.log("Play on device settled. Resuming player.");
          const player = playerRef.current as Player;
          const state = await player.getCurrentState();
          console.log("Device Id", ctx.deviceId);
          console.log("Playlist Uri", ctx.playlistUri);
          console.log("Track Uri", ctx.trackUri);
          console.log(
            "State",
            state,
            state.context,
            state.context.metadata,
            state.track_window,
            state.disallows,
          );
          if (state?.context?.uri !== ctx.playlistUri) {
            console.log("Reconnecting player just in case it's broken");
            captureException(
              new Error("Player's context uri is not the playlist uri"),
            );
            await player.connect();
          }
          await player.resume();
        }
      },
    });

  const {
    data: tracks,
    isLoading: isTracksLoading,
    hasNextPage: hasMoreTracks,
    fetchNextPage: fetchMoreTracks,
    isFetchingNextPage: isFetchingMoreTracks,
  } = api.spotify.getPlaylistTracks.useInfiniteQuery(
    {
      playlistId: activePlaylistId,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      initialCursor: 0,
      enabled: !!activePlaylistId,
    },
  );

  const activePlaylist = playlists?.pages
    .flatMap((x) => x.items)
    .find((x) => x.id === activePlaylistId);

  return (
    <>
      {activePlaylist && (
        <div className="relative mx-4 flex min-h-10 items-start justify-between overflow-hidden bg-green-500 p-0 text-left text-white">
          <PlaylistCard
            playlist={activePlaylist}
            className="pointer-events-none"
          />
          <SortPlaylistByTempoButton
            className="px-4 py-1"
            spotifyPlaylistId={activePlaylist.id}
            disabled={isPlaylistsLoading || isTracksLoading}
          />
          <Button
            className="rounded-none py-1"
            onClick={() => {
              setActivePlaylistId(null);
            }}
            variant={"ghost"}
            disabled={isTracksLoading || isPlaylistsLoading}
          >
            {"<--"}
          </Button>
        </div>
      )}
      {
        <ScrollArea
          className={cn(
            "mx-4 mb-4 h-full border-none",
            isTracksLoading ? "animate-pulse" : "",
            activePlaylist ? "rounded-t-none" : "",
          )}
        >
          {!activePlaylist && (
            <>
              {playlists?.pages.map((page, i) => (
                <Fragment key={i}>
                  {page.items.map((playlist) => (
                    <Button
                      className={cn(
                        "relative block h-fit w-full rounded-none border-none bg-slate-100 p-0 text-left text-black shadow-none hover:bg-slate-200",
                      )}
                      onClick={() => {
                        setActivePlaylistId(playlist.id);
                        if (
                          playerRef &&
                          "current" in playerRef &&
                          playerRef.current
                        ) {
                          const player = playerRef.current as Player;
                          void player.activateElement();
                        }
                        void playOnDevice({
                          deviceId,
                          playlistUri: playlist.uri,
                        });
                      }}
                      disabled={isTracksLoading || isPlaylistsLoading}
                      key={playlist.id}
                    >
                      <PlaylistCard
                        playlist={playlist}
                        className="pointer-events-none"
                      />
                      <p className="pointer-events-none absolute right-4 top-3 text-xs">
                        Play
                      </p>
                    </Button>
                  ))}
                </Fragment>
              ))}
              {(isPlaylistsLoading || isFetchingMorePlaylists) && (
                <>
                  <div className="flex h-10 w-full animate-pulse bg-slate-50 odd:bg-slate-100 even:bg-slate-50"></div>
                  <div className="flex h-10 w-full animate-pulse bg-slate-50 odd:bg-slate-100 even:bg-slate-50"></div>
                  <div className="flex h-10 w-full animate-pulse bg-slate-50 odd:bg-slate-100 even:bg-slate-50"></div>
                </>
              )}
              {hasMorePlaylists && !isFetchingMorePlaylists && (
                <Waypoint onEnter={() => fetchMorePlaylists()} />
              )}
            </>
          )}

          {!!tracks &&
            tracks.pages.map((page, i) => (
              <Fragment key={i}>
                {page.items.map((track) => (
                  <Button
                    className={cn(
                      "relative block h-fit w-full rounded-none border-none bg-slate-100 p-0 text-left text-black shadow-none hover:bg-slate-200",
                    )}
                    onClick={() =>
                      track.uri &&
                      playOnDevice({
                        playlistUri: activePlaylist?.uri,
                        trackUri: track.uri,
                        deviceId,
                      })
                    }
                    disabled={
                      isTracksLoading ||
                      isPlaylistsLoading ||
                      isPlayOnDeviceLoading
                    }
                    key={track.id}
                  >
                    <TrackCard
                      track={track}
                      className="cursor-pointer odd:bg-slate-100 even:bg-slate-50 hover:bg-slate-200"
                    />
                    <p className="pointer-events-none absolute right-4 top-3 text-xs">
                      Play
                    </p>
                  </Button>
                ))}
              </Fragment>
            ))}
          {(isTracksLoading || isFetchingMoreTracks) && (
            <>
              <div className="flex h-10 w-full animate-pulse bg-slate-50 odd:bg-slate-100 even:bg-slate-50"></div>
              <div className="flex h-10 w-full animate-pulse bg-slate-50 odd:bg-slate-100 even:bg-slate-50"></div>
              <div className="flex h-10 w-full animate-pulse bg-slate-50 odd:bg-slate-100 even:bg-slate-50"></div>
            </>
          )}
          {hasMoreTracks && !isFetchingMoreTracks && (
            <Waypoint onEnter={() => fetchMoreTracks()} />
          )}
        </ScrollArea>
      }
    </>
  );
});

type CoverImageProps = {
  className?: string;
  imageUrl?: string;
  alt?: string;
};
function CoverImage({ imageUrl, alt, className }: CoverImageProps) {
  return (
    imageUrl && (
      <div className={cn("relative h-full w-full", className)}>
        <Image
          sizes="100%"
          className="object-cover"
          src={imageUrl}
          alt={alt ?? ""}
          fill={true}
        />
      </div>
    )
  );
}

type PlaylistCardProps = {
  playlist: {
    id: string;
    name: string;
    imageUrl?: string;
    totalTracks: number;
  };
  className?: string;
  onClick?: () => void;
};
function PlaylistCard({ playlist, className, onClick }: PlaylistCardProps) {
  return (
    <div
      key={playlist.id}
      onClick={onClick}
      className={cn("flex w-full items-center justify-start gap-2", className)}
    >
      <CoverImage
        className="h-10 w-10"
        imageUrl={playlist.imageUrl}
        alt={playlist.name}
      />
      <div>
        <p className="inline-flex max-w-48 overflow-hidden text-sm md:max-w-none">
          {playlist.name}
        </p>
        <p className="ms-4 inline-flex text-xs">
          {playlist.totalTracks} TRACKS
        </p>
      </div>
    </div>
  );
}

type TrackCardProps = {
  track: {
    id: string;
    name: string;
    imageUrl?: string;
    tempo?: number;
    time_signature?: number;
    userTapTempo?: number | null;
  };
  className?: string;
  onClick?: () => void;
};
function TrackCard({ track, className, onClick }: TrackCardProps) {
  return (
    <div
      key={track.id}
      className={cn("flex w-full items-center justify-start gap-2", className)}
      onClick={onClick}
    >
      <CoverImage
        className="h-10 w-10"
        imageUrl={track.imageUrl}
        alt={track.name}
      />
      <div className="w-8/12 overflow-x-scroll">
        <p className="inline-flex max-w-48 overflow-hidden text-sm md:max-w-none">
          {track.name}
        </p>
        <p className="ms-4 inline-flex items-center text-xs">
          {Math.round(track.userTapTempo ?? track.tempo ?? 0)} BPM
        </p>
        <p className="ms-2 inline-flex items-center text-xs">
          {track.time_signature}/4
        </p>
      </div>
    </div>
  );
}

function SortPlaylistByTempoButton({
  spotifyPlaylistId,
  disabled,
  className,
}: {
  spotifyPlaylistId: string;
  disabled: boolean;
  className: string;
}) {
  const utils = api.useUtils();
  const { mutate: sortByTempo, isPending } =
    api.spotify.sortByTempo.useMutation({
      async onSettled() {
        await utils.spotify.getPlaylistTracks.invalidate({
          playlistId: spotifyPlaylistId,
        });
      },
    });
  return (
    <Button
      variant={"ghost"}
      className={cn(className)}
      onClick={() => {
        sortByTempo({
          spotifyPlaylistId,
        });
      }}
      disabled={disabled}
    >
      {isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <ArrowDown01 className="h-4 w-4" />
      )}
    </Button>
  );
}
