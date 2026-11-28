import React from "react";
import {
  AbsoluteFill,
  Audio,
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


// Outfit board: the real product photos laid out together, like a flat-lay.
// Used when a look has no AI fit images (the default), so the reel is 100% real products.
type Spot = { left: number; top: number; w: number; h: number; rot: number };
const BOARD_LAYOUTS: Record<number, Spot[]> = {
  3: [
    { left: 90, top: 330, w: 470, h: 600, rot: -4 },
    { left: 520, top: 380, w: 470, h: 600, rot: 3 },
    { left: 310, top: 960, w: 460, h: 560, rot: 1 },
  ],
  4: [
    { left: 90, top: 330, w: 470, h: 600, rot: -4 },
    { left: 520, top: 380, w: 470, h: 600, rot: 3 },
    { left: 110, top: 960, w: 430, h: 520, rot: 2 },
    { left: 540, top: 1010, w: 430, h: 520, rot: -3 },
  ],
  5: [
    { left: 90, top: 330, w: 440, h: 560, rot: -4 },
    { left: 550, top: 360, w: 440, h: 560, rot: 3 },
    { left: 90, top: 1000, w: 400, h: 480, rot: 2 },
    { left: 590, top: 1020, w: 400, h: 480, rot: -3 },
    { left: 335, top: 690, w: 410, h: 500, rot: 1 },
  ],
};

const OutfitBoard: React.FC<{ items: Item[] }> = ({ items }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const zoom = interpolate(frame, [0, durationInFrames], [1.0, 1.05]);
  const shown = items.slice(0, 5);
  const spots = BOARD_LAYOUTS[Math.max(3, shown.length)] || BOARD_LAYOUTS[5];
  const total = items.reduce((sum, i) => sum + i.price, 0);
  return (
    <AbsoluteFill style={{ background: colors.bg }}>
      <div style={{ position: "absolute", top: 150, width: "100%", textAlign: "center", fontFamily: fonts.sans, fontSize: 34, letterSpacing: 6, color: colors.muted }}>
        THE FIT
      </div>
      <AbsoluteFill style={{ transform: `scale(${zoom})` }}>
        {shown.map((it, i) => {
          const spot = spots[i];
          const s = spring({ frame: frame - i * 5, fps, config: { damping: 200 } });
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: spot.left,
                top: spot.top,
                width: spot.w,
                height: spot.h,
                background: colors.card,
                borderRadius: 18,
                padding: 18,
                boxShadow: "0 18px 40px rgba(43,43,43,0.12)",
                transform: `rotate(${spot.rot}deg) translateY(${interpolate(s, [0, 1], [60, 0])}px)`,
                opacity: s,
              }}
            >
              <Img src={staticFile(it.image)} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            </div>
          );
        })}
      </AbsoluteFill>
      <div style={{ position: "absolute", bottom: 150, width: "100%", textAlign: "center", fontFamily: fonts.serif, fontSize: 56, color: colors.ink }}>
        {items.length} pieces · {inr(total)}
      </div>
      <Wordmark />
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

// ---------- "finds" reels: one product type, every item under a price cap ----------

const CapBadge: React.FC<{ cap: number; text?: string; style?: React.CSSProperties }> = ({ cap, text, style }) => (
  <div
    style={{
      display: "inline-block",
      padding: "14px 30px",
      borderRadius: 50,
      background: colors.accent,
      color: "#fff",
      fontFamily: fonts.sans,
      fontWeight: 700,
      fontSize: 44,
      letterSpacing: 1,
      ...style,
    }}
  >
    {text || `each under ${inr(cap)}`}
  </div>
);

const badgeText = (kind: Look["kind"], cap: number) =>
  kind === "guess" ? "guess the price" : kind === "pricedrop" ? "price drops · tracked daily" : `each under ${inr(cap)}`;

const FindsHook: React.FC<{ hook: string; subhook?: string; cap: number; kind?: Look["kind"] }> = ({ hook, subhook, cap, kind }) => {
  const a = useEnter(0);
  const b = useEnter(8);
  const c = useEnter(14);
  return (
    <AbsoluteFill style={{ background: colors.bg, justifyContent: "center", padding: 90 }}>
      <div style={{ ...a, fontFamily: fonts.serif, fontSize: 96, lineHeight: 1.1, color: colors.ink }}>{hook}</div>
      <div style={{ ...b, marginTop: 44 }}>
        <CapBadge cap={cap} text={badgeText(kind, cap)} />
      </div>
      {subhook ? <div style={{ ...c, marginTop: 34, fontFamily: fonts.sans, fontSize: 48, color: colors.muted }}>{subhook}</div> : null}
      <Wordmark />
    </AbsoluteFill>
  );
};

const FindCard: React.FC<{ item: Item; index: number; total: number; kind?: Look["kind"] }> = ({ item, index, total, kind }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const guess = kind === "guess";
  const revealAt = Math.round(durationInFrames * 0.5);
  const reveal = spring({ frame: frame - revealAt, fps, config: { damping: 12 } });
  const img = useEnter(0);
  const text = useEnter(5);
  const price = useEnter(9);
  const zoom = interpolate(frame, [0, durationInFrames], [1.0, 1.04]);
  return (
    <AbsoluteFill style={{ background: colors.bg, alignItems: "center", padding: "120px 70px" }}>
      <div style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontFamily: fonts.serif, fontSize: 84, color: colors.accent }}>#{index + 1}</div>
        <div style={{ fontFamily: fonts.sans, fontSize: 30, color: colors.muted, letterSpacing: 4 }}>
          {index + 1} / {total}
        </div>
      </div>
      <div
        style={{
          ...img,
          marginTop: 24,
          width: 940,
          height: 1080,
          background: colors.card,
          borderRadius: 28,
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Img src={staticFile(item.image)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top", transform: `scale(${zoom})` }} />
      </div>
      <div style={{ ...text, marginTop: 40, fontFamily: fonts.serif, fontSize: 60, lineHeight: 1.15, color: colors.ink, textAlign: "center" }}>
        {item.name}
      </div>
      {guess ? (
        <div style={{ position: "relative", marginTop: 22, height: 96, width: "100%", display: "flex", justifyContent: "center" }}>
          <div style={{ position: "absolute", opacity: 1 - Math.min(1, reveal), fontFamily: fonts.sans, fontSize: 64, fontWeight: 700, color: colors.ink }}>
            Guess the price?
          </div>
          <div style={{ position: "absolute", opacity: Math.min(1, reveal), transform: `scale(${interpolate(reveal, [0, 1], [1.6, 1])})`, fontFamily: fonts.sans, fontSize: 84, fontWeight: 700, color: colors.accent }}>
            {inr(item.price)}
          </div>
        </div>
      ) : (
        <div style={{ ...price, marginTop: 22, fontFamily: fonts.sans, fontSize: 76, fontWeight: 700, color: colors.accent }}>
          {kind === "pricedrop" && item.wasPrice ? (
            <span style={{ fontSize: 46, fontWeight: 400, color: colors.muted, textDecoration: "line-through", marginRight: 18 }}>{inr(item.wasPrice)}</span>
          ) : null}
          {inr(item.price)} <span style={{ fontSize: 36, fontWeight: 400, color: colors.muted }}>· {kind === "pricedrop" && item.dropPct ? `-${item.dropPct}%` : item.store}</span>
        </div>
      )}
      {kind === "pricedrop" && item.wasDate ? (
        <div style={{ ...price, marginTop: 10, fontFamily: fonts.sans, fontSize: 28, color: colors.muted }}>
          vs highest price we recorded in the last 30 days · {item.store}
        </div>
      ) : item.why ? (
        <div style={{ ...price, marginTop: 14, fontFamily: fonts.sans, fontSize: 36, color: colors.muted, textAlign: "center" }}>{item.why}</div>
      ) : null}
    </AbsoluteFill>
  );
};

const FindsGrid: React.FC<{ items: Item[]; cta: string; cap: number; kind?: Look["kind"] }> = ({ items, cta, cap, kind }) => {
  const { fps } = useVideoConfig();
  const head = useEnter(0);
  const ctaIn = useEnter(Math.round(0.8 * fps));
  const cols = items.length <= 4 ? 2 : 3;
  return (
    <AbsoluteFill style={{ background: colors.bg, padding: "140px 60px", alignItems: "center" }}>
      <div style={head}>
        <CapBadge cap={cap} text={kind === "guess" ? "the real prices" : kind === "pricedrop" ? "dropped this week" : undefined} />
      </div>
      <div style={{ marginTop: 44, display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 22, width: "100%" }}>
        {items.map((it, i) => (
          <div key={i} style={{ background: colors.card, borderRadius: 18, padding: 14, textAlign: "center" }}>
            <Img src={staticFile(it.image)} style={{ width: "100%", height: cols === 2 ? 470 : 360, objectFit: "contain" }} />
            <div style={{ fontFamily: fonts.sans, fontSize: 26, color: colors.ink, marginTop: 8, lineHeight: 1.2 }}>
              #{i + 1} {it.name}
            </div>
            <div style={{ fontFamily: fonts.sans, fontSize: 34, fontWeight: 700, color: colors.accent }}>{inr(it.price)}</div>
          </div>
        ))}
      </div>
      <div style={{ ...ctaIn, marginTop: 46, fontFamily: fonts.serif, fontSize: 58, color: colors.ink, textAlign: "center" }}>{cta}</div>
      {kind === "guess" ? <div style={{ marginTop: 12, fontFamily: fonts.sans, fontSize: 34, color: colors.accent }}>Links in bio</div> : null}
      <div style={{ marginTop: 16, fontFamily: fonts.sans, fontSize: 28, color: colors.muted }}>
        {brand.disclosure} · links earn a small commission
      </div>
      <Wordmark />
    </AbsoluteFill>
  );
};

const FindsReel: React.FC<Look> = (look) => {
  const f = (sec: number) => Math.round(sec * timing.fps);
  const cap = look.budget || Math.max(...look.items.map((i) => i.price));
  let t = 0;
  const seq: React.ReactNode[] = [
    <Sequence key="hook" from={0} durationInFrames={f(timing.hook)}>
      <FindsHook hook={look.hook} subhook={look.subhook} cap={cap} kind={look.kind} />
    </Sequence>,
  ];
  t += timing.hook;
  const per = look.kind === "guess" ? timing.perGuess : timing.perFind;
  look.items.forEach((item, i) => {
    seq.push(
      <Sequence key={`find${i}`} from={f(t)} durationInFrames={f(per)}>
        <FindCard item={item} index={i} total={look.items.length} kind={look.kind} />
      </Sequence>,
    );
    t += per;
  });
  seq.push(
    <Sequence key="grid" from={f(t)} durationInFrames={f(timing.findsGrid)}>
      <FindsGrid items={look.items} cta={look.cta} cap={cap} kind={look.kind} />
    </Sequence>,
  );
  return (
    <AbsoluteFill style={{ background: colors.bg }}>
      {seq}
      {look.music ? <Music src={look.music} /> : null}
    </AbsoluteFill>
  );
};

// quiet background track with a short fade in/out
const Music: React.FC<{ src: string }> = ({ src }) => {
  const { durationInFrames, fps } = useVideoConfig();
  return (
    <Audio
      loop
      src={staticFile(src)}
      volume={(f) =>
        interpolate(f, [0, fps * 0.6, durationInFrames - fps * 1.2, durationInFrames], [0, 0.45, 0.45, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
      }
    />
  );
};

// ---------- the reel ----------

export const reelDurationInFrames = (look: Look) => {
  const s = timing;
  if (look.kind && look.kind !== "outfit")
    return Math.round((s.hook + look.items.length * (look.kind === "guess" ? s.perGuess : s.perFind) + s.findsGrid) * s.fps);
  const fits = look.fitImages?.length || 0;
  const visual = fits > 0 ? fits * s.perFitImage : s.board;
  const seconds = s.hook + visual + look.items.length * s.perItem + s.grid;
  return Math.round(seconds * s.fps);
};

export const Reel: React.FC<Look> = (look) => {
  if (look.kind && look.kind !== "outfit") return <FindsReel {...look} />;
  const f = (sec: number) => Math.round(sec * timing.fps);
  let t = 0;
  const seq: React.ReactNode[] = [];

  seq.push(
    <Sequence key="hook" from={f(t)} durationInFrames={f(timing.hook)}>
      <Hook hook={look.hook} subhook={look.subhook} />
    </Sequence>,
  );
  t += timing.hook;

  const fits = look.fitImages || [];
  if (fits.length === 0) {
    seq.push(
      <Sequence key="board" from={f(t)} durationInFrames={f(timing.board)}>
        <OutfitBoard items={look.items} />
      </Sequence>,
    );
    t += timing.board;
  }
  fits.forEach((src, i) => {
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
      {fits.length > 0 ? <AiLabel /> : null}
    </AbsoluteFill>
  );
};
