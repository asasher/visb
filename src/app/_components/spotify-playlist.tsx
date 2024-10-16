"use client";

import Image from "next/image";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";
import { ScrollArea } from "~/components/ui/scroll-area";
import { forwardRef, Fragment, useCallback, useEffect, useState } from "react";
import { Button } from "~/components/ui/button";
import { ArrowDown01, Loader2 } from "lucide-react";
import { Waypoint } from "react-waypoint";
import { type Player, usePlayerStore } from "./user-player-store";

export const SpotifyPlaylist = forwardRef<Player, {}>(
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

    const incrementErrorCount = usePlayerStore(
      (state) => state.incrementErrorCount,
    );
    const resetErrorCount = usePlayerStore((state) => state.resetErrorCount);

    const { mutate: playOnDevice, isPending: isPlayOnDeviceLoading } =
      api.spotify.playOnDevice.useMutation({
        async onError(err, ctx) {
          incrementErrorCount();
          console.error(
            "Got an error while trying to play on device. Attempting to reconnect.",
            err,
          );
          if (!(playerRef && "current" in playerRef && playerRef.current)) {
            console.error("Player is not defined. Aborting reconnect.");
            return;
          }
          const player = playerRef.current;
          await reconnect(player);
        },
        onSuccess() {
          resetErrorCount();
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

        console.log("Pausing playback");
        await player.pause();

        console.log("Disconnect player");
        await player.disconnect();

        // For some reason this works better than trying to reconnect immediately
        setTimeout(() => {
          void player.connect();
        }, 5000);
      },
      [setDeviceId],
    );

    const requestedPlaylistUri = usePlayerStore(
      (state) => state.playbackRequest.playlistUri,
    );
    const requestedTrackUri = usePlayerStore(
      (state) => state.playbackRequest.trackUri,
    );
    const requestedTrackPosition = usePlayerStore(
      (state) => state.playbackRequest.trackPosition,
    );
    const setRequestedPlaylist = usePlayerStore(
      (state) => state.setRequestedPlaylist,
    );
    const setRequestedTrack = usePlayerStore(
      (state) => state.setRequestedTrack,
    );

    const restoreState = useCallback(
      async (deviceId: string) => {
        console.log(
          "Restoring state",
          requestedPlaylistUri,
          requestedTrackUri,
          requestedTrackPosition,
        );
        if (requestedPlaylistUri) {
          const playlistId = requestedPlaylistUri.split(":")[2];
          if (playlistId) {
            setActivePlaylistId(playlistId);
          }
        }
        if (
          requestedPlaylistUri &&
          (requestedTrackPosition || requestedTrackUri)
        ) {
          console.log("Playing the track");
          playOnDevice({
            deviceId,
            playlistUri: requestedPlaylistUri,
            trackUri: requestedTrackUri,
            trackPosition: requestedTrackPosition,
          });
        } else if (requestedPlaylistUri) {
          console.log("No track uri, just playing the playlist");
          playOnDevice({
            deviceId,
            playlistUri: requestedPlaylistUri,
          });
        }
      },
      [
        requestedPlaylistUri,
        requestedTrackUri,
        requestedTrackPosition,
        playOnDevice,
      ],
    );

    useEffect(() => {
      console.log("Device Id changed", deviceId);
      if (!deviceId) return;
      void restoreState(deviceId);
    }, [deviceId, restoreState]);

    const onPlaylistClick = async (playlist: { id: string; uri: string }) => {
      setActivePlaylistId(playlist.id);

      if (deviceId) {
        setRequestedPlaylist(playlist.uri);
        playOnDevice({
          deviceId,
          playlistUri: playlist.uri,
        });
      }

      if (playerRef && "current" in playerRef && playerRef.current) {
        const player = playerRef.current;
        await player.activateElement();
        await player.resume();
      }
    };

    const onTrackClick = useCallback(
      async (trackUri: string) => {
        if (!deviceId || !activePlaylist?.uri || !tracks) {
          return;
        }

        const trackPosition = tracks.pages
          .flatMap((x) => x.items)
          .findIndex((x) => x.uri === trackUri);
        setRequestedTrack(activePlaylist.uri, trackUri, trackPosition);
        playOnDevice({
          playlistUri: activePlaylist.uri,
          trackUri,
          trackPosition,
          deviceId,
        });
        if (playerRef && "current" in playerRef && playerRef.current) {
          const player = playerRef.current;
          await player.activateElement();
          await player.resume();
        }
      },
      [
        activePlaylist,
        deviceId,
        playOnDevice,
        playerRef,
        setRequestedTrack,
        tracks,
      ],
    );

    const isActionsDisabled =
      !deviceId ||
      isPlaylistsLoading ||
      isTracksLoading ||
      isFetchingMorePlaylists ||
      isFetchingMoreTracks ||
      isPlayOnDeviceLoading;

    return (
      <>
        {/* <Button
          className="mx-4 bg-red-400 hover:bg-red-500"
          onClick={() => {
            if (playerRef && "current" in playerRef && playerRef.current) {
              const player = playerRef.current;
              void reconnect(player);
            }
          }}
        >
          {"hit me to break shit or it's already broken"}
        </Button> */}
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
                          void onPlaylistClick(playlist);
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
                  {page.items.map((track) => (
                    <Button
                      className={cn(
                        "relative block h-fit w-full rounded-none border-none bg-slate-100 p-0 text-left text-black shadow-none hover:bg-slate-200",
                      )}
                      onClick={() => {
                        if (!track.uri) return;
                        void onTrackClick(track.uri);
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
