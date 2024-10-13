"use client";

import Image from "next/image";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";
import { ScrollArea } from "~/components/ui/scroll-area";
import { forwardRef, Fragment, useCallback, useEffect, useState } from "react";
import { Button } from "~/components/ui/button";
import { ArrowDown01, Loader2 } from "lucide-react";
import { Waypoint } from "react-waypoint";
import { captureException } from "@sentry/nextjs";
import { Player, usePlayerStore } from "./user-player-store";

export const SpotifyPlaylist = forwardRef(
  function SpotifyPlaylist(props, playerRef) {
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
    const [activePlaylistId, setActivePlaylistId] = useState<string | null>(
      null,
    );

    const { mutate: playOnDevice, isPending: isPlayOnDeviceLoading } =
      api.spotify.playOnDevice.useMutation({
        async onSettled(data, input, ctx) {
          if (playerRef && "current" in playerRef && playerRef.current) {
            console.log("Play on device settled. Resuming player.");
            const player = playerRef.current as Player;
            const state = await player.getCurrentState();
            if (state?.context?.uri !== ctx.playlistUri) {
              console.log("Reconnecting player just in case it's broken");
              const isConnected = await player.connect();
              console.log("Is player re-connected", isConnected);
              captureException(
                new Error("Player's context uri is not the playlist uri"),
              );
              // Attempt to reconnect
              await reconnect(player);
            }
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

    const setDeviceId = usePlayerStore((state) => state.setDeviceId);
    const deviceId = usePlayerStore((state) => state.player.deviceId);

    const reconnect = useCallback(
      async (player: Player) => {
        setDeviceId(null);

        const state = await player.getCurrentState();
        console.log(
          "Context",
          state?.context.uri,
          state?.track_window.current_track,
        );

        console.log("Pausing playback");
        await player.pause();

        console.log("Disconnect player");
        await player.disconnect();

        console.log("Activating element");
        await player.activateElement();

        // For some reason this works better than trying to reconnect immediately
        setTimeout(() => {
          void player.connect();
        }, 5000);
      },
      [deviceId, setDeviceId],
    );

    const restoreState = async (deviceId: string) => {
      if (playerRef && "current" in playerRef && playerRef.current) {
        console.log("Play on device settled. Resuming player.");
        const player = playerRef.current as Player;
        const state = await player.getCurrentState();
        console.log("Resuming playback", deviceId);
        if (state?.context?.uri && state?.track_window?.current_track?.uri) {
          console.log("Playing the track");
          playOnDevice({
            deviceId,
            playlistUri: state.context.uri,
            trackUri: state.track_window.current_track.uri,
          });
        } else if (state?.context?.uri) {
          console.log("No track uri, just playing the playlist");
          playOnDevice({
            deviceId,
            playlistUri: state.context.uri,
          });
        }
        if (state?.context?.uri) {
          const playlistId = state.context.uri.split(":")[2];
          if (playlistId) {
            setActivePlaylistId(playlistId);
          }
        }
      }
    };

    useEffect(() => {
      console.log("Device Id changed", deviceId);
      if (!deviceId) return;
      void restoreState(deviceId);
    }, [deviceId]);

    const isActionsDisabled =
      !deviceId ||
      isPlaylistsLoading ||
      isTracksLoading ||
      isFetchingMorePlaylists ||
      isFetchingMoreTracks ||
      isPlayOnDeviceLoading;

    return (
      <>
        <Button
          className="mx-4 bg-red-400 hover:bg-red-500"
          onClick={() => {
            if (playerRef && "current" in playerRef && playerRef.current) {
              const player = playerRef.current as Player;
              void reconnect(player);
            }
          }}
        >
          {"hit me if shit's broken"}
        </Button>
        {activePlaylist && (
          <div className="relative mx-4 flex min-h-10 items-start justify-between overflow-hidden bg-green-500 p-0 text-left text-white">
            <PlaylistCard
              playlist={activePlaylist}
              className="pointer-events-none"
            />
            <SortPlaylistByTempoButton
              className="px-4 py-1"
              spotifyPlaylistId={activePlaylist.id}
              disabled={isActionsDisabled}
            />
            <Button
              className="rounded-none py-1"
              onClick={() => {
                setActivePlaylistId(null);
              }}
              variant={"ghost"}
              disabled={isActionsDisabled}
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
                          if (deviceId) {
                            void playOnDevice({
                              deviceId,
                              playlistUri: playlist.uri,
                            });
                          }
                        }}
                        disabled={isActionsDisabled}
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
                  {page.items.map((track, j) => (
                    <Button
                      className={cn(
                        "relative block h-fit w-full rounded-none border-none bg-slate-100 p-0 text-left text-black shadow-none hover:bg-slate-200",
                      )}
                      onClick={() => {
                        if (!deviceId || !activePlaylist?.uri || !track.uri) {
                          return;
                        }

                        playOnDevice({
                          playlistUri: activePlaylist?.uri,
                          trackUri: track.uri,
                          trackPosition: tracks.pages
                            .flatMap((x) => x.items)
                            .findIndex((x) => x.uri === track.uri),
                          deviceId,
                        });
                      }}
                      disabled={isActionsDisabled || track.isRestricted}
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
  },
);

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
    isRestricted?: boolean;
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
        <p
          className={cn(
            "inline-flex max-w-48 overflow-hidden text-sm md:max-w-none",
            track.isRestricted ? "line-through" : "",
          )}
        >
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
