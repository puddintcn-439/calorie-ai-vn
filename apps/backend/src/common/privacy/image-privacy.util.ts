const JPEG_SOI = 0xffd8;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function isJpeg(buffer: Buffer): boolean {
  return buffer.length >= 2 && buffer.readUInt16BE(0) === JPEG_SOI;
}

function isPng(buffer: Buffer): boolean {
  return buffer.length >= PNG_SIGNATURE.length && buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE);
}

function stripJpegMetadata(buffer: Buffer): Buffer {
  const segments: Buffer[] = [buffer.subarray(0, 2)];
  let offset = 2;

  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      return buffer;
    }

    const marker = buffer[offset + 1];
    if (marker === 0xda) {
      segments.push(buffer.subarray(offset));
      return Buffer.concat(segments);
    }

    if (marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      segments.push(buffer.subarray(offset, offset + 2));
      offset += 2;
      continue;
    }

    if (offset + 4 > buffer.length) {
      return buffer;
    }

    const length = buffer.readUInt16BE(offset + 2);
    const end = offset + 2 + length;
    if (length < 2 || end > buffer.length) {
      return buffer;
    }

    const shouldDrop = marker === 0xe1 || marker === 0xed || marker === 0xfe;
    if (!shouldDrop) {
      segments.push(buffer.subarray(offset, end));
    }
    offset = end;
  }

  return Buffer.concat(segments);
}

function stripPngMetadata(buffer: Buffer): Buffer {
  const chunks: Buffer[] = [buffer.subarray(0, PNG_SIGNATURE.length)];
  let offset = PNG_SIGNATURE.length;
  const droppedChunkTypes = new Set(['eXIf', 'tEXt', 'iTXt', 'zTXt']);

  while (offset < buffer.length) {
    if (offset + 12 > buffer.length) {
      return buffer;
    }

    const length = buffer.readUInt32BE(offset);
    const chunkEnd = offset + 12 + length;
    if (chunkEnd > buffer.length) {
      return buffer;
    }

    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    if (!droppedChunkTypes.has(type)) {
      chunks.push(buffer.subarray(offset, chunkEnd));
    }

    offset = chunkEnd;
    if (type === 'IEND') {
      return Buffer.concat(chunks);
    }
  }

  return Buffer.concat(chunks);
}

export function stripImageMetadata(buffer: Buffer, mimeType?: string): Buffer {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return buffer;
  }

  const normalizedMime = String(mimeType ?? '').toLowerCase();

  if (normalizedMime.includes('jpeg') || normalizedMime.includes('jpg') || isJpeg(buffer)) {
    return stripJpegMetadata(buffer);
  }

  if (normalizedMime.includes('png') || isPng(buffer)) {
    return stripPngMetadata(buffer);
  }

  return buffer;
}