/**
 * jsdom has no canvas backend, so the 2D drawing code is driven against a
 * recording context instead. Every op is captured together with the style state
 * in force when it ran, which is what the drawing tests assert on.
 */
export interface Op {
  op: string;
  fillStyle: string;
  strokeStyle: string;
  lineDash: number[];
  globalAlpha: number;
  args: unknown[];
}

export function recordingCtx() {
  const ops: Op[] = [];
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    globalAlpha: 1,
    font: '',
    textAlign: '',
    textBaseline: '',
    lineDash: [] as number[],
    setLineDash(d: number[]) {
      ctx.lineDash = d;
    },
    getLineDash() {
      return ctx.lineDash;
    },
    snap(op: string, args: unknown[] = []) {
      ops.push({
        op,
        fillStyle: String(ctx.fillStyle),
        strokeStyle: String(ctx.strokeStyle),
        lineDash: [...ctx.lineDash],
        globalAlpha: ctx.globalAlpha,
        args,
      });
    },
    beginPath() {},
    moveTo() {},
    lineTo() {},
    arc(...args: unknown[]) {
      ctx.snap('arc', args);
    },
    fill() {
      ctx.snap('fill');
    },
    stroke() {
      ctx.snap('stroke');
    },
    fillRect(...args: unknown[]) {
      ctx.snap('fillRect', args);
    },
    strokeRect(...args: unknown[]) {
      ctx.snap('strokeRect', args);
    },
    fillText(...args: unknown[]) {
      ctx.snap('fillText', args);
    },
    drawImage() {
      ctx.snap('drawImage');
    },
  };
  return { ctx, ops };
}

/** A canvas whose 2D context records instead of drawing. */
export function fakeCanvas() {
  const { ctx, ops } = recordingCtx();
  const canvas = { width: 1280, height: 720, getContext: () => ctx };
  return { canvas: canvas as unknown as HTMLCanvasElement, ops };
}

/**
 * Replace OffscreenCanvas with one backed by a recording context, and hand back
 * the ops it collects. jsdom does not implement OffscreenCanvas at all, so the
 * pitch cache cannot be built without this.
 */
export function stubOffscreenCanvas(): { ops: Op[]; restore: () => void } {
  const g = globalThis as Record<string, unknown>;
  const original = g.OffscreenCanvas;
  const { ctx, ops } = recordingCtx();
  g.OffscreenCanvas = class {
    getContext() {
      return ctx;
    }
  };
  return {
    ops,
    restore: () => {
      g.OffscreenCanvas = original;
    },
  };
}
