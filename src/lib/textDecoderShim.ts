/**
 * Hermes (React Native's JS engine) ships a built-in `TextDecoder` that only
 * understands UTF-8. `h3-js` (the H3 geospatial library behind
 * src/trip/zoneDiscovery.ts and src/trip/urbanExclusion.ts) is an emscripten
 * build whose glue code EAGERLY runs
 *
 *     new TextDecoder('utf-16le')
 *
 * at module-evaluation time. On Hermes that throws
 * `RangeError: Unknown encoding: utf-16le` before the first render -- the
 * whole app fails to start ("[runtime not ready]"). h3-js never actually
 * decodes UTF-16 in the code paths we call; the decoder object just has to
 * exist.
 *
 * This shim wraps the global `TextDecoder` so that constructing one for
 * UTF-16LE returns a small pure-JS decoder instead of throwing, while every
 * other label is delegated untouched to the native implementation. It is a
 * no-op wherever the native decoder already supports UTF-16LE (browsers,
 * Node), so web and tests are unaffected.
 *
 * It MUST be imported before anything that transitively imports `h3-js` --
 * it is the first import in the app entry (index.ts). Pure functions are
 * exported so the behaviour is unit-tested under Node with a fake
 * UTF-8-only decoder (test/textDecoderShim.test.ts).
 */

type DecodeInput = ArrayBufferView | ArrayBuffer | null | undefined;

type DecoderLike = {
  readonly encoding: string;
  readonly fatal: boolean;
  readonly ignoreBOM: boolean;
  decode(input?: DecodeInput, options?: { stream?: boolean }): string;
};

type DecoderCtor = new (label?: string, options?: { fatal?: boolean; ignoreBOM?: boolean }) => DecoderLike;

type GlobalWithDecoder = { TextDecoder?: DecoderCtor };

const UTF16LE_LABELS = new Set(['utf-16le', 'utf-16', 'utf16le', 'utf16']);

function toBytes(input: DecodeInput): Uint8Array {
  if (input == null) return new Uint8Array(0);
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
}

/** Decodes little-endian UTF-16 code units to a string (surrogate pairs pass through as-is). */
export function decodeUtf16le(input: DecodeInput, ignoreBOM = false): string {
  const bytes = toBytes(input);
  const units = new Array<number>(Math.floor(bytes.length / 2));
  for (let i = 0, j = 0; i + 1 < bytes.length; i += 2, j += 1) {
    units[j] = bytes[i] | (bytes[i + 1] << 8);
  }
  let start = 0;
  if (!ignoreBOM && units.length > 0 && units[0] === 0xfeff) start = 1;
  let out = '';
  // Chunked to stay well under the argument-count limit of Function.apply.
  const CHUNK = 8192;
  for (let i = start; i < units.length; i += CHUNK) {
    out += String.fromCharCode.apply(null, units.slice(i, i + CHUNK));
  }
  return out;
}

function makeUtf16leDecoder(options?: { fatal?: boolean; ignoreBOM?: boolean }): DecoderLike {
  const ignoreBOM = Boolean(options?.ignoreBOM);
  return {
    encoding: 'utf-16le',
    fatal: Boolean(options?.fatal),
    ignoreBOM,
    decode: (input?: DecodeInput) => decodeUtf16le(input, ignoreBOM)
  };
}

function nativeSupportsUtf16le(Native: DecoderCtor): boolean {
  try {
    new Native('utf-16le');
    return true;
  } catch {
    return false;
  }
}

/**
 * Installs the wrapper on `target` if its TextDecoder rejects UTF-16LE.
 * Returns true when a wrapper was installed, false when nothing needed doing
 * (no TextDecoder at all, or one that already supports UTF-16LE).
 */
export function installTextDecoderShim(target: GlobalWithDecoder): boolean {
  const Native = target.TextDecoder;
  if (typeof Native !== 'function') return false;
  if (nativeSupportsUtf16le(Native)) return false;

  function PatchedTextDecoder(
    this: unknown,
    label?: string,
    options?: { fatal?: boolean; ignoreBOM?: boolean }
  ): DecoderLike {
    const normalized = (label ?? 'utf-8').trim().toLowerCase();
    if (UTF16LE_LABELS.has(normalized)) return makeUtf16leDecoder(options);
    return new (Native as DecoderCtor)(label, options);
  }
  // Keep `instanceof TextDecoder` working for natively-constructed decoders.
  PatchedTextDecoder.prototype = Native.prototype;

  target.TextDecoder = PatchedTextDecoder as unknown as DecoderCtor;
  return true;
}

installTextDecoderShim(globalThis as GlobalWithDecoder);
