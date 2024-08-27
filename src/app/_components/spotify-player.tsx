"use client";

import Image from "next/image";
import React, { useState, useEffect, useRef, Fragment } from "react";
import { useDrag } from "@use-gesture/react";
import { api } from "~/trpc/react";
import { useAnimationFrame } from "~/lib/hooks";
import { Waveform } from "./waveform";
import { cn } from "~/lib/utils";

// {
//   uri: "spotify:track:xxxx", // Spotify URI
//   id: "xxxx",                // Spotify ID from URI (can be null)
//   type: "track",             // Content type: can be "track", "episode" or "ad"
//   media_type: "audio",       // Type of file: can be "audio" or "video"
//   name: "Song Name",         // Name of content
//   is_playable: true,         // Flag indicating whether it can be played
//   album: {
//     uri: 'spotify:album:xxxx', // Spotify Album URI
//     name: 'Album Name',
//     images: [
//       { url: "https://image/xxxx" }
//     ]
//   },
//   artists: [
//     { uri: 'spotify:artist:xxxx', name: "Artist Name" }
//   ]
// }
type WebPlaybackTrack = {
  uri: string;
  id: string;
  type: "track" | "episode" | "ad";
  media_type: "audio" | "video";
  name: string;
  is_playable: boolean;
  album: {
    uri: string;
    name: string;
    images: {
      url: string;
    }[];
  };
  artists: {
    uri: string;
    name: string;
  }[];
};

// {
//   context: {
//     uri: 'spotify:album:xxx', // The URI of the context (can be null)
//     metadata: {},             // Additional metadata for the context (can be null)
//   },
//   disallows: {                // A simplified set of restriction controls for
//     pausing: false,           // The current track. By default, these fields
//     peeking_next: false,      // will either be set to false or undefined, which
//     peeking_prev: false,      // indicates that the particular operation is
//     resuming: false,          // allowed. When the field is set to `true`, this
//     seeking: false,           // means that the operation is not permitted. For
//     skipping_next: false,     // example, `skipping_next`, `skipping_prev` and
//     skipping_prev: false      // `seeking` will be set to `true` when playing an
//                               // ad track.
//   },
//   paused: false,  // Whether the current track is paused.
//   position: 0,    // The position_ms of the current track.
//   repeat_mode: 0, // The repeat mode. No repeat mode is 0,
//                   // repeat context is 1 and repeat track is 2.
//   shuffle: false, // True if shuffled, false otherwise.
//   track_window: {
//     current_track: <WebPlaybackTrack>,                              // The track currently on local playback
//     previous_tracks: [<WebPlaybackTrack>, <WebPlaybackTrack>, ...], // Previously played tracks. Number can vary.
//     next_tracks: [<WebPlaybackTrack>, <WebPlaybackTrack>, ...]      // Tracks queued next. Number can vary.
//   }
// }
type WebPlaybackState = {
  context: {
    uri: string;
    metadata: Record<string, unknown>;
  };
  disallows: {
    pausing: boolean;
    peeking_next: boolean;
    peeking_prev: boolean;
    resuming: boolean;
    seeking: boolean;
    skipping_next: boolean;
    skipping_prev: boolean;
  };
  paused: boolean;
  position: number;
  duration: number;
  repeat_mode: number;
  shuffle: boolean;
  track_window: {
    current_track: WebPlaybackTrack;
    previous_tracks: WebPlaybackTrack[];
    next_tracks: WebPlaybackTrack[];
  };
};

type PlayerStateChangedListener = (
  event: "player_state_changed",
  cb: (data: WebPlaybackState) => void,
) => void;
type ReadyNotReadyListener = (
  event: "ready" | "not_ready",
  cb: (data: { device_id: string }) => void,
) => void;

type PlayerProps = {
  name: string;
  getOAuthToken: (cb: (token: string) => void) => void;
  volume: number;
};
interface Player {
  nextTrack(): unknown;
  previousTrack(): unknown;
  setName(arg0: string): unknown;
  togglePlay(): Promise<void>;
  seek(position: number): Promise<void>;
  getCurrentState(): Promise<WebPlaybackState>;
  connect: () => Promise<boolean>;
  addListener: ReadyNotReadyListener & PlayerStateChangedListener;
}
type PlayerConstructable = new (args: PlayerProps) => Player;
type Spotify = {
  Player: PlayerConstructable;
};

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady: () => void;
    Spotify: Spotify;
  }
}

type Slice = {
  startPosition: number;
  endPosition: number;
  shouldPlay: boolean;
};

type SpotifyPlayerProps = {
  token: string;
};
export function SpotifyPlayer({ token }: SpotifyPlayerProps) {
  const playerRef = useRef<Player>();
  const [paused, setPaused] = useState(true);
  const [duration, setDuration] = useState(1);
  const [position, setPosition] = useState(0);
  const [track, setTrack] = useState<WebPlaybackTrack>();
  const [prevTrack, setPrevTrack] = useState<WebPlaybackTrack>();
  const [nextTrack, setNextTrack] = useState<WebPlaybackTrack>();
  const [isPointerDown, setIsPointerDown] = useState(false);
  const [active, setActive] = useState(false);
  const { data: trackAnalysis } = api.spotify.analysis.useQuery(track?.id, {
    enabled: !!track,
  });
  const [slices, setSlices] = useState<Slice[]>([
    {
      startPosition: 0,
      endPosition: 18000,
      shouldPlay: false,
    },
    {
      startPosition: 79000,
      endPosition: 137060,
      shouldPlay: false,
    },
  ]);

  useAnimationFrame((deltaTime) => {
    if (paused) return;
    setPosition((prevPosition) => Math.min(prevPosition + deltaTime, duration));
  });

  useEffect(() => {
    const currentSlice = slices.find(
      (slice) =>
        slice.startPosition <= position && position <= slice.endPosition,
    );
    if (!currentSlice) return;
    if (!currentSlice?.shouldPlay) {
      void playerRef.current?.seek(currentSlice?.endPosition);
    }
  }, [position, slices]);

  const enabled = active && track;

  useEffect(() => {
    if (!token) return;
    if (playerRef.current) return; // We already have a player no need to create a new one

    const script = document.createElement("script");
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.async = true;

    document.body.appendChild(script);

    window.onSpotifyWebPlaybackSDKReady = () => {
      const player = new window.Spotify.Player({
        name: "Web Playback SDK",
        getOAuthToken: (cb) => {
          cb(token);
        },
        volume: 0.5,
      });
      playerRef.current = player;

      player.setName("Rock DJ");

      player.addListener("ready", ({ device_id }) => {
        console.log("Ready with Device ID", device_id);
      });

      player.addListener("not_ready", ({ device_id }) => {
        console.log("Device ID has gone offline", device_id);
      });

      player.addListener("player_state_changed", (state) => {
        setPaused(state?.paused ?? true);
        setDuration(state?.duration ?? 0);
        setPosition(state?.position ?? 0);
        setTrack(state?.track_window?.current_track);
        setPrevTrack(state?.track_window?.previous_tracks[0]);
        setNextTrack(state?.track_window?.next_tracks[0]);

        void player.getCurrentState().then((state) => {
          setActive(!!state);
        });
      });

      void player.connect();
    };
  }, [token]);

  const bind = useDrag(({ down, delta: [dx], args, target }) => {
    const i: number = args[0];
    const handle: "start" | "end" = args[1];
    if (!(target instanceof HTMLDivElement)) return;

    const containerDims = target.parentElement?.getBoundingClientRect();
    if (!containerDims) return;

    const containerLeft = containerDims.left;
    const containerRight = containerDims.right;
    const containerWidth = containerRight - containerLeft;

    const handleDims = target.getBoundingClientRect();
    const handleAnchorOffset =
      (handle === "start" ? handleDims.left : handleDims.right) - containerLeft;

    const newHandleAnchorOffset = handleAnchorOffset + dx;
    const newAnchorPositionRatio = newHandleAnchorOffset / containerWidth;

    const newPosition = newAnchorPositionRatio * duration;
    const boundedNewPosition = Math.max(0, Math.min(newPosition, duration));

    console.log(
      i,
      handle,
      containerLeft,
      handleDims.left,
      handleDims.right,
      handleAnchorOffset,
      newHandleAnchorOffset,
      newPosition,
      boundedNewPosition,
      dx,
    );

    setSlices((prevSlices) => {
      const prevSlice = slices[i];
      if (!prevSlice) return prevSlices;

      const newSlice = {
        ...prevSlice,
        [handle === "start" ? "startPosition" : "endPosition"]:
          boundedNewPosition,
      };
      return [...prevSlices.slice(0, i), newSlice, ...prevSlices.slice(i + 1)];
    });

    // setSlices((prevSlices) => {
    //   const prevSlice = prevSlices[i]!;
    //   const newSlice =
    //     handle === "start"
    //       ? {
    //           ...prevSlice,
    //           startPosition: boundedNewPosition,
    //         }
    //       : {
    //           ...prevSlice,
    //           endPosition: boundedNewPosition,
    //         };
    //   return [...prevSlices.slice(0, i), newSlice, ...prevSlices.slice(i + 1)];
    // });
  });

  return (
    <div className="grid w-full grid-cols-12 items-end justify-center">
      <div className="relative col-span-full h-32">
        <div
          className={`relative h-full w-full ${enabled ? "bg-green-600" : "bg-gray-100"} `}
          onPointerDown={(e) => {
            setIsPointerDown(true);
            window.addEventListener(
              "pointerup",
              () => {
                setIsPointerDown(false);
              },
              { once: true },
            );

            const boundingRect = e.currentTarget.getBoundingClientRect();
            const clickXRelativeToStart = e.pageX - boundingRect.left;
            const width = boundingRect.right - boundingRect.left;
            const progressRatio = clickXRelativeToStart / width;
            const newPosition = progressRatio * duration;

            if (playerRef.current) void playerRef.current?.seek(newPosition);
          }}
          onPointerMove={(e) => {
            if (!isPointerDown) return;
            const boundingRect = e.currentTarget.getBoundingClientRect();
            const clickXRelativeToStart = e.pageX - boundingRect.left;
            const width = boundingRect.right - boundingRect.left;
            const progressRatio = clickXRelativeToStart / width;
            const newPosition = progressRatio * duration;
            if (playerRef.current) void playerRef.current?.seek(newPosition);
          }}
        >
          {duration && trackAnalysis?.beats && (
            <div className="absolute left-0 top-0 h-full w-full">
              <Waveform duration={duration} beats={trackAnalysis.beats} />
            </div>
          )}
          <div
            className={`h-full ${enabled ? "bg-green-700" : "bg-gray-500"}`}
            style={{ width: `${(100 * position) / duration}%` }}
          ></div>
        </div>
        {duration > 1 &&
          slices.map((slice, i) => (
            <Fragment key={i}>
              <div
                className="absolute top-0 h-full bg-slate-700 opacity-20"
                style={{
                  width: `${(100 * (slice.endPosition - slice.startPosition)) / duration}%`,
                  left: `${(100 * slice.startPosition) / duration}%`,
                }}
              ></div>
              <div
                {...bind(i, "start")}
                className="absolute top-0 h-full w-4 touch-none border-s border-white"
                style={{
                  left: `${(100 * slice.startPosition) / duration}%`,
                }}
              >
                <div className="absolute top-1/4 h-1/2 w-full rounded-e-md bg-white"></div>
              </div>
              <div
                {...bind(i, "end")}
                className="absolute top-0 h-full w-4 touch-none border-e border-white"
                style={{
                  left: `calc(${(100 * slice.endPosition) / duration}% - 1rem)`,
                }}
              >
                <div className="absolute top-1/4 h-1/2 w-full rounded-s-md bg-white"></div>
              </div>
            </Fragment>
          ))}
      </div>
      {track && <TrackCover className="col-span-2" track={track} />}
      <div
        className={`relative col-start-3 -col-end-1 flex h-32 w-full justify-between bg-slate-700`}
      >
        {track && (
          <TrackInfo
            className="absolute bottom-2 left-2"
            track={track}
            position={position}
            duration={duration}
            trackAnalysis={trackAnalysis}
          />
        )}
        {playerRef.current && (
          <TrackControls
            className="absolute bottom-2 right-2"
            player={playerRef.current}
            nextTrack={nextTrack}
            prevTrack={prevTrack}
          />
        )}
      </div>
    </div>
  );
}

type TrackCoverProps = {
  track: WebPlaybackTrack;
  className?: string;
};
function TrackCover({ track, className }: TrackCoverProps) {
  return (
    track?.album.images[0]?.url && (
      <div className={cn("relative h-full w-full", className)}>
        <Image
          className="object-cover"
          src={track.album.images[0].url}
          alt={track.name}
          fill={true}
        />
      </div>
    )
  );
}

type TrackInfoProps = {
  track: WebPlaybackTrack;
  position: number;
  duration: number;
  trackAnalysis?: {
    tempo: number;
    time_signature: number;
  } | null;
  className?: string;
};
function TrackInfo({
  track,
  position,
  duration,
  trackAnalysis,
  className,
}: TrackInfoProps) {
  return (
    <div className={cn("text-xs text-white", className)}>
      <p className="text-base">{track?.name}</p>
      <p>
        {Math.round(position / 1000)}/{Math.round(duration / 1000)}
      </p>
      {trackAnalysis && (
        <div className="mt-4">
          <p className="me-4 inline-flex items-center text-xs">
            {Math.floor(trackAnalysis.tempo)} BPM
          </p>
          <p className="inline-flex items-center text-xs">
            {Math.floor(trackAnalysis.time_signature)}/4
          </p>
        </div>
      )}
    </div>
  );
}

type TrackControlsProps = {
  player: Player;
  className?: string;
  prevTrack?: WebPlaybackTrack;
  nextTrack?: WebPlaybackTrack;
};
function TrackControls({
  player,
  prevTrack,
  nextTrack,
  className,
}: TrackControlsProps) {
  return (
    <div className={cn("flex flex-col items-end text-white", className)}>
      <button
        className="px-4 py-1"
        onClick={() => {
          void player.togglePlay();
        }}
      >
        Play / Pause
      </button>
      {prevTrack && (
        <button
          className="group px-4 py-1"
          onClick={() => {
            void player.previousTrack();
          }}
        >
          <span className="me-2 group-hover:me-3">{"<--"}</span>
          {prevTrack.name}
        </button>
      )}
      {nextTrack && (
        <button
          className="group px-4 py-1"
          onClick={() => {
            void player.nextTrack();
          }}
        >
          {nextTrack.name}
          <span className="ms-2 group-hover:ms-3">{"-->"}</span>
        </button>
      )}
    </div>
  );
}
