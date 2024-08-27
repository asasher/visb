"use client";

import Image from "next/image";
import React, { useState, useEffect, useRef, Fragment } from "react";
import { useDrag, useGesture } from "@use-gesture/react";
import { nanoid } from "nanoid";
import { useDebouncedCallback } from "use-debounce";
import { api } from "~/trpc/react";
import { useAnimationFrame } from "~/lib/hooks";
import { Waveform } from "./waveform";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { Loader2, Music, Slice } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";

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
  id: string;
  startPosition: number;
  endPosition: number;
  shouldPlay: boolean;
};

type LocalPlayerState = {
  paused: boolean;
  duration: number;
  position: number;
  track: WebPlaybackTrack | null;
  prevTrack: WebPlaybackTrack | null;
  nextTrack: WebPlaybackTrack | null;
};
type SpotifyPlayerProps = {
  token: string;
};
export function SpotifyPlayer({ token }: SpotifyPlayerProps) {
  const playerRef = useRef<Player>();
  const [state, setState] = useState<LocalPlayerState>({
    paused: true,
    duration: 1,
    position: 0,
    track: null,
    prevTrack: null,
    nextTrack: null,
  });
  const { paused, duration, position, track, prevTrack, nextTrack } = state;
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
    api.tracks.get.useQuery(track?.id, {
      enabled: !!track,
    });
  const { mutate: upsertSlices, isPending: isSavingSlice } =
    api.tracks.upsert.useMutation({
      async onMutate(newValues) {
        await utils.tracks.get.invalidate();
        const prevData = utils.tracks.get.getData(newValues.trackId);
        utils.tracks.get.setData(newValues.trackId, () => newValues.slices);
        return { prevData };
      },
      onError(err, newValues, ctx) {
        utils.tracks.get.setData(newValues.trackId, () => ctx?.prevData);
      },
      onSettled() {
        void utils.tracks.get.invalidate();
      },
    });
  const debouncedUpsertSlices = useDebouncedCallback(upsertSlices, 500);
  const setSlices = (slices: Slice[]) => {
    utils.tracks.get.setData(track?.id, () => slices);
    if (!track?.id) return;
    debouncedUpsertSlices({
      trackId: track?.id,
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
      });

      void player.connect();
    };
  }, [token]);

  if (!playerRef.current || !track) {
    return (
      <Alert className="rounded-none">
        <Music className="h-4 w-4" />
        <AlertTitle>{"Nothing's playing!"}</AlertTitle>
        <AlertDescription>
          Head over to Spotify and connect to Rock DJ to start playing.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="grid w-full grid-cols-12 items-end justify-center">
      <div className="col-span-full flex items-center justify-end p-2">
        <Button
          variant={"outline"}
          className="p-3"
          onClick={() => setIsSlicing(!isSlicing)}
          disabled={isSlicing || isSavingSlice || isSlicesQueryLoading}
        >
          {isSavingSlice || isSlicesQueryLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Slice className="h-4 w-4" />
          )}
        </Button>
      </div>
      <div className="relative col-span-full h-32">
        <TrackProgress
          player={playerRef.current}
          position={position}
          duration={duration}
          trackAnalysis={trackAnalysis}
          isSlicing={isSlicing}
          onSlice={(draftSlice) => {
            setIsSlicing(false);
            setSlices([...(slices ?? []), draftSlice]);
          }}
        />
        <SlicesLayer
          slices={slices ?? []}
          duration={duration}
          onChange={(slices: Slice[]) => {
            setSlices(slices);
          }}
        />
      </div>
      <TrackCover className="col-span-2 h-32" track={track} />
      <div
        className={`relative col-start-3 -col-end-1 flex h-32 w-full justify-between bg-slate-700`}
      >
        <TrackInfo
          className="absolute bottom-2 left-2"
          track={track}
          position={position}
          duration={duration}
          trackAnalysis={trackAnalysis}
        />
        <TrackControls
          className="absolute bottom-2 right-2"
          paused={paused}
          player={playerRef.current}
          nextTrack={nextTrack}
          prevTrack={prevTrack}
        />
      </div>
    </div>
  );
}

type SlicesLayerProps = {
  slices: Slice[];
  duration: number;
  onChange: (slices: Slice[]) => void;
};
function SlicesLayer({ slices, onChange, duration }: SlicesLayerProps) {
  const bindDrag = useDrag(({ delta: [dx], args, currentTarget }) => {
    if (!(args instanceof Array && args.length === 2)) return;
    const i = args[0] as number;
    const handle = args[1] as "start" | "end";
    if (!(currentTarget instanceof HTMLDivElement)) return;

    const containerDims = currentTarget.parentElement?.getBoundingClientRect();
    if (!containerDims) return;

    const containerLeft = containerDims.left;
    const containerRight = containerDims.right;
    const containerWidth = containerRight - containerLeft;

    const handleDims = currentTarget.getBoundingClientRect();
    const handleAnchorOffset =
      (handle === "start" ? handleDims.left : handleDims.right) - containerLeft;

    const newHandleAnchorOffset = handleAnchorOffset + dx;
    const newAnchorPositionRatio = newHandleAnchorOffset / containerWidth;

    const newPosition = newAnchorPositionRatio * duration;
    const boundedNewPosition = Math.max(0, Math.min(newPosition, duration));

    const prevSlice = slices[i];

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
      onChange([...slices.slice(0, i), ...slices.slice(i + 1)]);
      return;
    }

    onChange([...slices.slice(0, i), newSlice, ...slices.slice(i + 1)]);
  });

  return slices.map((slice, i) => (
    <Fragment key={i}>
      <div
        className="absolute top-0 h-full bg-slate-700 opacity-20"
        style={{
          width: `${(100 * (slice.endPosition - slice.startPosition)) / duration}%`,
          left: `${(100 * slice.startPosition) / duration}%`,
        }}
      ></div>
      <div
        {...bindDrag(i, "start")}
        className="absolute top-0 h-full w-4 touch-none border-s border-white"
        style={{
          left: `${(100 * slice.startPosition) / duration}%`,
        }}
      >
        <div className="absolute top-1/4 h-1/2 w-full rounded-e-md bg-white"></div>
      </div>
      <div
        {...bindDrag(i, "end")}
        className="absolute top-0 h-full w-4 touch-none border-e border-white"
        style={{
          left: `calc(${(100 * slice.endPosition) / duration}% - 1rem)`,
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
          className="object-cover"
          src={track.album.images[0].url}
          alt={track.name}
          fill={true}
        />
      </div>
    )
  );
}

type TrackProgressProps = {
  className?: string;
  position: number;
  duration: number;
  trackAnalysis?: {
    tempo: number;
    time_signature: number;
    beats: {
      position: number;
      value: number;
    }[];
  } | null;
  player: Player;
  isSlicing: boolean;
  onSlice: (slice: Slice) => void;
};
function TrackProgress({
  className,
  position,
  duration,
  trackAnalysis,
  player,
  isSlicing = false,
  onSlice,
}: TrackProgressProps) {
  const [cursorPosition, setCursorPosition] = useState(0);
  const [draftSliceAnchorPosition, setDraftSliceAnchorPosition] = useState<
    number | null
  >(null);
  const bindGesture = useGesture({
    onDrag: ({ xy: [x], currentTarget }) => {
      if (!(currentTarget instanceof HTMLDivElement)) return;
      if (isSlicing) return;

      const boundingRect = currentTarget.getBoundingClientRect();
      const clickXRelativeToStart = x - boundingRect.left;
      const width = boundingRect.right - boundingRect.left;
      const progressRatio = clickXRelativeToStart / width;
      const newPosition = progressRatio * duration;
      void player.seek(newPosition);
    },
    onMove: ({ xy: [x], currentTarget }) => {
      if (!(currentTarget instanceof HTMLDivElement)) return;
      const boundingRect = currentTarget.getBoundingClientRect();
      const clickXRelativeToStart = x - boundingRect.left;
      const width = boundingRect.right - boundingRect.left;
      const progressRatio = clickXRelativeToStart / width;
      const newPosition = progressRatio * duration;
      setCursorPosition(newPosition);
    },
    onPointerDown: ({ event }) => {
      if (!isSlicing) return;

      const currentTarget = event.currentTarget as HTMLDivElement;
      if (!currentTarget) return;

      const boundingRect = currentTarget.getBoundingClientRect();
      const clickXRelativeToStart = event.pageX - boundingRect.left;
      const width = boundingRect.right - boundingRect.left;
      const progressRatio = clickXRelativeToStart / width;
      const newPosition = progressRatio * duration;

      if (!draftSliceAnchorPosition) {
        setDraftSliceAnchorPosition(newPosition);
      } else {
        onSlice({
          id: nanoid(),
          startPosition: Math.min(newPosition, draftSliceAnchorPosition),
          endPosition: Math.max(newPosition, draftSliceAnchorPosition),
          shouldPlay: false,
        });
        setDraftSliceAnchorPosition(null);
      }
    },
  });

  return (
    <div
      {...bindGesture()}
      className={cn(
        "relative h-full w-full touch-none bg-green-600",
        className,
      )}
    >
      {duration && trackAnalysis?.beats && (
        <div className="absolute left-0 top-0 h-full w-full">
          <Waveform duration={duration} beats={trackAnalysis.beats} />
        </div>
      )}
      <div
        className="h-full bg-green-700"
        style={{ width: `${(100 * position) / duration}%` }}
      ></div>
      <div
        className={cn(
          "absolute top-0 h-full w-px bg-white",
          !isSlicing ? "hidden" : "",
        )}
        style={{ left: `${(100 * cursorPosition) / duration}%` }}
      ></div>
      {draftSliceAnchorPosition && (
        <div
          className={cn(
            "absolute top-0 h-full w-px bg-white",
            !isSlicing ? "hidden" : "",
          )}
          style={{ left: `${(100 * draftSliceAnchorPosition) / duration}%` }}
        ></div>
      )}
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
    <div className={cn("flex flex-col items-end text-white", className)}>
      <button
        className="px-4 py-1"
        onClick={() => {
          void player.togglePlay();
        }}
      >
        {paused ? "Play" : "Pause"}
      </button>
      {prevTrack && (
        <button
          className="group px-4 py-1"
          onClick={() => {
            void player.previousTrack();
          }}
        >
          <span className="group-hover:me-3 sm:me-2">{"<--"}</span>
          <span className="hidden sm:inline">{prevTrack.name}</span>
        </button>
      )}
      {nextTrack && (
        <button
          className="group px-4 py-1"
          onClick={() => {
            void player.nextTrack();
          }}
        >
          <span className="hidden sm:inline">{nextTrack.name}</span>
          <span className="ms-2 group-hover:ms-3">{"-->"}</span>
        </button>
      )}
    </div>
  );
}
