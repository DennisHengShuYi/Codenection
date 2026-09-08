// Generates the PWA icons as flat PNGs, using zlib rather than an image library.
//
// Committed binaries with no source are what this avoids: anyone can re-run this and get
// byte-identical files, and the design is readable as code rather than being a blob
// nobody can change.
//
// Run with: npm run icons
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const BACKGROUND = [15, 23, 42]
const FOREGROUND = [16, 185, 129]

function crc32(buf) {
  let crc = ~0
  for (const byte of buf) {
    crc ^= byte
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return ~crc >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)

  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))

  return Buffer.concat([length, body, crc])
}

function png(size) {
  // One filter byte per row, then three bytes per pixel.
  const raw = Buffer.alloc(size * (size * 3 + 1))
  let offset = 0

  // A filled circle on a dark ground. Legible at 48px, which is the size a home-screen
  // icon is actually seen at, and safe inside a maskable icon's safe zone.
  const radius = size * 0.28

  for (let y = 0; y < size; y += 1) {
    raw[offset] = 0
    offset += 1

    for (let x = 0; x < size; x += 1) {
      const dx = x - size / 2
      const dy = y - size / 2
      const colour = dx * dx + dy * dy <= radius * radius ? FOREGROUND : BACKGROUND

      raw[offset] = colour[0]
      raw[offset + 1] = colour[1]
      raw[offset + 2] = colour[2]
      offset += 3
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // truecolour

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

for (const size of [192, 512]) {
  writeFileSync(new URL(`../public/icon-${size}.png`, import.meta.url), png(size))
  console.log(`wrote public/icon-${size}.png`)
}
