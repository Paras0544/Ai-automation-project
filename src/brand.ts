// Everything that makes a reel look like "Well Priced". Change it here, every video updates.
export const brand = {
  name: "WELL PRICED",
  handle: "@wellpriced.fit",
  colors: {
    bg: "#F4EFE6", // off-white
    ink: "#2B2B2B", // charcoal
    accent: "#B5603A", // terracotta
    muted: "#8A8378",
    card: "#FFFFFF",
  },
  fonts: {
    serif: "'Playfair Display', Georgia, 'Times New Roman', serif",
    sans: "'Inter', 'Helvetica Neue', Arial, sans-serif",
  },
  aiLabel: "AI-generated look",
  disclosure: "#affiliate",
};

// Timing in seconds for each part of the reel.
export const timing = {
  fps: 30,
  hook: 2.2,
  perFitImage: 2.0,
  board: 3.0, // outfit board scene when there are no AI fit images
  perItem: 1.6,
  grid: 4.5,
  perFind: 2.1, // finds reels: each product card
  findsGrid: 3.6,
  perGuess: 2.9, // guess-the-price: question, then reveal
};

export const inr = (n: number) => "₹" + n.toLocaleString("en-IN");
