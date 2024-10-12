"use client";

import Image from "next/image";
import React, { useState, useEffect, useRef, Fragment } from "react";
import { useDrag, useGesture } from "@use-gesture/react";
import { nanoid } from "nanoid";
import { useDebouncedCallback } from "use-debounce";
import { api, type RouterOutputs } from "~/trpc/react";
import { useAnimationFrame } from "~/lib/hooks";
import { Waveform } from "./waveform";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { Loader2, Music, Slice } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { SpotifyPlaylist } from "./spotify-playlist";
import TapTempoButton from "./tap-tempo-button";
import { getSession } from "next-auth/react";
import { captureException } from "@sentry/nextjs";

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
type PlaybackErrorListener = (
  event:
    | "playback_error"
    | "authentication_error"
    | "initialization_error"
    | "account_error",
  cb: (data: { message: string }) => void,
) => void;

type PlayerProps = {
  name: string;
  getOAuthToken: (cb: (token: string) => void) => void;
  volume: number;
};
export interface Player {
  nextTrack(): unknown;
  previousTrack(): unknown;
  setName(arg0: string): unknown;
  togglePlay(): Promise<void>;
  resume(): Promise<void>;
  pause(): Promise<void>;
  seek(position: number): Promise<void>;
  getCurrentState(): Promise<WebPlaybackState>;
  connect: () => Promise<boolean>;
  disconnect: () => Promise<boolean>;
  addListener: ReadyNotReadyListener & PlayerStateChangedListener;
  on: PlaybackErrorListener;
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
  id: string;
  startPosition: number;
  endPosition: number;
  shouldPlay: boolean;
};

type LocalPlayerState = {
  active: boolean;
  paused: boolean;
  duration: number;
  position: number;
  track: WebPlaybackTrack | null;
  prevTrack: WebPlaybackTrack | null;
  nextTrack: WebPlaybackTrack | null;
  deviceId: string | null;
};
export function SpotifyPlayer() {
  const playerRef = useRef<Player>();
  const [state, setState] = useState<LocalPlayerState>({
    active: false,
    paused: true,
    duration: 1,
    position: 0,
    track: null,
    prevTrack: null,
    nextTrack: null,
    deviceId: null,
  });
  const { paused, duration, position, track, prevTrack, nextTrack, deviceId } =
    state;
  const { data: trackAnalysis } = api.spotify.analysis.useQuery(track?.id, {
    enabled: !!track,
  });
  const [isSlicing, setIsSlicing] = useState(false);

  useAnimationFrame((deltaTime) => {
    if (paused) return;
    setState((prevState) => ({
      ...prevState,
      position: Math.min(prevState.position + deltaTime, prevState.duration),
    }));
  });

  const utils = api.useUtils();
  const { data: slices, isLoading: isSlicesQueryLoading } =
    api.tracks.getSlices.useQuery(track?.id, {
      enabled: !!track,
    });
  const { mutate: upsertSlices, isPending: isSavingSlice } =
    api.tracks.upsertSlices.useMutation({
      async onMutate(newValues) {
        await utils.tracks.getSlices.cancel(track?.id);
        const prevData = utils.tracks.getSlices.getData(newValues.trackId);
        utils.tracks.getSlices.setData(
          newValues.trackId,
          () => newValues.slices,
        );
        return { prevData };
      },
      onError(err, newValues, ctx) {
        console.error(err);
        utils.tracks.getSlices.setData(newValues.trackId, () => ctx?.prevData);
      },
      onSettled() {
        void utils.tracks.getSlices.invalidate();
      },
    });
  const debouncedUpsertSlices = useDebouncedCallback(upsertSlices, 1000);
  const setSlices = (slices: Slice[]) => {
    if (!track?.id) return;
    utils.tracks.getSlices.setData(track.id, () => slices);
    debouncedUpsertSlices({
      trackId: track.id,
      slices,
    });
  };

  useEffect(() => {
    const currentSlice = slices?.find(
      (slice) =>
        slice.startPosition <= position && position <= slice.endPosition,
    );
    if (!currentSlice) return;
    if (!currentSlice?.shouldPlay) {
      void playerRef.current?.seek(currentSlice?.endPosition);
    }
  }, [position, slices]);

  // Load Spotify Sdk
  useEffect(() => {
    if (playerRef.current) return;

    const script = document.createElement("script");
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.async = true;

    document.body.appendChild(script);

    window.onSpotifyWebPlaybackSDKReady = () => {
      const player = new window.Spotify.Player({
        name: "Web Playback SDK",
        getOAuthToken: (cb) => {
          async function getToken() {
            const session = await getSession();
            if (!session?.user.accessToken) return;
            cb(session?.user.accessToken);
          }
          void getToken();
        },
        volume: 0.5,
      });
      playerRef.current = player;

      player.setName("Rock DJ");

      player.addListener("ready", ({ device_id }) => {
        console.log("Ready with Device ID", device_id);
        setState((prevState) => ({
          ...prevState,
          deviceId: device_id,
        }));
      });

      player.addListener("not_ready", ({ device_id }) => {
        console.log("Device ID has gone offline", device_id);
        setState((prevState) => ({
          ...prevState,
          deviceId: null,
        }));
      });

      player.on("playback_error", ({ message }) => {
        captureException(new Error(`Playback Error: ${message}`));
        console.error("Failed to perform playback", message);
      });

      player.on("authentication_error", ({ message }) => {
        captureException(new Error(`Authentication Error: ${message}`));
        console.error("Failed to authenticate", message);
      });

      player.on("initialization_error", ({ message }) => {
        captureException(new Error(`Initialization Error: ${message}`));
        console.error("Failed to initialize", message);
      });

      player.on("account_error", ({ message }) => {
        captureException(new Error(`Account Error: ${message}`));
        console.error("Failed to authenticate", message);
      });

      player.addListener("player_state_changed", (state) => {
        setState((prevState) => ({
          ...prevState,
          paused: state?.paused ?? prevState.paused,
          duration: state?.duration ?? prevState.duration,
          position: state?.position ?? prevState.position,
          track: state?.track_window?.current_track ?? prevState.track,
          prevTrack:
            state?.track_window?.previous_tracks.slice(-1)[0] ??
            prevState.prevTrack,
          nextTrack: state?.track_window?.next_tracks[0] ?? prevState.nextTrack,
        }));

        void player.getCurrentState().then((state) => {
          setState((prevState) => ({
            ...prevState,
            active: !!state,
          }));
        });
      });

      void player.connect();
    };
  }, []);

  return (
    <div className="flex h-full w-full flex-col justify-end object-contain">
      {deviceId && <SpotifyPlaylist deviceId={deviceId} ref={playerRef} />}
      {(!playerRef.current || !track) && (
        <Alert className="rounded-none">
          <Music className="h-4 w-4" />
          <AlertTitle>{"Nothing's playing!"}</AlertTitle>
          <AlertDescription>
            Head over to Spotify and connect to Rock DJ to start playing or
            select one of your playlists above.
          </AlertDescription>
        </Alert>
      )}
      {playerRef.current && track && (
        <div className="grid w-full grid-cols-12 items-end justify-center shadow-lg">
          <div className="relative col-span-full h-20 overflow-hidden">
            <TrackProgress
              player={playerRef.current}
              position={position}
              duration={duration}
              trackAnalysis={trackAnalysis}
              isSlicing={isSlicing}
              slices={slices ?? []}
              onSlicingStart={() => setIsSlicing(true)}
              onSlicingEnd={() => setIsSlicing(false)}
              onSlicesChange={(changedSlices: Slice[]) => {
                setSlices(changedSlices);
              }}
            />
          </div>
          <TrackCover className="col-span-2 h-24" track={track} />
          <div
            className={`relative col-start-3 -col-end-1 flex h-full w-full flex-col justify-between bg-slate-700`}
          >
            <div className="flex">
              <TrackControls
                className="flex-grow"
                paused={paused}
                player={playerRef.current}
                nextTrack={nextTrack}
                prevTrack={prevTrack}
              />
              <div className="flex">
                <Button
                  variant={"ghost"}
                  className="px-5 py-1 text-white"
                  onClick={() => setIsSlicing(!isSlicing)}
                  disabled={isSlicing || isSavingSlice || isSlicesQueryLoading}
                >
                  {isSavingSlice || isSlicesQueryLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Slice className="h-4 w-4" />
                  )}
                </Button>
                <TapTempoButton
                  className="px-4 py-1 text-white"
                  spotifyTrackId={track.id}
                  playbackState={state}
                />
              </div>
            </div>
            <TrackInfo
              className="px-4 pb-2"
              track={track}
              position={position}
              duration={duration}
              trackAnalysis={trackAnalysis}
            />
          </div>
        </div>
      )}
    </div>
  );
}

const _positionToPx = (
  position: number,
  duration: number,
  viewportWidth: number,
  scaleX: number,
  offsetX: number,
) => {
  const viewportDuration = duration / scaleX;
  const x = (position * viewportWidth) / viewportDuration + offsetX;
  return x;
};
const _pxToPosition = (
  px: number,
  viewportWidth: number,
  duration: number,
  scaleX: number,
  offsetX: number,
) => {
  const viewportDuration = duration / scaleX;
  const viewportPosition = (viewportDuration * px) / viewportWidth;
  const offsetPosition = (viewportDuration * offsetX) / viewportWidth;
  const position = viewportPosition - offsetPosition;

  return position;
};

type SlicesLayerProps = {
  slices: Slice[];
  duration: number;
  onSlicingStart: () => void;
  onSlicingEnd: () => void;
  onChange: (slices: Slice[]) => void;
  offsetX: number;
  scaleX: number;
};
function SlicesLayer({
  slices,
  onChange,
  duration,
  scaleX,
  offsetX,
  onSlicingEnd,
  onSlicingStart,
}: SlicesLayerProps) {
  const positionToPx = (position: number, viewportWidth: number) => {
    return _positionToPx(position, duration, viewportWidth, scaleX, offsetX);
  };
  const pxToPosition = (px: number, viewportWidth: number) => {
    return _pxToPosition(px, viewportWidth, duration, scaleX, offsetX);
  };
  const divRef = useRef<HTMLDivElement>(null);
  const [vw, setVw] = useState(0);
  useEffect(() => {
    const container = divRef.current?.parentElement;
    if (!container) return;
    const { width } = container.getBoundingClientRect();
    setVw(width);
  }, [divRef.current?.parentElement]);
  const bindDrag = useDrag(
    ({ delta: [dx], args, currentTarget, first, last }) => {
      if (first) onSlicingStart();

      if (!(args instanceof Array && args.length === 2)) return;
      const id = args[0] as string;

      const handle = args[1] as "start" | "end";
      if (!(currentTarget instanceof HTMLDivElement)) return;

      const containerDims =
        currentTarget.parentElement?.getBoundingClientRect();
      if (!containerDims) return;

      const handleDims = currentTarget.getBoundingClientRect();
      const handleAnchorOffset =
        handle === "start" ? handleDims.left : handleDims.right;

      const newHandleAnchorOffset = handleAnchorOffset + dx;

      const { width: viewportWidth } = containerDims;

      const newPosition = pxToPosition(newHandleAnchorOffset, viewportWidth);
      const boundedNewPosition = Math.max(0, Math.min(newPosition, duration));

      const prevSlice = slices.find((x) => x.id === id);
      if (!prevSlice) return;

      const newSlice = {
        ...prevSlice,
      };
      if (handle === "start") {
        // Can't be more than the end position
        newSlice.startPosition = Math.min(
          boundedNewPosition,
          prevSlice.endPosition,
        );
      }
      if (handle === "end") {
        // Can't be less than the start position
        newSlice.endPosition = Math.max(
          boundedNewPosition,
          prevSlice.startPosition,
        );
      }

      if (newSlice.endPosition - newSlice.startPosition < 1) {
        // If the new slice is too small, just remove it
        onChange(slices.filter((x) => x.id !== id));
        onSlicingEnd();
        return;
      }

      onChange(slices.map((x) => (x.id === id ? newSlice : x)));
      if (last) onSlicingEnd();
    },
  );

  return slices.map((slice) => (
    <Fragment key={slice.id}>
      <div
        ref={divRef}
        className="absolute top-0 h-full bg-slate-700 opacity-20"
        style={{
          width: `${positionToPx(slice.endPosition, vw) - positionToPx(slice.startPosition, vw)}px`,
          left: `${positionToPx(slice.startPosition, vw)}px`,
        }}
      ></div>
      <div
        {...bindDrag(slice.id, "start")}
        className="absolute top-0 h-full w-4 touch-none border-s border-white"
        style={{
          left: `${positionToPx(slice.startPosition, vw)}px`,
        }}
      >
        <div className="absolute top-1/4 h-1/2 w-full rounded-e-md bg-white"></div>
      </div>
      <div
        {...bindDrag(slice.id, "end")}
        className="absolute top-0 h-full w-4 touch-none border-e border-white"
        style={{
          left: `calc(${positionToPx(slice.endPosition, vw)}px - 1rem)`,
        }}
      >
        <div className="absolute top-1/4 h-1/2 w-full rounded-s-md bg-white"></div>
      </div>
    </Fragment>
  ));
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
          sizes="100%"
          className="object-cover"
          src={track.album.images[0].url}
          alt={track.name}
          fill={true}
        />
      </div>
    )
  );
}

type TrackAnalysis = RouterOutputs["spotify"]["analysis"];

type TrackProgressProps = {
  className?: string;
  position: number;
  duration: number;
  trackAnalysis?: TrackAnalysis;
  player: Player;
  isSlicing: boolean;
  slices: Slice[];
  onSlicesChange: (slices: Slice[]) => void;
  onSlicingStart: () => void;
  onSlicingEnd: () => void;
};
function TrackProgress({
  className,
  position,
  duration,
  trackAnalysis,
  player,
  isSlicing = false,
  slices,
  onSlicesChange,
  onSlicingStart,
  onSlicingEnd,
}: TrackProgressProps) {
  const divRef = useRef<HTMLDivElement>(null);

  const [cursorPosition, setCursorPosition] = useState(0);
  const [draftSliceAnchorPosition, setDraftSliceAnchorPosition] = useState<
    number | null
  >(null);

  const [offsetX, setOffsetX] = useState(0);
  const [scaleX, setScaleX] = useState(1);

  const positionToPx = (position: number) => {
    const containerDims = divRef.current?.getBoundingClientRect();
    if (!containerDims) return 0;
    const { width: viewportWidth } = containerDims;
    return _positionToPx(position, duration, viewportWidth, scaleX, offsetX);
  };
  const pxToPosition = (px: number) => {
    const containerDims = divRef.current?.getBoundingClientRect();
    if (!containerDims) return 0;
    const { width: viewportWidth } = containerDims;

    return _pxToPosition(px, viewportWidth, duration, scaleX, offsetX);
  };

  const onPan = (dx: number) => {
    const boundingRect = divRef.current?.getBoundingClientRect();
    if (!boundingRect) return;
    setOffsetX((prevOffsetX) =>
      Math.max(
        Math.min(0, prevOffsetX - dx),
        -(scaleX - 1) * boundingRect.right,
      ),
    );
  };

  const makeSlice = (x: number) => {
    const newPosition = pxToPosition(x);

    if (!draftSliceAnchorPosition) {
      setDraftSliceAnchorPosition(newPosition);
    } else {
      const newSlice = {
        id: nanoid(),
        startPosition: Math.min(newPosition, draftSliceAnchorPosition),
        endPosition: Math.max(newPosition, draftSliceAnchorPosition),
        shouldPlay: false,
      };
      onSlicesChange([...slices, newSlice]);
      setDraftSliceAnchorPosition(null);
      onSlicingEnd();
    }
  };

  useGesture(
    {
      onDrag: ({ xy: [x], delta, pinching, tap }) => {
        if (isSlicing) return;
        if (pinching) return;

        if (tap) {
          const newPosition = pxToPosition(x);
          void player.seek(newPosition);
          return;
        }

        const [dx] = delta;
        onPan(-dx);
      },
      onMove: ({ xy: [x] }) => {
        const newPosition = pxToPosition(x);
        setCursorPosition(newPosition);
      },
      onPointerDown: ({ event }) => {
        if (!isSlicing) return;
        makeSlice(event.x);
      },
      onPinch: ({ offset: [scale] }) => {
        setScaleX(scale);
      },
    },
    {
      target: divRef,
      pinch: {
        scaleBounds: {
          min: 1,
          max: 8,
        },
      },
    },
  );

  return (
    <div
      ref={divRef}
      className={cn(
        "relative h-full w-full touch-none bg-green-600",
        className,
      )}
    >
      {duration !== undefined && trackAnalysis?.beats ? (
        <div className="absolute left-0 top-0 h-full w-full">
          <Waveform
            className="pointer-events-none"
            position={position}
            duration={duration}
            beats={trackAnalysis.beats}
            tempo={trackAnalysis.userTapTempo ?? trackAnalysis.tempo}
            beatOffset={trackAnalysis.beatOffset ?? 0}
            offsetX={offsetX}
            scaleX={scaleX}
          />
        </div>
      ) : null}
      <div
        className={cn(
          "absolute top-1/4 h-1/2 w-px bg-white",
          !isSlicing ? "hidden" : "",
        )}
        style={{ left: `${positionToPx(cursorPosition)}px` }}
      ></div>
      {draftSliceAnchorPosition && (
        <div
          className={cn(
            "absolute top-0 h-full w-px bg-white",
            !isSlicing ? "hidden" : "",
          )}
          style={{ left: `${positionToPx(draftSliceAnchorPosition)}px` }}
        ></div>
      )}
      <SlicesLayer
        slices={slices ?? []}
        duration={duration}
        onSlicingStart={onSlicingStart}
        onChange={onSlicesChange}
        onSlicingEnd={onSlicingEnd}
        offsetX={offsetX}
        scaleX={scaleX}
      />
    </div>
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
      <p className="mb-1 text-base">{track?.name}</p>

      <p className="me-5 inline-flex items-center text-xs">
        {Math.round(position / 1000)}/{Math.round(duration / 1000)}
      </p>
      {trackAnalysis && (
        <>
          <p className="me-2 inline-flex items-center text-xs">
            {Math.floor(trackAnalysis.tempo)} BPM
          </p>
          <p className="inline-flex items-center text-xs">
            {Math.floor(trackAnalysis.time_signature)}/4
          </p>
        </>
      )}
    </div>
  );
}

type TrackControlsProps = {
  player: Player;
  paused: boolean;
  className?: string;
  prevTrack: WebPlaybackTrack | null;
  nextTrack: WebPlaybackTrack | null;
};
function TrackControls({
  player,
  paused,
  prevTrack,
  nextTrack,
  className,
}: TrackControlsProps) {
  return (
    <div className={cn("flex items-end justify-between text-white", className)}>
      <Button
        variant={"ghost"}
        className="me-5 px-4 py-1"
        onClick={() => {
          void player.togglePlay();
        }}
      >
        {paused ? "Play" : "Pause"}
      </Button>
      <div>
        {prevTrack && (
          <Button
            variant={"ghost"}
            className="px-2 py-1"
            onClick={() => {
              void player.previousTrack();
            }}
          >
            <span className="sm:me-2">{"<--"}</span>
            <span className="hidden sm:inline">{prevTrack.name}</span>
          </Button>
        )}
        {nextTrack && (
          <Button
            variant={"ghost"}
            className="px-4 py-1"
            onClick={() => {
              void player.nextTrack();
            }}
          >
            <span className="hidden sm:inline">{nextTrack.name}</span>
            <span className="sm:ms-2">{"-->"}</span>
          </Button>
        )}
      </div>
    </div>
  );
}
