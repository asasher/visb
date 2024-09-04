"use client";

import Image from "next/image";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";
import { ScrollArea } from "~/components/ui/scroll-area";
import { useState } from "react";
import { Button } from "~/components/ui/button";

type SpotifyPlaylistProps = {
  deviceId: string;
};
export function SpotifyPlaylist({ deviceId }: SpotifyPlaylistProps) {
  const { data: playlists, isLoading: isPlaylistsLoading } =
    api.spotify.playlists.useQuery({
      cursor: 0,
    });
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);

  const { mutate: playOnDevice, isPending: isPlayOnDeviceLoading } =
    api.spotify.playOnDevice.useMutation();

  const { data: tracks, isLoading: isTracksLoading } =
    api.spotify.getPlaylistTracks.useQuery(
      {
        playlistId: activePlaylistId,
        cursor: 0,
      },
      {
        enabled: !!activePlaylistId,
      },
    );

  if (!playlists) return null;

  const activePlaylist = playlists.items.find((x) => x.id === activePlaylistId);

  return (
    <>
      <ScrollArea
        className={cn(
          "rounded-md border border-none p-4",
          isTracksLoading ? "animate-pulse" : "",
        )}
      >
        {!activePlaylist &&
          playlists.items.map((playlist) => (
            <Button
              className={cn(
                "relative block h-fit w-full rounded-none border-none p-0 text-left text-black shadow-none odd:bg-slate-100 even:bg-slate-50 hover:bg-slate-200",
              )}
              onClick={() => {
                setActivePlaylistId(playlist.id);
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
        {!!tracks &&
          tracks.items.map((track) => (
            <Button
              className={cn(
                "relative block h-fit w-full rounded-none border-none p-0 text-left text-black shadow-none odd:bg-slate-100 even:bg-slate-50 hover:bg-slate-200",
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
                isTracksLoading || isPlaylistsLoading || isPlayOnDeviceLoading
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
      </ScrollArea>
      {activePlaylist && (
        <Button
          className="relative h-fit w-full rounded-none bg-slate-200 p-0 text-left text-black hover:bg-slate-300"
          onClick={() => {
            setActivePlaylistId(null);
          }}
          disabled={isTracksLoading || isPlaylistsLoading}
        >
          <PlaylistCard
            playlist={activePlaylist}
            className="pointer-events-none"
          />
          <p className="pointer-events-none absolute right-4 top-1 cursor-pointer text-3xl font-black text-white">
            X
          </p>
        </Button>
      )}
    </>
  );
}

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
        <p className="inline-flex text-ellipsis text-sm">{playlist.name}</p>
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
        <p className="inline-flex text-sm">{track.name}</p>
        <p className="ms-4 inline-flex items-center text-xs">
          {Math.round(track.tempo ?? 0)} BPM
        </p>
        <p className="ms-2 inline-flex items-center text-xs">
          {track.time_signature}/4
        </p>
      </div>
    </div>
  );
}
