import fs from 'fs';
import path from 'path';

/**
 * Validates a PNG file binary structure, file size, and extracts dimensions from the IHDR chunk.
 * Adheres strictly to RFC 2083 / ISO/IEC 15948:2004.
 *
 * @param {string} filePath - Absolute or relative path to the PNG file.
 * @param {number} [minSizeBytes=10240] - Minimum expected size (default 10KB).
 * @returns {object} Validation result with dimensions, file size, and status.
 */
export function validatePngFile(filePath, minSizeBytes = 10240) {
  const result = {
    valid: false,
    filePath,
    fileName: path.basename(filePath),
    size: 0,
    width: 0,
    height: 0,
    bitDepth: null,
    colorType: null,
    error: null,
  };

  if (!fs.existsSync(filePath)) {
    result.error = `File not found: ${filePath}`;
    return result;
  }

  let stats;
  try {
    stats = fs.statSync(filePath);
  } catch (err) {
    result.error = `Unable to stat file: ${err.message}`;
    return result;
  }

  result.size = stats.size;

  if (stats.size === 0) {
    result.error = `File is completely empty (0 bytes)`;
    return result;
  }

  if (stats.size < minSizeBytes) {
    result.error = `File size ${stats.size} bytes is under minimum threshold of ${minSizeBytes} bytes (10KB)`;
    return result;
  }

  // PNG requires at least 8 bytes header + 4 length + 4 IHDR + 13 IHDR data + 4 CRC = 33 bytes
  if (stats.size < 33) {
    result.error = `File size too small to contain valid PNG IHDR chunk (${stats.size} bytes)`;
    return result;
  }

  let buffer;
  try {
    const fd = fs.openSync(filePath, 'r');
    buffer = Buffer.alloc(32);
    fs.readSync(fd, buffer, 0, 32, 0);
    fs.closeSync(fd);
  } catch (err) {
    result.error = `Error reading file header: ${err.message}`;
    return result;
  }

  // 1. Verify PNG signature: \x89PNG\r\n\x1a\n (89 50 4E 47 0D 0A 1A 0A)
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buffer.subarray(0, 8).equals(pngSignature)) {
    result.error = `Invalid PNG signature: expected 89504E470D0A1A0A, got ${buffer.subarray(0, 8).toString('hex')}`;
    return result;
  }

  // 2. Verify first chunk type is IHDR
  const chunkType = buffer.subarray(12, 16).toString('ascii');
  if (chunkType !== 'IHDR') {
    result.error = `First PNG chunk must be IHDR, found: '${chunkType}'`;
    return result;
  }

  // 3. Extract dimensions (big-endian 32-bit uints)
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const bitDepth = buffer.readUInt8(24);
  const colorType = buffer.readUInt8(25);

  if (width <= 0 || height <= 0) {
    result.error = `Invalid dimensions extracted from IHDR: ${width}x${height}`;
    return result;
  }

  result.valid = true;
  result.width = width;
  result.height = height;
  result.bitDepth = bitDepth;
  result.colorType = colorType;
  result.aspectRatio = (width / height).toFixed(2);
  return result;
}

/**
 * Inspects all PNG files in a directory and returns aggregate validation metrics.
 *
 * @param {string} dirPath - Directory containing screenshots.
 * @returns {object} Summary of screenshot files and validation details.
 */
export function inspectScreenshotsDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return {
      exists: false,
      count: 0,
      validCount: 0,
      invalidCount: 0,
      files: [],
      error: `Directory not found: ${dirPath}`,
    };
  }

  const entries = fs.readdirSync(dirPath);
  const pngFiles = entries.filter((name) => name.toLowerCase().endsWith('.png'));

  const files = pngFiles.map((name) => {
    const fullPath = path.join(dirPath, name);
    return validatePngFile(fullPath);
  });

  const validCount = files.filter((f) => f.valid).length;

  return {
    exists: true,
    count: files.length,
    validCount,
    invalidCount: files.length - validCount,
    files,
  };
}
