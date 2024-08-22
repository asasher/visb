"use client";

import Image from "next/image";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { api } from "~/trpc/react";
import { Drum, Watch } from "lucide-react";

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

type SpotifyPlayerProps = {
  token: string;
};

const useAnimationFrame = (callback: (deltaTime: number) => void) => {
  // Use useRef for mutable variables that we want to persist
  // without triggering a re-render on their change
  const requestRef = useRef<number>();
  const previousTimeRef = useRef<number>();

  const animate = useCallback(
    (time: number) => {
      if (previousTimeRef.current != undefined) {
        const deltaTime = time - previousTimeRef.current;
        callback(deltaTime);
      }
      previousTimeRef.current = time;
      requestRef.current = requestAnimationFrame(animate);
    },
    [callback],
  );

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current!);
  }, [animate]); // Make sure the effect runs only once
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
  const { data: trackAnalysis } = api.spotify.analysis.useQuery(track?.id);

  useAnimationFrame((deltaTime) => {
    if (paused) return;
    setPosition((prevPosition) => Math.min(prevPosition + deltaTime, duration));
  });

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
        console.log("Player state changed", state);
        setPaused(state?.paused ?? true);
        setDuration(state?.duration ?? 0);
        setPosition(state?.position ?? 0);
        setTrack(state?.track_window?.current_track);
        setPrevTrack(state?.track_window?.previous_tracks[0]);
        setNextTrack(state?.track_window?.next_tracks[0]);

        void player.getCurrentState().then((state) => {
          console.log("Player state is", state);
          setActive(!!state);
        });
      });

      void player.connect();
    };
  }, [token]);

  useEffect(() => {
    console.log("Track Analysis", trackAnalysis);
  }, [trackAnalysis]);

  return (
    <div className="grid w-full grid-cols-12 items-end justify-center">
      <div className="col-span-1 h-16 bg-slate-100"></div>
      <div className="col-start-2 -col-end-1 flex h-16 w-full items-center justify-center bg-slate-100">
        {Array.from({ length: trackAnalysis?.numBeats ?? 0 }).map((_, i) => (
          <div
            key={i}
            className={`h-full flex-1 border-r border-slate-300`}
          ></div>
        ))}
      </div>
      {track?.album.images[0]?.url && (
        <div className="relative col-span-1 h-full w-full">
          <Image
            className="object-cover"
            src={track.album.images[0].url}
            alt={track.name}
            fill={true}
          />
        </div>
      )}
      <div
        className={`relative col-start-2 -col-end-1 h-32 w-full ${enabled ? "bg-green-500" : "bg-gray-100"} `}
        onPointerDown={(e) => {
          setIsPointerDown(true);
          window.addEventListener(
            "pointerup",
            () => {
              console.log("Pointer Up");
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
          console.log("Pointer Move");
          const boundingRect = e.currentTarget.getBoundingClientRect();
          const clickXRelativeToStart = e.pageX - boundingRect.left;
          const width = boundingRect.right - boundingRect.left;
          const progressRatio = clickXRelativeToStart / width;
          const newPosition = progressRatio * duration;
          if (playerRef.current) void playerRef.current?.seek(newPosition);
        }}
      >
        <div
          className={`h-full ${enabled ? "bg-green-700" : "bg-gray-500"}`}
          style={{ width: `${(100 * position) / duration}%` }}
        ></div>
        <div className="absolute bottom-2 left-2 text-xs text-white">
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
      </div>
      <div className="col-span-full flex w-full items-start justify-between bg-slate-700 py-3 text-white">
        <div className="flex flex-col items-start">
          {prevTrack && (
            <button
              className="group px-4 py-1"
              onClick={() => {
                if (!playerRef.current) return;

                console.log("Previous Track");
                void playerRef.current.previousTrack();
                void playerRef.current.getCurrentState().then((state) => {
                  console.log("Player state is", state);
                });
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
                if (!playerRef.current) return;

                console.log("Next Track");
                void playerRef.current.nextTrack();
                void playerRef.current.getCurrentState().then((state) => {
                  console.log("Player state is", state);
                });
              }}
            >
              {nextTrack.name}
              <span className="ms-2 group-hover:ms-3">{"-->"}</span>
            </button>
          )}
        </div>
        <div>
          <button
            className="px-4 py-1"
            onClick={() => {
              if (!playerRef.current) return;

              console.log("Play / Pause");
              void playerRef.current.togglePlay();
              void playerRef.current.getCurrentState().then((state) => {
                console.log("Player state is", state);
              });
            }}
          >
            Play / Pause
          </button>
        </div>
      </div>
    </div>
  );
}
