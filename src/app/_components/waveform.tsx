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
};

export function Waveform({ className, duration, beats }: WaveformProps) {
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
      ctx.scale(1, -1);
      ctx.translate(0, -canvas.height);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.moveTo(0, 0);

      beats.forEach((point) => {
        ctx.lineTo(
          (canvas.width * point.position) / duration,
          point.value * 0.8 * canvas.height,
        );
      });

      ctx.lineTo(canvas.width, 0);
      ctx.closePath();
      ctx.fillStyle = colors.green[500];
      ctx.fill();
    },
    [beats, duration],
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
      className={cn("h-full w-full", className)}
      ref={canvasRef}
      width={worldWidth}
      height={worldHeight}
    />
  );
}
