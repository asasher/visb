"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useGesture } from "@use-gesture/react";
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
      ctx.scale(scaleX, -1);
      ctx.translate(offsetX, -canvas.height);
      // console.log(offsetX, scaleX);

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
      ctx.lineWidth = 1;
      ctx.strokeStyle = colors.green[700];
      const beatsBasedOnTempo = Math.floor((duration / 60000) * tempo);

      for (let i = 0; i < beatsBasedOnTempo; i++) {
        if (i % 4 !== 0) continue;

        const position = i / beatsBasedOnTempo;
        const x = canvas.width * position;

        const y = 0.5 * canvas.height;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, y);
        ctx.stroke();
      }

      let dv = -0.1;
      let v = 0.1;
      for (let i = 0; i < beatsBasedOnTempo; i++) {
        if (i % 4 === 0) {
          dv = -dv;
          continue;
        }

        const position = i / beatsBasedOnTempo;
        const x = canvas.width * position;

        const y = v * canvas.height;

        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, y);
        ctx.stroke();

        v = v + dv;
      }
    },
    [beats, duration, tempo, scaleX, offsetX, position],
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
