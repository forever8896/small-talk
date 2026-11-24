// Pictures in and out of the page. PNGs are read and written with a pure JS codec so every
// byte value is exact; the canvas is only used to open other formats as a starting picture.
import { decode, encode } from "fast-png";

const MAX_SIDE = 1600;

/** Any image file -> { rgba, width, height }, scaled down if large. Exactness does not matter here. */
export async function openPicture(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const width = Math.round(bmp.width * scale), height = Math.round(bmp.height * scale);
  const canvas = new OffscreenCanvas(width, height), ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, width, height); // flatten transparency
  ctx.drawImage(bmp, 0, 0, width, height);
  return { rgba: ctx.getImageData(0, 0, width, height).data, width, height };
}

/** RGBA -> PNG file (written as plain RGB: the alpha channel carries nothing). */
export function toPng({ rgba, width, height }) {
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4) { rgb[j++] = rgba[i]; rgb[j++] = rgba[i + 1]; rgb[j++] = rgba[i + 2]; }
  return new Blob([encode({ width, height, data: rgb, channels: 3, depth: 8 })], { type: "image/png" });
}

/** PNG file -> exact { rgba, width, height }, or null when it is not an 8-bit colour PNG. */
export async function readPng(file) {
  let png;
  try { png = decode(new Uint8Array(await file.arrayBuffer())); } catch { return null; }
  const { width, height, data, channels, depth } = png;
  if (depth !== 8 || png.palette || (channels !== 3 && channels !== 4)) return null;
  if (channels === 4) return { rgba: data, width, height };
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, j = 0; i < data.length; i += 3) { rgba[j++] = data[i]; rgba[j++] = data[i + 1]; rgba[j++] = data[i + 2]; rgba[j++] = 255; }
  return { rgba, width, height };
}
