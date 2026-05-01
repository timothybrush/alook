// Avatar parts library — inline SVG components for modular avatar generation.
// Ported from Jacky's Notion-style avatar generator prototype.
// All shapes are pure SVG paths — no external PNG files needed.

import type { ReactNode } from "react";

// ─────────────────────────────────────────────────────────────
// STROKE / FILL CONSTANTS
// ─────────────────────────────────────────────────────────────
const STROKE = "#1F1F1F";
const FILL = "#FFFFFF";
const SW_OUT = 8;
const SW_INNER = 5;
const SW_FACE = 5;

const sp = (w = SW_OUT) =>
  ({ fill: FILL, stroke: STROKE, strokeWidth: w, strokeLinejoin: "round" as const, strokeLinecap: "round" as const });
const lp = (w = SW_INNER) =>
  ({ fill: "none", stroke: STROKE, strokeWidth: w, strokeLinejoin: "round" as const, strokeLinecap: "round" as const });
const lpf = (w = SW_FACE) =>
  ({ fill: "none", stroke: STROKE, strokeWidth: w, strokeLinejoin: "round" as const, strokeLinecap: "round" as const });
const fp = { fill: STROKE };

// ─────────────────────────────────────────────────────────────
// PALETTES
// ─────────────────────────────────────────────────────────────
export interface ColorOption {
  name: string;
  value: string;
}

export const BG_COLORS: ColorOption[] = [
  { name: "紫", value: "#9B7FE8" },
  { name: "青", value: "#2BAA9C" },
  { name: "橙", value: "#F39A4F" },
  { name: "蓝", value: "#3D7EE8" },
  { name: "粉", value: "#F8B4C4" },
  { name: "黄", value: "#F4C141" },
  { name: "绿", value: "#7FCB6F" },
  { name: "米", value: "#D6CCB8" },
  { name: "红", value: "#EE5E48" },
  { name: "湖蓝", value: "#3FA8C0" },
  { name: "雾灰", value: "#C9D1D9" },
  { name: "深紫", value: "#6A4DCC" },
];

// ─────────────────────────────────────────────────────────────
// SHAPES (outlines)
// ─────────────────────────────────────────────────────────────
export interface ShapeDef {
  name: string;
  face: { cx: number; cy: number; w: number };
  render: () => ReactNode;
}

export const Shapes: Record<string, ShapeDef> = {
  circle: {
    name: "圆形",
    face: { cx: 100, cy: 105, w: 80 },
    render: () => <circle cx="100" cy="100" r="70" {...sp()} />,
  },
  rounded: {
    name: "方形",
    face: { cx: 100, cy: 105, w: 90 },
    render: () => <rect x="30" y="30" width="140" height="140" rx="20" {...sp()} />,
  },
  hexagon: {
    name: "六边形",
    face: { cx: 100, cy: 105, w: 86 },
    render: () => <path d="M100 28 L162 64 L162 136 L100 172 L38 136 L38 64 Z" {...sp()} />,
  },
  task: {
    name: "任务",
    face: { cx: 92, cy: 92, w: 70 },
    render: () => (
      <g>
        <rect x="34" y="34" width="132" height="132" rx="14" {...sp()} />
        <path d="M70 110 L102 138 L168 64" {...lp(SW_OUT)} />
      </g>
    ),
  },
  book: {
    name: "笔记",
    face: { cx: 100, cy: 105, w: 90 },
    render: () => (
      <g>
        <path d="M30 60 C 60 50, 85 56, 100 70 C 115 56, 140 50, 170 60 L 170 158 C 140 148, 115 154, 100 168 C 85 154, 60 148, 30 158 Z" {...sp()} />
        <path d="M100 70 L100 84" {...lp(SW_INNER)} />
        <path d="M100 154 L100 168" {...lp(SW_INNER)} />
      </g>
    ),
  },
  mail: {
    name: "邮件",
    face: { cx: 100, cy: 118, w: 80 },
    render: () => (
      <g>
        <rect x="30" y="56" width="140" height="100" rx="12" {...sp()} />
        <path d="M36 64 L100 108 L164 64" {...lp(SW_INNER)} />
      </g>
    ),
  },
  calendar: {
    name: "日历",
    face: { cx: 100, cy: 122, w: 80 },
    render: () => (
      <g>
        <rect x="30" y="48" width="140" height="124" rx="12" {...sp()} />
        <path d="M30 80 L170 80" {...lp(SW_INNER)} />
        <path d="M62 36 L62 60" {...lp(SW_INNER)} />
        <path d="M138 36 L138 60" {...lp(SW_INNER)} />
      </g>
    ),
  },
  bulb: {
    name: "想法",
    face: { cx: 100, cy: 100, w: 70 },
    render: () => (
      <g>
        <path d="M100 26 C 62 26, 36 52, 36 86 C 36 110, 52 126, 68 138 L 68 148 A 6 6 0 0 0 74 154 L 126 154 A 6 6 0 0 0 132 148 L 132 138 C 148 126, 164 110, 164 86 C 164 52, 138 26, 100 26 Z" {...sp()} />
        <path d="M76 162 L124 162" {...lp(SW_INNER)} />
        <path d="M82 172 L118 172" {...lp(SW_INNER)} />
      </g>
    ),
  },
  folder: {
    name: "文件夹",
    face: { cx: 100, cy: 118, w: 90 },
    render: () => (
      <path d="M30 64 A 10 10 0 0 1 40 54 L 84 54 L 96 66 L 160 66 A 10 10 0 0 1 170 76 L 170 158 A 10 10 0 0 1 160 168 L 40 168 A 10 10 0 0 1 30 158 Z" {...sp()} />
    ),
  },
  mountain: {
    name: "目标",
    face: { cx: 100, cy: 130, w: 70 },
    render: () => (
      <g>
        <path d="M28 168 L100 56 L172 168 Z" {...sp()} />
        <path d="M100 56 L100 28" {...lpf(SW_INNER)} />
        <path d="M100 30 L122 38 L100 46" {...sp(SW_INNER)} />
      </g>
    ),
  },
};

export const SHAPE_KEYS = Object.keys(Shapes);

// ─────────────────────────────────────────────────────────────
// NOSES
// ─────────────────────────────────────────────────────────────
export interface NoseDef {
  name: string;
  render: () => ReactNode;
}

export const Noses: Record<string, NoseDef> = {
  dot:   { name: "点",     render: () => <circle cx="0" cy="0" r="3.2" {...fp} /> },
  dash:  { name: "横",     render: () => <line x1="-8" y1="0" x2="8" y2="0" {...lpf(SW_FACE)} /> },
  hookL: { name: "L 形",   render: () => <path d="M-4 -6 L-4 5 L7 5" {...lpf(SW_FACE)} /> },
  smile: { name: "微笑",   render: () => <path d="M-8 -3 Q0 7 8 -3" {...lpf(SW_FACE)} /> },
  caret: { name: "尖角",   render: () => <path d="M-8 5 L0 -5 L8 5" {...lpf(SW_FACE)} /> },
  arrow: { name: "小箭头", render: () => <path d="M-8 -3 L0 4 L8 -3" {...lpf(SW_FACE)} /> },
  oh:    { name: "o",      render: () => <circle cx="0" cy="0" r="4" {...lpf(SW_FACE - 1)} /> },
};

export const NOSE_KEYS = Object.keys(Noses);

// ─────────────────────────────────────────────────────────────
// EYES
// ─────────────────────────────────────────────────────────────
export interface EyeDef {
  name: string;
  render: (dx: number) => ReactNode;
}

const eye = (l: ReactNode, r: ReactNode = l) => (dx: number) => (
  <g>
    <g transform={`translate(${-dx}, 0)`}>{l}</g>
    <g transform={`translate(${dx}, 0)`}>{r}</g>
  </g>
);

export const Eyes: Record<string, EyeDef> = {
  dots: { name: "点点", render: eye(<circle cx="0" cy="0" r="4.5" {...fp} />) },
  big: {
    name: "大眼睛",
    render: eye(
      <g>
        <circle cx="0" cy="0" r="7" {...sp(SW_FACE - 1)} />
        <circle cx="2" cy="-2" r="2" {...fp} />
      </g>
    ),
  },
  rings:  { name: "圆圈", render: eye(<circle cx="0" cy="0" r="5" {...lpf(SW_FACE - 1)} />) },
  arches: { name: "弯弯", render: eye(<path d="M-7 3 Q0 -7 7 3" {...lpf(SW_FACE)} />) },
  lines:  { name: "横线", render: eye(<line x1="-7" y1="0" x2="7" y2="0" {...lpf(SW_FACE)} />) },
  happy:  { name: "笑眼", render: eye(<path d="M-7 3 L0 -5 L7 3" {...lpf(SW_FACE)} />) },
  sleepy: { name: "困困", render: eye(<path d="M-7 -2 Q0 6 7 -2" {...lpf(SW_FACE)} />) },
  shy: {
    name: "半月",
    render: eye(<path d="M-6 -3 A6 6 0 0 1 6 -3 L6 1 A6 6 0 0 1 -6 1 Z" {...fp} />),
  },
  wink: {
    name: "俏皮",
    render: (dx: number) => (
      <g>
        <g transform={`translate(${-dx}, 0)`}><circle cx="0" cy="0" r="4.5" {...fp} /></g>
        <g transform={`translate(${dx}, 0)`}><path d="M-7 1 Q0 -6 7 1" {...lpf(SW_FACE)} /></g>
      </g>
    ),
  },
};

export const EYE_KEYS = Object.keys(Eyes);

// ─────────────────────────────────────────────────────────────
// AVATAR CONFIG
// ─────────────────────────────────────────────────────────────
export interface AvatarConfig {
  shape: string;
  eye: string;
  nose: string;
  bg: number;
}

export const DEFAULT_CONFIG: AvatarConfig = {
  shape: "book",
  eye: "happy",
  nose: "dash",
  bg: 1,
};

// ─────────────────────────────────────────────────────────────
// PRESETS
// ─────────────────────────────────────────────────────────────
export interface Preset {
  name: string;
  config: AvatarConfig;
}

export const PRESETS: Preset[] = [
  { name: "任务",  config: { shape: "task",     nose: "dot",   eye: "dots",   bg: 0 } },
  { name: "笔记",  config: { shape: "book",     nose: "dash",  eye: "happy",  bg: 1 } },
  { name: "邮件",  config: { shape: "mail",     nose: "smile", eye: "dots",   bg: 3 } },
  { name: "日程",  config: { shape: "calendar", nose: "dot",   eye: "dots",   bg: 4 } },
  { name: "想法",  config: { shape: "bulb",     nose: "oh",    eye: "rings",  bg: 5 } },
  { name: "项目",  config: { shape: "folder",   nose: "dash",  eye: "lines",  bg: 7 } },
  { name: "目标",  config: { shape: "mountain", nose: "caret", eye: "arches", bg: 8 } },
  { name: "梦想",  config: { shape: "circle",   nose: "smile", eye: "shy",    bg: 11 } },
  { name: "收纳",  config: { shape: "rounded",  nose: "dot",   eye: "sleepy", bg: 6 } },
  { name: "探索",  config: { shape: "hexagon",  nose: "hookL", eye: "wink",   bg: 9 } },
  { name: "专注",  config: { shape: "task",     nose: "caret", eye: "lines",  bg: 2 } },
  { name: "收藏",  config: { shape: "book",     nose: "oh",    eye: "rings",  bg: 10 } },
];

// ─────────────────────────────────────────────────────────────
// RANDOM CONFIG
// ─────────────────────────────────────────────────────────────
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export function randomConfig(): AvatarConfig {
  return {
    shape: pick(SHAPE_KEYS),
    eye: pick(EYE_KEYS),
    nose: pick(NOSE_KEYS),
    bg: Math.floor(Math.random() * BG_COLORS.length),
  };
}

// ─────────────────────────────────────────────────────────────
// AVATAR RENDERER
// ─────────────────────────────────────────────────────────────
interface AvatarRendererProps {
  config: AvatarConfig;
  size?: number;
  className?: string;
}

export function AvatarRenderer({ config, size = 200, className }: AvatarRendererProps) {
  const sh = Shapes[config.shape] ?? Shapes.book!;
  const ey = Eyes[config.eye];
  const no = Noses[config.nose];
  const bgColor = BG_COLORS[config.bg]?.value ?? BG_COLORS[0]!.value;

  const { cx, cy, w } = sh.face;
  const eyeDx = Math.max(11, w * 0.22);
  const eyeY = cy - Math.max(10, w * 0.14);

  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={className}
      style={{ display: "block" }}
    >
      <rect x="0" y="0" width="200" height="200" rx="56" fill={bgColor} />
      {sh.render()}
      {ey && <g transform={`translate(${cx}, ${eyeY})`}>{ey.render(eyeDx)}</g>}
      {no && <g transform={`translate(${cx}, ${cy + 5})`}>{no.render()}</g>}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// SERIALIZE / DESERIALIZE
// ─────────────────────────────────────────────────────────────
const AVATAR_PREFIX = "avatar:";

export function serializeAvatarConfig(config: AvatarConfig): string {
  return AVATAR_PREFIX + JSON.stringify(config);
}

function isValidAvatarConfig(obj: unknown): obj is AvatarConfig {
  if (typeof obj !== "object" || obj === null) return false;
  const rec = obj as Record<string, unknown>;
  return (
    typeof rec.shape === "string" &&
    typeof rec.eye === "string" &&
    typeof rec.nose === "string" &&
    typeof rec.bg === "number"
  );
}

export function parseAvatarUrl(avatarUrl: string | null | undefined): AvatarConfig | null {
  if (!avatarUrl || !avatarUrl.startsWith(AVATAR_PREFIX)) return null;
  try {
    const parsed = JSON.parse(avatarUrl.slice(AVATAR_PREFIX.length));
    if (isValidAvatarConfig(parsed)) return parsed;
    // Fallback for old format (had "outline"/"eyes"/"bgColor" fields)
    if (typeof parsed === "object" && parsed !== null && "outline" in parsed) {
      return DEFAULT_CONFIG;
    }
    return null;
  } catch {
    return null;
  }
}
