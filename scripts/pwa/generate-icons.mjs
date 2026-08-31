/**
 * 生成 PWA 图标集。
 *
 * 「K」字形用矢量路径绘制而非 <text>，避免依赖运行环境是否安装对应字体。
 * 输出：
 *   public/icons/icon-192.png          任意用途（Android/桌面安装）
 *   public/icons/icon-512.png          任意用途（Google Play / Chrome 安装弹窗）
 *   public/icons/icon-maskable-512.png 可遮罩（Android 自适应图标，内容收在安全区内）
 *   public/icons/apple-touch-icon.png  iOS 添加到主屏幕
 *
 * 运行：node scripts/pwa/generate-icons.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "public", "icons");

/** 品牌色，与 app/globals.css 中的 --brand-badge 保持一致 */
const GRADIENT_FROM = "#d6a163";
const GRADIENT_TO = "#a26b2b";
const GLYPH_COLOR = "#10151f";
const BACKDROP = "#07101b";

function buildSvg({ size, glyphScale, cornerRadiusRatio }) {
  // 「K」字形在 100x100 坐标系内，重心居中于 (50,50)
  const stem = { x: 27, y: 24, w: 12, h: 52 };
  const upperArm = "39,44 73,24 73,36 39,56";
  const lowerLeg = "39,44 73,64 73,76 39,56";

  const radius = size * cornerRadiusRatio;
  const glyphId = `glyph-${size}-${Math.round(glyphScale * 100)}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="brand" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${GRADIENT_FROM}"/>
      <stop offset="100%" stop-color="${GRADIENT_TO}"/>
    </linearGradient>
    <g id="${glyphId}" fill="${GLYPH_COLOR}">
      <rect x="${stem.x}" y="${stem.y}" width="${stem.w}" height="${stem.h}"/>
      <polygon points="${upperArm}"/>
      <polygon points="${lowerLeg}"/>
    </g>
    <clipPath id="tile-${size}">
      <rect x="0" y="0" width="${size}" height="${size}" rx="${radius}" ry="${radius}"/>
    </clipPath>
  </defs>
  <rect x="0" y="0" width="${size}" height="${size}" fill="${BACKDROP}"/>
  <g clip-path="url(#tile-${size})">
    <rect x="0" y="0" width="${size}" height="${size}" fill="url(#brand)"/>
    <use href="#${glyphId}" transform="translate(${size / 2} ${size / 2}) scale(${(size * glyphScale) / 100}) translate(-50 -50)"/>
  </g>
</svg>`;
}

const TARGETS = [
  // 常规图标：圆角方形，字形占 56%
  { name: "icon-192.png", size: 192, glyphScale: 0.56, cornerRadiusRatio: 0.22 },
  { name: "icon-512.png", size: 512, glyphScale: 0.56, cornerRadiusRatio: 0.22 },
  // 可遮罩图标：满幅无圆角，字形收进中心 80% 安全圆内
  { name: "icon-maskable-512.png", size: 512, glyphScale: 0.5, cornerRadiusRatio: 0 },
  // iOS：系统自行裁圆角，满幅即可
  { name: "apple-touch-icon.png", size: 180, glyphScale: 0.56, cornerRadiusRatio: 0 },
];

await mkdir(OUT_DIR, { recursive: true });

for (const target of TARGETS) {
  const svg = Buffer.from(buildSvg(target));
  const png = await sharp(svg)
    .resize(target.size, target.size)
    .png({ compressionLevel: 9 })
    .toBuffer();
  await writeFile(join(OUT_DIR, target.name), png);
  console.log(`  ✓ ${target.name} (${target.size}x${target.size}, ${(png.length / 1024).toFixed(1)} KB)`);
}

console.log(`\n图标已输出到 ${OUT_DIR}`);
