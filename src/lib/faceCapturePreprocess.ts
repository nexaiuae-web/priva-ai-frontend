/**
 * On-device canvas pre-processing before sending capture to local PRIVA backend.
 * Histogram equalization on luminance brightens shadows — no external services.
 */

function equalizeHistogram(luminance: Uint8ClampedArray): void {
  const histogram = new Array<number>(256).fill(0);
  for (let i = 0; i < luminance.length; i += 1) {
    histogram[luminance[i]] += 1;
  }

  const cdf = new Array<number>(256).fill(0);
  cdf[0] = histogram[0];
  for (let i = 1; i < 256; i += 1) {
    cdf[i] = cdf[i - 1] + histogram[i];
  }

  const total = luminance.length;
  const cdfMin = cdf.find((value) => value > 0) ?? 0;
  const scale = 255 / Math.max(1, total - cdfMin);

  for (let i = 0; i < luminance.length; i += 1) {
    const value = luminance[i];
    luminance[i] = Math.round((cdf[value] - cdfMin) * scale);
  }
}

/**
 * Apply contrast normalization + histogram equalization on a face capture canvas.
 */
export function preprocessFaceCaptureCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const output = document.createElement("canvas");
  output.width = source.width;
  output.height = source.height;

  const ctx = output.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return source;
  }

  ctx.drawImage(source, 0, 0);
  const imageData = ctx.getImageData(0, 0, output.width, output.height);
  const { data } = imageData;
  const luminance = new Uint8ClampedArray(output.width * output.height);

  for (let i = 0, px = 0; i < data.length; i += 4, px += 1) {
    luminance[px] = Math.round(
      0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    );
  }

  equalizeHistogram(luminance);

  for (let i = 0, px = 0; i < data.length; i += 4, px += 1) {
    const original =
      0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const target = luminance[px];
    const gain = original > 1 ? target / original : 1;
    const contrast = 1.08;
    data[i] = clampByte((data[i] - 128) * contrast * gain + 128);
    data[i + 1] = clampByte((data[i + 1] - 128) * contrast * gain + 128);
    data[i + 2] = clampByte((data[i + 2] - 128) * contrast * gain + 128);
  }

  ctx.putImageData(imageData, 0, 0);
  return output;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}
