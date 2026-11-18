import { ImageResponse } from "next/og";
import { agentStore } from "@/lib/agent/tools";
import { parseVisionDraft } from "@/lib/agent/layout";
import { TV_DESIGN_HEIGHT, TV_DESIGN_WIDTH } from "@/lib/tv/fit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLORS: Record<string, string> = {
  sand: "#f3e4c4",
  coral: "#f0c8c0",
  lilac: "#ddd4f0",
  mint: "#c8e6d8",
  sky: "#c6dff0",
  pink: "#efd0e0",
};

export async function GET(_request: Request, context: { params: Promise<{ secret: string }> }) {
  const { secret: raw } = await context.params;
  const secret = raw.replace(/\.png$/i, "");
  const store = agentStore();
  if (!store) return new Response("not configured", { status: 503 });
  const draft = parseVisionDraft(await store.visionDraft());
  if (!draft || draft.secret !== secret) return new Response("draft not found", { status: 404 });

  const gap = 12;
  const pad = 16;
  const cellW = (TV_DESIGN_WIDTH - pad * 2 - gap * 3) / 4;
  const cellH = (TV_DESIGN_HEIGHT - pad * 2 - gap * 2) / 3;

  return new ImageResponse(
    (
      <div
        style={{
          width: TV_DESIGN_WIDTH,
          height: TV_DESIGN_HEIGHT,
          display: "flex",
          position: "relative",
          background: "linear-gradient(160deg, #1b1b2f 0%, #2a2438 55%, #1b1b2f 100%)",
          color: "#1b1b2f",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: pad,
            top: 10,
            display: "flex",
            color: "#f7f1e6",
            fontSize: 22,
            letterSpacing: 1,
          }}
        >
          Victorii preview · 1280×720 Cast
        </div>
        {draft.cards
          .filter((card) => !card.hidden)
          .map((card) => {
            const left = pad + card.grid.col * (cellW + gap);
            const top = pad + 28 + card.grid.row * (cellH + gap);
            const width = card.grid.colSpan * cellW + (card.grid.colSpan - 1) * gap;
            const height = card.grid.rowSpan * cellH + (card.grid.rowSpan - 1) * gap;
            const bg = COLORS[card.color ?? "sand"] ?? COLORS.sand;
            const font =
              card.fontScale === "lg" ? 28 : card.fontScale === "sm" ? 16 : 20;
            return (
              <div
                key={card.externalId}
                style={{
                  position: "absolute",
                  left,
                  top,
                  width,
                  height,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  gap: 6,
                  padding: 14,
                  borderRadius: 16,
                  background: bg,
                  boxSizing: "border-box",
                }}
              >
                <div style={{ display: "flex", fontSize: 14, fontWeight: 700, textTransform: "uppercase" }}>
                  {card.title || card.kind || card.externalId}
                </div>
                <div style={{ display: "flex", fontSize: font, lineHeight: 1.15 }}>
                  {(card.body || "").slice(0, 160)}
                </div>
              </div>
            );
          })}
      </div>
    ),
    { width: TV_DESIGN_WIDTH, height: TV_DESIGN_HEIGHT },
  );
}
