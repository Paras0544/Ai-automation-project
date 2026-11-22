import React from "react";
import { Composition } from "remotion";
import { Reel, reelDurationInFrames } from "./Reel";
import { timing } from "./brand";
import type { Look } from "./types";
import sample from "../data/looks/office-day1.json";

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Reel"
    component={Reel as unknown as React.FC<Record<string, unknown>>}
    width={1080}
    height={1920}
    fps={timing.fps}
    durationInFrames={reelDurationInFrames(sample as Look)}
    defaultProps={sample as unknown as Record<string, unknown>}
    calculateMetadata={({ props }) => ({
      durationInFrames: reelDurationInFrames(props as unknown as Look),
    })}
  />
);
