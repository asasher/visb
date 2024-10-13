import { create } from "zustand";

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
export type WebPlaybackTrack = {
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
export type WebPlaybackState = {
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

export type PlayerStateChangedListener = (
  event: "player_state_changed",
  cb: (data: WebPlaybackState) => void,
) => void;
export type ReadyNotReadyListener = (
  event: "ready" | "not_ready",
  cb: (data: { device_id: string }) => void,
) => void;
export type PlaybackErrorListener = (
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
  activateElement(): Promise<void>;
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

type PlayerState = {
  paused: boolean;
  duration: number;
  position: number;
  track: WebPlaybackTrack | null;
  prevTrack?: WebPlaybackTrack | null;
  nextTrack?: WebPlaybackTrack | null;
  deviceId: string | null;
};

type State = {
  player: PlayerState;
  slices: {
    isSlicing: boolean;
  };
  // Holds the last request made to the player. We'll use this to
  // restore state in case player is disconnected
  playbackRequest: {
    playlistUri: string | null;
    trackUri: string | null;
  };
};

type Actions = {
  setDeviceId: (deviceId: string | null) => void;
  onStateChange: (
    state: Omit<PlayerState, "active" | "deviceId" | "needsRefresh">,
  ) => void;
  resetPlayerState: () => void;
  setPosition: (position: number) => void;
  setIsSlicing: (isSlicing: boolean) => void;
  setRequestedPlaylist: (playlistUri: string) => void;
  setRequestedTrack: (trackUri: string) => void;
};

export const usePlayerStore = create<State & Actions>()((set) => ({
  player: {
    active: false,
    paused: true,
    duration: 0,
    position: 0,
    track: null,
    prevTrack: null,
    nextTrack: null,
    deviceId: null,
  },
  slices: {
    isSlicing: false,
  },
  playbackRequest: {
    playlistUri: null,
    trackUri: null,
  },
  setIsSlicing: (isSlicing: boolean) =>
    set((state) => ({ ...state, slices: { ...state.slices, isSlicing } })),
  setPosition: (position) =>
    set((state) => ({ ...state, player: { ...state.player, position } })),
  setDeviceId: (deviceId) =>
    set((state) => ({ ...state, player: { ...state.player, deviceId } })),
  resetPlayerState: () =>
    set((state) => ({
      ...state,
      player: {
        ...state.player,
        prevTrack: null,
        nextTrack: null,
        track: null,
        duration: 0,
        position: 0,
      },
    })),
  onStateChange: (changedState) =>
    set((state) => ({
      ...state,
      player: {
        ...state.player,
        ...changedState,
      },
    })),
  setRequestedPlaylist: (playlistUri: string) =>
    set((state) => ({
      ...state,
      request: {
        ...state.playbackRequest,
        playlistUri,
      },
    })),
  setRequestedTrack: (trackUri: string) =>
    set((state) => ({
      ...state,
      request: {
        ...state.playbackRequest,
        trackUri,
      },
    })),
}));
