/**
 * Type declarations for Canvas APIs available in Cloudflare Workers runtime.
 * These APIs are supported but not included in @cloudflare/workers-types.
 */

declare class OffscreenCanvas {
  constructor(width: number, height: number);
  width: number;
  height: number;
  getContext(contextId: "2d"): OffscreenCanvasRenderingContext2D;
  convertToBlob(options?: { type?: string; quality?: number }): Promise<Blob>;
}

interface OffscreenCanvasRenderingContext2D {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  drawImage(image: ImageBitmap, dx: number, dy: number, dw: number, dh: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
}

declare class ImageBitmap {
  readonly width: number;
  readonly height: number;
  close(): void;
}

declare function createImageBitmap(blob: Blob): Promise<ImageBitmap>;
