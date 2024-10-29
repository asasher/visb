import { Drum, Loader2 } from "lucide-react";
import React, { useState, useRef } from "react";
import { useDebouncedCallback } from "use-debounce";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";
import { usePlayerStore } from "./user-player-store";

function getFirstBeatOffset(
  positionOfKnownBeat: number,
  tapTempo: number,
): number {
  const timeBetweenBeats = 60000 / tapTempo;
  // Take out all the beats and remainder is the offset
  const firstBeatOffset = positionOfKnownBeat % timeBetweenBeats;
  return firstBeatOffset;
}

// function calculateTapTempoWithLowPassFilter(intervals: number[], alpha = 0.4) {
//   if (intervals.length === 0) {
//     return 0; // No intervals to calculate tempo
//   }

//   // Initialize the filtered interval with the first tap
//   let filteredInterval = intervals[0]!;

//   // Apply low-pass filtering over all intervals
//   for (let i = 1; i < intervals.length; i++) {
//     // Low-pass filter calculation: current_filtered = alpha * new_value + (1 - alpha) * previous_filtered
//     filteredInterval = alpha * intervals[i]! + (1 - alpha) * filteredInterval;
//   }

//   // Convert the filtered interval (in milliseconds) to BPM
//   const bpm = 60000 / filteredInterval;

//   return bpm;
// }

function calculateTempoWithEwma(data: number[], alpha = 0.7): number {
  if (data.length <= 0) {
    return 0;
  }

  if (data.length === 1) {
    return data[0]!;
  }

  // Initialize an array to hold the EWMA values
  const ewma: number[] = [];

  // Handle the first value, as there's no previous value to reference
  ewma.push(data[0]!);

  // Calculate EWMA for the rest of the data
  for (let i = 1; i < data.length; i++) {
    ewma[i] = alpha * data[i]! + (1 - alpha) * ewma[i - 1]!;
  }

  const bpm = 60000 / ewma.pop()!;

  return bpm;
}

// function calculateTempoWithAverage(intervals: number[]) {
//   if (intervals.length === 0) {
//     return 0; // No intervals to calculate tempo
//   }

//   const avgInterval =
//     intervals.reduce((acc, curr) => acc + curr, 0) / intervals.length;

//   const bpm = 60000 / avgInterval;

//   return bpm;
// }

type TapTempoButtonProps = {
  className?: string;
};
const TapTempoButton = ({ className }: TapTempoButtonProps) => {
  const [lastTap, setLastTap] = useState<number | null>(null);
  const [bpm, setBpm] = useState<number | null>(null);
  const [taps, setTaps] = useState<number[]>([]);
  const pressTimer = useRef<NodeJS.Timeout | null>(null);

  const position = usePlayerStore((state) => state.player.position);
  const track = usePlayerStore((state) => state.player.track);
  const spotifyTrackId = track?.id;

  const utils = api.useUtils();
  const { mutate: setTrackTempo, isPending: isSavingTapTempo } =
    api.tracks.setTrackTempo.useMutation({
      async onSettled() {
        await utils.spotify.invalidate();
        setBpm(null);
      },
    });
  const setTrackTempoDebounced = useDebouncedCallback(setTrackTempo, 3000);

  if (!spotifyTrackId) return null;

  const handleTap = () => {
    const now = performance.now();

    if (!lastTap) {
      setBpm(0);
      setLastTap(now);
      return;
    }

    const interval = now - lastTap;

    // If interval greater than a minute, reset BPM
    if (interval > 10000) {
      reset();
      setLastTap(now);
      return;
    }

    if (taps.length <= 1) {
      setBpm(60000 / interval);
      setTaps((prev) => [...prev, interval]);
      setLastTap(now);
      return;
    }

    const newBpm = calculateTempoWithEwma(taps, 0.2);
    // const newBpm = calculateTapTempoWithLowPassFilter(taps.slice(-20), 0.6);
    // const newBpm = calculateTempoWithAverage(taps.slice(-20));
    const beatOffset = getFirstBeatOffset(position, newBpm);
    setBpm(newBpm); // Calculate BPM based on average interval
    setTrackTempoDebounced({
      spotifyTrackId,
      tapTempo: newBpm,
      beatOffset: beatOffset,
    });

    setTaps((prev) => [...prev, interval]);
    setLastTap(now);
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
    // setTapCount(0);
    // setAvgInterval(0);
    setTaps([]);
  };

  return (
    <Button
      className={cn(className)}
      variant={"ghost"}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        startPressTimer();
        handleTap();
      }}
      onMouseUp={cancelPressTimer}
      onMouseLeave={cancelPressTimer}
      onTouchStart={(e) => {
        e.preventDefault();
        e.stopPropagation();
        startPressTimer();
        handleTap();
      }}
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
