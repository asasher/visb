import { Drum, Loader2 } from "lucide-react";
import React, { useState, useRef } from "react";
import { useDebouncedCallback } from "use-debounce";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";

function getFirstBeatOffset(
  positionOfKnownBeat: number,
  tapTempo: number,
): number {
  const timeBetweenBeats = 60000 / tapTempo;
  // Take out all the beats and remainder is the offset
  const firstBeatOffset = positionOfKnownBeat % timeBetweenBeats;
  return firstBeatOffset;
}

type TapTempoButtonProps = {
  className?: string;
  spotifyTrackId: string;
  playbackState: {
    position: number;
    duration: number;
  };
};
const TapTempoButton = ({
  className,
  spotifyTrackId,
  playbackState,
}: TapTempoButtonProps) => {
  const [lastTap, setLastTap] = useState<number | null>(null);
  const [bpm, setBpm] = useState<number | null>(null);
  const [tapCount, setTapCount] = useState<number>(0);
  const [avgInterval, setAvgInterval] = useState<number>(0);
  const pressTimer = useRef<NodeJS.Timeout | null>(null);

  const utils = api.useUtils();
  const { mutate: setTrackTempo, isPending: isSavingTapTempo } =
    api.tracks.setTrackTempo.useMutation({
      async onSettled() {
        await utils.spotify.invalidate();
      },
    });

  const setTrackTempoDebounced = useDebouncedCallback(setTrackTempo, 3000);

  const handleTap = () => {
    const now = Date.now();

    if (lastTap) {
      const interval = now - lastTap;

      // If interval greater than a minute, reset BPM
      if (interval > 10000) {
        reset();
        return;
      }

      const newAvgInterval =
        (avgInterval * tapCount + interval) / (tapCount + 1);
      setAvgInterval(newAvgInterval);
      const newBpm = 60000 / newAvgInterval; // Calculate BPM based on average interval
      const beatOffset = getFirstBeatOffset(playbackState.position, newBpm);
      setBpm(newBpm); // Calculate BPM based on average interval
      setTrackTempoDebounced({
        spotifyTrackId,
        tapTempo: newBpm,
        beatOffset: beatOffset,
      });
    }

    setLastTap(now);
    setTapCount(tapCount + 1);
  };

  const startPressTimer = () => {
    pressTimer.current = setTimeout(() => reset(), 1000); // Reset BPM after 1 second of long press
  };

  const cancelPressTimer = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
    }
  };

  const reset = () => {
    setLastTap(null);
    setBpm(null); // Reset BPM to null
    setTrackTempo({
      spotifyTrackId,
      tapTempo: null,
      beatOffset: null,
    });
    setTapCount(0);
    setAvgInterval(0);
  };

  return (
    <Button
      className={cn(className)}
      variant={"ghost"}
      onClick={handleTap}
      onMouseDown={startPressTimer}
      onMouseUp={cancelPressTimer}
      onMouseLeave={cancelPressTimer}
      onTouchStart={startPressTimer}
      onTouchEnd={cancelPressTimer}
    >
      {isSavingTapTempo ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : bpm ? (
        bpm.toFixed(0)
      ) : (
        <Drum className="h-4 w-4" />
      )}
    </Button>
  );
};

export default TapTempoButton;
