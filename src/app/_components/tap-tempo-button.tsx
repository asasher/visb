import { Drum } from "lucide-react";
import React, { useState, useRef } from "react";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

type TapTempoButtonProps = {
  className?: string;
};
const TapTempoButton = ({ className }: TapTempoButtonProps) => {
  const [lastTap, setLastTap] = useState<number | null>(null);
  const [bpm, setBpm] = useState<number | null>(null);
  const [tapCount, setTapCount] = useState<number>(0);
  const [avgInterval, setAvgInterval] = useState<number>(0);
  const pressTimer = useRef<NodeJS.Timeout | null>(null);

  const handleTap = () => {
    const now = Date.now();

    if (lastTap) {
      const interval = now - lastTap;

      // If interval greater than a minute, reset BPM
      if (interval > 60000) {
        reset();
        return;
      }

      const newAvgInterval =
        (avgInterval * tapCount + interval) / (tapCount + 1);
      setAvgInterval(newAvgInterval);
      const newBpm = 60000 / newAvgInterval; // Calculate BPM based on average interval
      setBpm(newBpm); // Calculate BPM based on average interval
      if (onTapTempoChange) onTapTempoChange(newBpm);
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
      {bpm ? bpm.toFixed(0) : <Drum className="h-4 w-4" />}
    </Button>
  );
};

export default TapTempoButton;
