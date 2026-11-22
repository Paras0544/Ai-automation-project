import React from "react";
import {
  AbsoluteFill,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { brand, inr, timing } from "./brand";
import type { Item, Look } from "./types";

const { colors, fonts } = brand;

// ---------- shared pieces ----------

const AiLabel: React.FC = () => (
  <div
    style={{
      position: "absolute",
      top: 70,
      right: 50,
      padding: "10px 20px",
      borderRadius: 30,
      background: "rgba(43,43,43,0.75)",
      color: "#fff",
      fontFamily: fonts.sans,
      fontSize: 26,
      letterSpacing: 1,
    }}
  >
    {brand.aiLabel}
  </div>
);

const Wordmark: React.FC = () => (
  <div
    style={{
      position: "absolute",
      bottom: 60,
      width: "100%",
      textAlign: "center",
      fontFamily: fonts.serif,
      fontSize: 30,
      letterSpacing: 8,
      color: colors.muted,
    }}
  >
    {brand.name}
  </div>
);

const useEnter = (delay = 0) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  return { opacity: s, transform: `translateY(${interpolate(s, [0, 1], [40, 0])}px)` };
};

// ---------- scenes ----------

const Hook: React.FC<{ hook: string; subhook?: string }> = ({ hook, subhook }) => {
  const a = useEnter(0);
  const b = useEnter(10);
  return (
    <AbsoluteFill style={{ background: colors.bg, justifyContent: "center", padding: 90 }}>
      <div style={{ ...a, fontFamily: fonts.serif, fontSize: 92, lineHeight: 1.12, color: colors.ink }}>
        {hook}
      </div>
      {subhook ? (
        <div style={{ ...b, marginTop: 40, fontFamily: fonts.sans, fontSize: 52, color: colors.accent }}>
          {subhook}
        </div>
      ) : null}
      <Wordmark />
    </AbsoluteFill>
  );
};

const FitShot: React.FC<{ src: string }> = ({ src }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  // slow push-in, the "Ken Burns" look
  const scale = interpolate(frame, [0, durationInFrames], [1.0, 1.08]);
  return (
    <AbsoluteFill style={{ background: colors.ink }}>
      <Img
        src={staticFile(src)}
        style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${scale})` }}
      />
    </AbsoluteFill>
  );
};

const ItemCard: React.FC<{ item: Item; index: number; total: number }> = ({ item, index, total }) => {
  const img = useEnter(0);
  const text = useEnter(6);
  const price = useEnter(12);
  return (
    <AbsoluteFill style={{ background: colors.bg, alignItems: "center", padding: "160px 80px" }}>
      <div style={{ fontFamily: fonts.sans, fontSize: 30, color: colors.muted, letterSpacing: 4 }}>
        {index + 1} / {total}
      </div>
      <div
        style={{
          ...img,
          marginTop: 40,
          width: 820,
          height: 1000,
          background: colors.card,
          borderRadius: 24,
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Img src={staticFile(item.image)} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      </div>
      <div style={{ ...text, marginTop: 50, fontFamily: fonts.serif, fontSize: 64, color: colors.ink, textAlign: "center" }}>
        {item.name}
      </div>
      {item.why ? (
        <div style={{ ...text, marginTop: 16, fontFamily: fonts.sans, fontSize: 36, color: colors.muted, textAlign: "center" }}>
          {item.why}
        </div>
      ) : null}
      <div style={{ ...price, marginTop: 30, fontFamily: fonts.sans, fontSize: 60, fontWeight: 700, color: colors.accent }}>
        {inr(item.price)} <span style={{ fontSize: 34, fontWeight: 400, color: colors.muted }}>· {item.store}</span>
      </div>
    </AbsoluteFill>
  );
};

const Grid: React.FC<{ items: Item[]; cta: string }> = ({ items, cta }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const total = items.reduce((s, i) => s + i.price, 0);
  // signature price reveal: counts up to the total
  const counted = Math.round(
    interpolate(frame, [0.6 * fps, 1.8 * fps], [0, total], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
  );
  const head = useEnter(0);
  const ctaIn = useEnter(Math.round(2 * fps));
  const cols = items.length <= 4 ? 2 : 3;
  return (
    <AbsoluteFill style={{ background: colors.bg, padding: "150px 70px", alignItems: "center" }}>
      <div style={{ ...head, fontFamily: fonts.sans, fontSize: 34, letterSpacing: 6, color: colors.muted }}>
        THE REAL PRODUCTS
      </div>
      <div
        style={{
          marginTop: 40,
          display: "grid",
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: 24,
          width: "100%",
        }}
      >
        {items.map((it, i) => (
          <div key={i} style={{ background: colors.card, borderRadius: 18, padding: 16, textAlign: "center" }}>
            <Img src={staticFile(it.image)} style={{ width: "100%", height: cols === 2 ? 420 : 300, objectFit: "contain" }} />
            <div style={{ fontFamily: fonts.sans, fontSize: 28, color: colors.ink, marginTop: 10 }}>{it.name}</div>
            <div style={{ fontFamily: fonts.sans, fontSize: 30, fontWeight: 700, color: colors.accent }}>{inr(it.price)}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 50, fontFamily: fonts.serif, fontSize: 96, color: colors.ink }}>
        Total {inr(counted)}
      </div>
      <div style={{ ...ctaIn, marginTop: 30, fontFamily: fonts.sans, fontSize: 48, color: colors.accent }}>{cta}</div>
      <div style={{ marginTop: 18, fontFamily: fonts.sans, fontSize: 28, color: colors.muted }}>
        {brand.disclosure} · links earn a small commission
      </div>
      <Wordmark />
    </AbsoluteFill>
  );
};

// ---------- the reel ----------

export const reelDurationInFrames = (look: Look) => {
  const s = timing;
  const seconds = s.hook + look.fitImages.length * s.perFitImage + look.items.length * s.perItem + s.grid;
  return Math.round(seconds * s.fps);
};

export const Reel: React.FC<Look> = (look) => {
  const f = (sec: number) => Math.round(sec * timing.fps);
  let t = 0;
  const seq: React.ReactNode[] = [];

  seq.push(
    <Sequence key="hook" from={f(t)} durationInFrames={f(timing.hook)}>
      <Hook hook={look.hook} subhook={look.subhook} />
    </Sequence>,
  );
  t += timing.hook;

  look.fitImages.forEach((src, i) => {
    seq.push(
      <Sequence key={`fit${i}`} from={f(t)} durationInFrames={f(timing.perFitImage)}>
        <FitShot src={src} />
      </Sequence>,
    );
    t += timing.perFitImage;
  });

  look.items.forEach((item, i) => {
    seq.push(
      <Sequence key={`item${i}`} from={f(t)} durationInFrames={f(timing.perItem)}>
        <ItemCard item={item} index={i} total={look.items.length} />
      </Sequence>,
    );
    t += timing.perItem;
  });

  seq.push(
    <Sequence key="grid" from={f(t)} durationInFrames={f(timing.grid)}>
      <Grid items={look.items} cta={look.cta} />
    </Sequence>,
  );

  return (
    <AbsoluteFill style={{ background: colors.bg }}>
      {seq}
      {/* AI label stays on screen the whole reel */}
      <AiLabel />
    </AbsoluteFill>
  );
};
