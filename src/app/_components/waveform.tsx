"use client";

import { useCallback, useRef, useState } from "react";
import { useAnimationFrame } from "~/lib/hooks";
import { cn } from "~/lib/utils";
import colors from "tailwindcss/colors";

type WaveformProps = {
  className?: string;
  duration: number;
  beats: {
    position: number; // position in ms
    value: number; // value between 0 and 1, representing loudness or amplitude etc
  }[];
  tempo: number;
  beatOffset: number;
  position: number;
  offsetX: number;
  scaleX: number;
};

export function Waveform({
  className,
  position,
  duration,
  beats,
  tempo,
  offsetX,
  scaleX,
  beatOffset,
}: WaveformProps) {
  const [worldWidth, setWorldWidth] = useState(100);
  const [worldHeight, setWorldHeight] = useState(100);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(
    (canvas: HTMLCanvasElement) => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Fix the coordinates system to be more intuitive
      // x increases from left to right
      // y increases from top to bottom
      // Order of transformation is important
      ctx.scale(scaleX, -1);
      ctx.translate(offsetX / scaleX, -canvas.height);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Progress
      ctx.fillStyle = colors.green[700];
      ctx.moveTo(0, 0);
      ctx.lineTo(0, canvas.height);
      ctx.lineTo((canvas.width * position) / duration, canvas.height);
      ctx.lineTo((canvas.width * position) / duration, 0);
      ctx.closePath();
      ctx.fill();

      // Wave
      ctx.fillStyle = colors.green[500];
      ctx.beginPath();
      ctx.moveTo(0, 0);
      beats.forEach((point) => {
        ctx.lineTo(
          (canvas.width * point.position) / duration,
          point.value * 0.8 * canvas.height,
        );
      });
      ctx.lineTo(canvas.width, 0);
      ctx.closePath();
      ctx.fill();

      // Beatgrid
      ctx.lineWidth = 1 / scaleX;
      ctx.strokeStyle = colors.green[700];

      const durationBetweenBeats = Math.floor(60000 / tempo);
      const numBeatsBasedOnTempo = Math.floor(duration / durationBetweenBeats);

      let beatPosition = Math.round(beatOffset ?? 0);
      for (let i = 0; i < numBeatsBasedOnTempo; i++) {
        beatPosition += durationBetweenBeats;
        if (i % 4 !== 0) continue;

        const x = canvas.width * (beatPosition / duration);

        const y = 0.8 * canvas.height;

        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.closePath();
      }

      beatPosition = Math.round(beatOffset ?? 0);
      let dv = -0.2;
      let v = 0.1;
      for (let i = 0; i < numBeatsBasedOnTempo; i++) {
        beatPosition += durationBetweenBeats;
        if (i % 4 === 0) {
          dv = -dv;
          continue;
        }

        const x = canvas.width * (beatPosition / duration);
        const y = v * canvas.height;

        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.closePath();

        v = v + dv;
      }
    },
    [beats, duration, tempo, scaleX, offsetX, position, beatOffset],
  );

  useAnimationFrame(() => {
    if (!canvasRef.current) return;
    const { width: containerWidth, height: containerHeight } =
      canvasRef.current.getBoundingClientRect();

    canvasRef.current.width = containerWidth;
    canvasRef.current.height = containerHeight;

    setWorldWidth(containerWidth);
    setWorldHeight(containerHeight);

    draw(canvasRef.current);
  });

  return (
    <canvas
      className={cn("h-full w-full touch-none", className)}
      ref={canvasRef}
      width={worldWidth}
      height={worldHeight}
    />
  );
}
