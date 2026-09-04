import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { decodeUtf16le, installTextDecoderShim } from '../src/lib/textDecoderShim';

/** Mimics Hermes: a TextDecoder that only knows UTF-8. */
class Utf8OnlyDecoder {
  readonly encoding = 'utf-8';
  readonly fatal = false;
  readonly ignoreBOM = false;
  constructor(label = 'utf-8') {
    if (label.toLowerCase() !== 'utf-8' && label.toLowerCase() !== 'utf8') {
      throw new RangeError(`Unknown encoding: ${label}`);
    }
  }
  decode(input?: ArrayBufferView | ArrayBuffer | null): string {
    const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : input ? new Uint8Array(input.buffer) : new Uint8Array(0);
    return Buffer.from(bytes).toString('utf8');
  }
}

function utf16le(text: string): Uint8Array {
  return new Uint8Array(Buffer.from(text, 'utf16le'));
}

describe('decodeUtf16le', () => {
  test('decodes ASCII and non-Latin text', () => {
    assert.equal(decodeUtf16le(utf16le('Ersfjordbotn')), 'Ersfjordbotn');
    assert.equal(decodeUtf16le(utf16le('Tromsø 极光')), 'Tromsø 极光');
  });

  test('strips a leading BOM unless ignoreBOM is set', () => {
    const withBom = new Uint8Array([0xff, 0xfe, ...utf16le('x')]);
    assert.equal(decodeUtf16le(withBom), 'x');
    assert.equal(decodeUtf16le(withBom, true), '﻿x');
  });

  test('handles empty, null and odd-length input', () => {
    assert.equal(decodeUtf16le(undefined), '');
    assert.equal(decodeUtf16le(null), '');
    assert.equal(decodeUtf16le(new Uint8Array([0x41])), '');
  });

  test('handles inputs larger than one chunk', () => {
    const long = 'a'.repeat(20_000);
    assert.equal(decodeUtf16le(utf16le(long)), long);
  });
});

describe('installTextDecoderShim', () => {
  test('is a no-op when the native decoder already supports utf-16le (Node, browsers)', () => {
    const target = { TextDecoder: globalThis.TextDecoder as never };
    assert.equal(installTextDecoderShim(target), false);
    assert.equal(target.TextDecoder, globalThis.TextDecoder);
  });

  test('is a no-op when there is no TextDecoder at all', () => {
    const target: { TextDecoder?: never } = {};
    assert.equal(installTextDecoderShim(target), false);
    assert.equal(target.TextDecoder, undefined);
  });

  test('on a UTF-8-only engine, `new TextDecoder("utf-16le")` no longer throws and decodes', () => {
    const target = { TextDecoder: Utf8OnlyDecoder as never };
    assert.throws(() => new (target.TextDecoder as typeof Utf8OnlyDecoder)('utf-16le'), RangeError);

    assert.equal(installTextDecoderShim(target), true);
    const Patched = target.TextDecoder as unknown as new (label?: string) => { encoding: string; decode(i?: Uint8Array): string };

    // The exact statement h3-js's emscripten glue runs at module load.
    const utf16 = new Patched('utf-16le');
    assert.equal(utf16.encoding, 'utf-16le');
    assert.equal(utf16.decode(utf16le('h3 ok')), 'h3 ok');
    assert.equal(new Patched('UTF-16').decode(utf16le('case-insensitive')), 'case-insensitive');

    // Everything else still goes to the native implementation.
    const utf8 = new Patched('utf-8');
    assert.equal(utf8.encoding, 'utf-8');
    assert.ok(utf8 instanceof Utf8OnlyDecoder);
    assert.equal(utf8.decode(new Uint8Array(Buffer.from('native', 'utf8'))), 'native');
    assert.equal(new Patched().encoding, 'utf-8');
    assert.throws(() => new Patched('latin1'), RangeError);
  });
});
