/**
 * OpenDisk Manager — Icon & Branding Asset Generator
 * Generates production PNG, multi-resolution ICO, and SVG branding assets.
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

// Helper: Compute CRC32 for PNG chunks
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function createPngChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(12 + len);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, "ascii");
  data.copy(chunk, 8);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = crc32(typeAndData);
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

function createPng(width, height, getPixelRgba) {
  const rawData = Buffer.alloc(height * (1 + width * 4));
  let offset = 0;

  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0; // Filter: None
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getPixelRgba(x, y, width, height);
      rawData[offset++] = r;
      rawData[offset++] = g;
      rawData[offset++] = b;
      rawData[offset++] = a;
    }
  }

  const compressed = zlib.deflateSync(rawData, { level: 9 });

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // 8 bits per channel
  ihdrData[9] = 6; // RGBA color type
  ihdrData[10] = 0; // Deflate
  ihdrData[11] = 0; // Standard filter
  ihdrData[12] = 0; // No interlace
  const ihdrChunk = createPngChunk("IHDR", ihdrData);

  const idatChunk = createPngChunk("IDAT", compressed);
  const iendChunk = createPngChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

// Draw the OpenDisk Manager icon at any resolution
function renderIconPixel(x, y, size) {
  const cx = size / 2;
  const cy = size / 2;
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const normDist = dist / (size / 2);

  // Outer bounds margin
  if (normDist > 0.96) {
    return [0, 0, 0, 0];
  }

  // Outer metallic bezel ring (0.86 to 0.95)
  if (normDist >= 0.86) {
    const bezelT = (normDist - 0.86) / 0.09;
    // Metallic dark slate with subtle cyan rim light at top
    const angle = Math.atan2(dy, dx);
    const topHighlight = Math.max(0, -Math.sin(angle));
    const r = Math.round(18 + topHighlight * 25);
    const g = Math.round(30 + topHighlight * 70);
    const b = Math.round(50 + topHighlight * 120);
    const a = Math.round(255 * (1 - Math.max(0, (normDist - 0.93) / 0.03)));
    return [r, g, b, a];
  }

  // Dark platter chamber (0.82 to 0.86)
  if (normDist >= 0.82) {
    return [11, 15, 25, 255];
  }

  // Partition track ring (0.42 to 0.82) - divided into partition sectors!
  if (normDist >= 0.42) {
    let angle = Math.atan2(dy, dx); // -PI to +PI
    if (angle < 0) angle += 2 * Math.PI; // 0 to 2*PI

    // 4 partition sectors with separator gaps
    // Sector 1: 0 to 1.6 rad (OS System C: - Cyan/Blue gradient)
    // Sector 2: 1.65 to 3.4 rad (Data D: - Electric Blue)
    // Sector 3: 3.45 to 4.7 rad (Data E: - Purple / WinRE)
    // Sector 4: 4.75 to 6.2 rad (Unallocated - Emerald green)

    const isGap = 
      (angle >= 1.60 && angle < 1.66) ||
      (angle >= 3.40 && angle < 3.46) ||
      (angle >= 4.70 && angle < 4.76) ||
      (angle >= 6.22 || angle < 0.06);

    if (isGap) {
      return [9, 13, 22, 255]; // Deep separator gap
    }

    // Groove ripple
    const groove = 0.92 + 0.08 * Math.cos(normDist * 50);

    if (angle < 1.60) {
      // Sector 1: System / Active OS (Vibrant Cyan #00F2FE -> #0284C7)
      const t = angle / 1.60;
      const r = Math.round((14 + t * 2) * groove);
      const g = Math.round((165 + t * 60) * groove);
      const b = Math.round(233 * groove);
      return [r, g, b, 255];
    } else if (angle < 3.40) {
      // Sector 2: Data Volume (Royal Blue #3B82F6 -> #1D4ED8)
      const t = (angle - 1.66) / 1.74;
      const r = Math.round((37 + t * 20) * groove);
      const g = Math.round((99 + t * 40) * groove);
      const b = Math.round((235 - t * 40) * groove);
      return [r, g, b, 255];
    } else if (angle < 4.70) {
      // Sector 3: Recovery / Secure (Indigo Purple #8B5CF6 -> #6D28D9)
      const t = (angle - 3.46) / 1.24;
      const r = Math.round((139 - t * 30) * groove);
      const g = Math.round((92 - t * 30) * groove);
      const b = Math.round((246 - t * 20) * groove);
      return [r, g, b, 255];
    } else {
      // Sector 4: Unallocated / Available Space (Emerald #10B981)
      const t = (angle - 4.76) / 1.46;
      const r = Math.round((16 + t * 20) * groove);
      const g = Math.round((185 - t * 30) * groove);
      const b = Math.round((129 - t * 40) * groove);
      return [r, g, b, 255];
    }
  }

  // Inner ring track separator (0.38 to 0.42)
  if (normDist >= 0.38) {
    return [15, 23, 42, 255];
  }

  // Center spindle hub (0.16 to 0.38)
  if (normDist >= 0.16) {
    const hubT = (normDist - 0.16) / 0.22;
    const r = Math.round(30 + hubT * 40);
    const g = Math.round(41 + hubT * 50);
    const b = Math.round(59 + hubT * 70);
    return [r, g, b, 255];
  }

  // Center spindle gem (0 to 0.16)
  const gemT = normDist / 0.16;
  const r = Math.round(56 - gemT * 30);
  const g = Math.round(189 - gemT * 90);
  const b = Math.round(248 - gemT * 80);
  return [r, g, b, 255];
}

function buildIcoFile(pngBuffers) {
  // ICO Header: 6 bytes
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // Type: 1 = ICO
  header.writeUInt16LE(pngBuffers.length, 4); // Count of images

  let currentOffset = 6 + pngBuffers.length * 16;
  const entries = [];

  pngBuffers.forEach(({ size, png }) => {
    const entry = Buffer.alloc(16);
    entry[0] = size === 256 ? 0 : size; // Width (0 for 256)
    entry[1] = size === 256 ? 0 : size; // Height
    entry[2] = 0; // Colors (0 = truecolor)
    entry[3] = 0; // Reserved
    entry.writeUInt16LE(1, 4); // Color planes
    entry.writeUInt16LE(32, 6); // Bits per pixel
    entry.writeUInt32LE(png.length, 8); // Size of image data
    entry.writeUInt32LE(currentOffset, 12); // Offset
    entries.push(entry);
    currentOffset += png.length;
  });

  return Buffer.concat([
    header,
    ...entries,
    ...pngBuffers.map(p => p.png)
  ]);
}

function buildSvgLogo() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bezelGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1E293B" />
      <stop offset="100%" stop-color="#090D16" />
    </linearGradient>
    <linearGradient id="osSectorGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38BDF8" />
      <stop offset="100%" stop-color="#0284C7" />
    </linearGradient>
    <linearGradient id="dataSectorGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#60A5FA" />
      <stop offset="100%" stop-color="#2563EB" />
    </linearGradient>
    <linearGradient id="recoverySectorGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#A78BFA" />
      <stop offset="100%" stop-color="#7C3AED" />
    </linearGradient>
    <linearGradient id="unallocatedSectorGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#34D399" />
      <stop offset="100%" stop-color="#059669" />
    </linearGradient>
    <linearGradient id="hubGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#334155" />
      <stop offset="100%" stop-color="#0F172A" />
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="8" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <!-- Outer Bezel -->
  <rect x="24" y="24" width="464" height="464" rx="96" fill="url(#bezelGrad)" stroke="#38BDF8" stroke-width="4" stroke-opacity="0.3" />
  
  <!-- Outer Platter Ring -->
  <circle cx="256" cy="256" r="200" fill="#0A0F1D" stroke="#1E293B" stroke-width="6" />

  <!-- Partition Sectors (Drawn as arcs) -->
  <!-- Sector 1: OS (Cyan) -->
  <path d="M 256 76 A 180 180 0 0 1 432 216 L 354 233 A 100 100 0 0 0 256 156 Z" fill="url(#osSectorGrad)" filter="url(#glow)" />
  
  <!-- Sector 2: Data (Blue) -->
  <path d="M 434 226 A 180 180 0 0 1 318 430 L 290 352 A 100 100 0 0 0 356 240 Z" fill="url(#dataSectorGrad)" />

  <!-- Sector 3: Recovery (Purple) -->
  <path d="M 306 434 A 180 180 0 0 1 122 396 L 181 334 A 100 100 0 0 0 284 354 Z" fill="url(#recoverySectorGrad)" />

  <!-- Sector 4: Unallocated (Emerald) -->
  <path d="M 114 386 A 180 180 0 0 1 246 76 L 250 156 A 100 100 0 0 0 176 328 Z" fill="url(#unallocatedSectorGrad)" />

  <!-- Spindle Hub -->
  <circle cx="256" cy="256" r="80" fill="url(#hubGrad)" stroke="#38BDF8" stroke-width="3" stroke-opacity="0.6" />
  <circle cx="256" cy="256" r="42" fill="#0284C7" />
  <circle cx="256" cy="256" r="22" fill="#38BDF8" />
</svg>`;
}

// Generate all assets
function generateAssets() {
  const assetsDir = path.join(__dirname, "..", "assets", "icons");
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }

  console.log("Generating OpenDisk Manager brand assets...");

  // 1. Render PNG at 256x256
  console.log("  Rendering 256x256 icon...");
  const png256 = createPng(256, 256, (x, y) => renderIconPixel(x, y, 256));
  fs.writeFileSync(path.join(assetsDir, "icon.png"), png256);
  fs.writeFileSync(path.join(assetsDir, "icon-256.png"), png256);

  // 2. Render smaller sizes for ICO bundle
  console.log("  Rendering multi-resolution sizes (128, 64, 48, 32, 16)...");
  const png128 = createPng(128, 128, (x, y) => renderIconPixel(x, y, 128));
  const png64 = createPng(64, 64, (x, y) => renderIconPixel(x, y, 64));
  const png48 = createPng(48, 48, (x, y) => renderIconPixel(x, y, 48));
  const png32 = createPng(32, 32, (x, y) => renderIconPixel(x, y, 32));
  const png16 = createPng(16, 16, (x, y) => renderIconPixel(x, y, 16));

  fs.writeFileSync(path.join(assetsDir, "icon-128.png"), png128);
  fs.writeFileSync(path.join(assetsDir, "icon-64.png"), png64);
  fs.writeFileSync(path.join(assetsDir, "icon-32.png"), png32);
  fs.writeFileSync(path.join(assetsDir, "icon-16.png"), png16);

  // 3. Build Windows ICO containing all resolutions
  console.log("  Compiling Windows multi-resolution icon.ico...");
  const icoData = buildIcoFile([
    { size: 256, png: png256 },
    { size: 128, png: png128 },
    { size: 64, png: png64 },
    { size: 48, png: png48 },
    { size: 32, png: png32 },
    { size: 16, png: png16 }
  ]);
  fs.writeFileSync(path.join(assetsDir, "icon.ico"), icoData);

  // 4. SVG Logo
  console.log("  Writing SVG brand logo...");
  fs.writeFileSync(path.join(assetsDir, "logo.svg"), buildSvgLogo());

  console.log("All brand assets successfully generated in assets/icons/!");
}

generateAssets();
