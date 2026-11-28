// Product reels (finds / guess / pricedrop / steal): built to stop the scroll and make people want the item.
// - Frame 1 is already a full-screen product photo with the hook on it (no text-only intro).
// - Each product fills the screen, with a big price sticker, the store's own MRP and discount if it has one,
//   and a real "only N sizes left" note when stock is low (from the live store feed).
// - Ends on a grid with every price and the call to action.
import React from "react";
import { AbsoluteFill, Audio, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { brand, inr, timing } from "./brand";
import type { Item, Look } from "./types";

const { colors, fonts } = brand;
const DARK = "#141414";
const STICKER = colors.accent;

export const productTiming = {
  hook: 1.7,
  per: 1.9,
  perGuess: 2.7,
  perSteal: 2.0,
  grid: 3.4,
};

export const productDurationInFrames = (look: Look) => {
  const t = productTiming;
  const per = look.kind === "guess" ? t.perGuess : look.kind === "steal" ? t.perSteal : t.per;
  return Math.round((t.hook + look.items.length * per + t.grid) * timing.fps);
};

const useSpring = (delay = 0, damping = 14) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping } });
};

const Photo: React.FC<{ src: string; zoomFrom?: number; zoomTo?: number }> = ({ src, zoomFrom = 1.06, zoomTo = 1.14 }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const z = interpolate(frame, [0, durationInFrames], [zoomFrom, zoomTo]);
  const y = interpolate(frame, [0, durationInFrames], [0, -2]);
  return (
    <AbsoluteFill style={{ background: "#EDE7DD" }}>
      <Img src={staticFile(src)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 20%", transform: `scale(${z}) translateY(${y}%)` }} />
    </AbsoluteFill>
  );
};

const Chip: React.FC<{ children: React.ReactNode; bg?: string; color?: string; style?: React.CSSProperties }> = ({ children, bg = "rgba(255,255,255,0.92)", color = DARK, style }) => (
  <div style={{ display: "inline-block", padding: "12px 26px", borderRadius: 40, background: bg, color, fontFamily: fonts.sans, fontWeight: 700, fontSize: 38, letterSpacing: 0.5, ...style }}>{children}</div>
);

const Sticker: React.FC<{ text: string; scale?: number; rotate?: number }> = ({ text, scale = 1, rotate = -4 }) => (
  <div
    style={{
      display: "inline-block",
      padding: "18px 40px",
      background: STICKER,
      color: "#fff",
      fontFamily: fonts.sans,
      fontWeight: 800,
      fontSize: 104,
      borderRadius: 22,
      boxShadow: "0 18px 40px rgba(0,0,0,0.35)",
      transform: `rotate(${rotate}deg) scale(${scale})`,
      transformOrigin: "left center",
    }}
  >
    {text}
  </div>
);

const Mark: React.FC<{ light?: boolean }> = ({ light }) => (
  <div style={{ position: "absolute", top: 64, right: 60, fontFamily: fonts.serif, fontSize: 34, letterSpacing: 8, color: light ? "#fff" : DARK, opacity: 0.9 }}>{brand.name}</div>
);

const typeLabel: Record<string, string> = { top: "Top", bottom: "Bottom", footwear: "Shoes", outerwear: "Layer" };

// ---------- scene 1: hook on top of the hero product ----------
const Hook: React.FC<{ look: Look }> = ({ look }) => {
  const a = useSpring(0);
  const b = useSpring(7);
  const hero = look.items[0];
  const badge =
    look.kind === "guess" ? "Guess the price 👇" : look.kind === "pricedrop" ? "Price drops · tracked daily" : look.kind === "steal" ? `Full look under ${inr(look.budget ?? 0)}` : `Each under ${inr(look.budget ?? 0)}`;
  return (
    <AbsoluteFill>
      <Photo src={hero.image} zoomFrom={1.18} zoomTo={1.1} />
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.35) 38%, rgba(0,0,0,0) 60%)" }} />
      <div style={{ position: "absolute", top: 190, left: 70, right: 70 }}>
        <div style={{ transform: `translateY(${(1 - a) * 40}px)`, opacity: a, fontFamily: fonts.sans, fontWeight: 800, fontSize: 92, lineHeight: 1.05, color: "#fff", textShadow: "0 4px 24px rgba(0,0,0,0.4)" }}>{look.hook}</div>
        <div style={{ marginTop: 34, opacity: b, transform: `scale(${0.9 + 0.1 * b})`, transformOrigin: "left" }}>
          <Chip bg={STICKER} color="#fff">{badge}</Chip>
        </div>
      </div>
      <Mark light />
    </AbsoluteFill>
  );
};

// ---------- scene 2: one product, full screen ----------
const Card: React.FC<{ look: Look; item: Item; index: number; runningTotal: number }> = ({ look, item, index, runningTotal }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const slide = useSpring(0, 16);
  const guess = look.kind === "guess";
  const revealAt = Math.round(durationInFrames * 0.48);
  const pop = useSpring(5, 9);
  const reveal = guess ? spring({ frame: frame - revealAt, fps, config: { damping: 10 } }) : pop;
  const meta = useSpring(9);
  const mrp = item.mrp && item.mrp > item.price ? item.mrp : item.wasPrice && item.wasPrice > item.price ? item.wasPrice : null;
  const off = mrp ? Math.round(((mrp - item.price) / mrp) * 100) : 0;
  const low = item.sizesInStock != null && item.sizesInStock <= 3;
  const n = look.items.length;
  return (
    <AbsoluteFill style={{ transform: `translateX(${(1 - slide) * 100}%)` }}>
      <Photo src={item.image} />
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 48%, rgba(0,0,0,0.86) 100%)" }} />
      <div style={{ position: "absolute", top: 150, left: 60 }}>
        <Chip>{look.kind === "steal" ? `Piece ${index + 1}/${n} · ${typeLabel[item.category || ""] || "Piece"}` : `#${index + 1} of ${n}`}</Chip>
      </div>
      {low ? (
        <div style={{ position: "absolute", top: 240, left: 60, opacity: meta }}>
          <Chip bg="#C0392B" color="#fff" style={{ fontSize: 32 }}>Only {item.sizesInStock} sizes left</Chip>
        </div>
      ) : null}
      <div style={{ position: "absolute", left: 60, right: 60, bottom: 230 }}>
        <div style={{ fontFamily: fonts.sans, fontWeight: 700, fontSize: 60, lineHeight: 1.1, color: "#fff", textShadow: "0 3px 16px rgba(0,0,0,0.5)" }}>{item.name}</div>
        <div style={{ marginTop: 26, display: "flex", alignItems: "center", gap: 26, flexWrap: "wrap" }}>
          {guess ? (
            <div style={{ position: "relative", height: 150, width: 640 }}>
              <div style={{ position: "absolute", opacity: 1 - Math.min(1, reveal), top: 18 }}>
                <Sticker text="₹ ? ? ?" rotate={-3} />
              </div>
              <div style={{ position: "absolute", opacity: Math.min(1, reveal), top: 18 }}>
                <Sticker text={inr(item.price)} scale={0.6 + 0.4 * Math.min(1.2, reveal)} />
              </div>
            </div>
          ) : (
            <Sticker text={inr(item.price)} scale={0.6 + 0.4 * reveal} />
          )}
          {mrp && (!guess || frame > revealAt + 6) ? (
            <div style={{ opacity: guess ? 1 : meta, display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontFamily: fonts.sans, fontSize: 44, color: "rgba(255,255,255,0.8)", textDecoration: "line-through" }}>{inr(mrp)}</span>
              <Chip bg="#fff" color={STICKER} style={{ fontSize: 34, padding: "8px 18px" }}>{look.kind === "pricedrop" ? `-${off}% vs our 30-day high` : `${off}% off`}</Chip>
            </div>
          ) : null}
        </div>
        <div style={{ marginTop: 22, opacity: meta, fontFamily: fonts.sans, fontSize: 36, color: "rgba(255,255,255,0.88)" }}>
          {look.kind === "steal" ? `Look so far: ${inr(runningTotal)}` : item.why ? `${item.why} · ${item.store}` : item.store}
        </div>
      </div>
      <Mark light />
    </AbsoluteFill>
  );
};

// ---------- scene 3: everything + call to action ----------
const Grid: React.FC<{ look: Look }> = ({ look }) => {
  const head = useSpring(0);
  const cta = useSpring(16);
  const items = look.items;
  const cols = items.length <= 4 ? 2 : 3;
  const total = items.reduce((s, i) => s + i.price, 0);
  const title = look.kind === "steal" ? `Full look: ${inr(total)}` : look.kind === "guess" ? "The real prices" : look.kind === "pricedrop" ? "Dropped this week" : `Each under ${inr(look.budget ?? 0)}`;
  return (
    <AbsoluteFill style={{ background: DARK, padding: "150px 50px 120px", alignItems: "center" }}>
      <div style={{ opacity: head, transform: `scale(${0.85 + 0.15 * head})`, fontFamily: fonts.sans, fontWeight: 800, fontSize: 76, color: "#fff", textAlign: "center" }}>{title}</div>
      <div style={{ marginTop: 40, display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 20, width: "100%" }}>
        {items.map((it, i) => {
          const s = useSpring(4 + i * 3);
          return (
            <div key={i} style={{ position: "relative", borderRadius: 20, overflow: "hidden", height: cols === 2 ? 560 : 430, opacity: s, transform: `scale(${0.9 + 0.1 * s})` }}>
              <Img src={staticFile(it.image)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 20%" }} />
              <div style={{ position: "absolute", left: 12, bottom: 12, background: STICKER, color: "#fff", fontFamily: fonts.sans, fontWeight: 800, fontSize: cols === 2 ? 46 : 36, padding: "6px 16px", borderRadius: 12 }}>{inr(it.price)}</div>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 44, opacity: cta, textAlign: "center" }}>
        <div style={{ fontFamily: fonts.sans, fontWeight: 800, fontSize: 60, color: "#fff" }}>{look.cta}</div>
        <div style={{ marginTop: 16, fontFamily: fonts.sans, fontSize: 34, color: "rgba(255,255,255,0.75)" }}>🔔 Daily drops on Telegram · @wellpricedfit</div>
        <div style={{ marginTop: 10, fontFamily: fonts.sans, fontSize: 26, color: "rgba(255,255,255,0.55)" }}>{brand.disclosure} · prices checked when posted</div>
      </div>
      <Mark light />
    </AbsoluteFill>
  );
};

const Music: React.FC<{ src: string }> = ({ src }) => {
  const { durationInFrames, fps } = useVideoConfig();
  return (
    <Audio
      loop
      src={staticFile(src)}
      volume={(f) => interpolate(f, [0, fps * 0.4, durationInFrames - fps, durationInFrames], [0, 0.5, 0.5, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
    />
  );
};

export const ProductReel: React.FC<Look> = (look) => {
  const f = (sec: number) => Math.round(sec * timing.fps);
  const t = productTiming;
  const per = look.kind === "guess" ? t.perGuess : look.kind === "steal" ? t.perSteal : t.per;
  let at = t.hook;
  let running = 0;
  return (
    <AbsoluteFill style={{ background: DARK }}>
      <Sequence from={0} durationInFrames={f(t.hook)}>
        <Hook look={look} />
      </Sequence>
      {look.items.map((item, i) => {
        running += item.price;
        const from = f(at);
        at += per;
        return (
          <Sequence key={i} from={from} durationInFrames={f(per)}>
            <Card look={look} item={item} index={i} runningTotal={running} />
          </Sequence>
        );
      })}
      <Sequence from={f(at)} durationInFrames={f(t.grid)}>
        <Grid look={look} />
      </Sequence>
      {look.music ? <Music src={look.music} /> : null}
    </AbsoluteFill>
  );
};
