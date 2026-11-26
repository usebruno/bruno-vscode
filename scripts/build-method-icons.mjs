/**
 * Generates media/method-icons.ttf, the icon font behind the request rows in the sidebar:
 * one glyph per method label (GET, POST, …), cut from Inter Bold and fitted into the
 * 16px icon cell. The glyphs are registered under `contributes.icons` in package.json,
 * which this script reads so the ids and code points live in one place.
 *
 * After changing a label here or an entry there, run `npm run build:method-icons` and
 * commit the font. The build does not run this.
 */
import { readFileSync, writeFileSync } from 'node:fs';

import opentype from 'opentype.js';

const SOURCE = new URL(import.meta.resolve('@fontsource/inter/files/inter-latin-700-normal.woff'));
const OUT = new URL('../media/method-icons.ttf', import.meta.url);
const PACKAGE = new URL('../package.json', import.meta.url);

/** Text per icon id suffix. Six and seven letter methods are cut to three, as the old sidebar did. */
const LABELS = {
  get: 'GET',
  post: 'POST',
  put: 'PUT',
  patch: 'PATCH',
  delete: 'DEL',
  options: 'OPT',
  head: 'HEAD',
  trace: 'TRACE',
  connect: 'CON',
  graphql: 'GQL',
  grpc: 'GRPC',
  ws: 'WS'
};

const UPEM = 1000;
const ASCENDER = 800;
const DESCENDER = -200;
/** The label at 7px in the 16px cell. */
const TEXT_SCALE = 7 / 16;
/** Longer words are condensed to this share of the cell instead of shrunk, keeping the x-height. */
const MAX_WIDTH = 0.97;
/** Down from the middle of the line box, where codicons sit, to the visual centre of the name beside it. */
const DROP = 1 / 16;

const buffer = readFileSync(SOURCE);
const source = opentype.parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
const scale = (TEXT_SCALE * UPEM) / source.unitsPerEm;
const capHeight = (source.tables.os2?.sCapHeight || source.charToGlyph('H').getBoundingBox().y2) * scale;

function labelGlyph(name, unicode, text) {
  // Plain capitals need no shaping, and Inter's GSUB has lookups opentype.js cannot apply.
  const glyphs = [...text].map((ch) => source.charToGlyph(ch));
  let width = 0;

  for (let i = 0; i < glyphs.length; i++) {
    width += glyphs[i].advanceWidth;
    if (i < glyphs.length - 1) {
      width += source.getKerningValue(glyphs[i], glyphs[i + 1]);
    }
  }

  width *= scale;

  const condense = Math.min(1, (MAX_WIDTH * UPEM) / width);
  const x0 = (UPEM - width * condense) / 2;
  const y0 = (ASCENDER + DESCENDER) / 2 - capHeight / 2 - DROP * UPEM;

  const path = new opentype.Path();
  let pen = 0;

  for (let i = 0; i < glyphs.length; i++) {
    const glyph = glyphs[i];
    const tx = (x) => x0 + (pen + x) * scale * condense;
    const ty = (y) => y0 + y * scale;

    for (const c of glyph.path.commands) {
      if (c.type === 'M') path.moveTo(tx(c.x), ty(c.y));
      else if (c.type === 'L') path.lineTo(tx(c.x), ty(c.y));
      else if (c.type === 'Q') path.quadraticCurveTo(tx(c.x1), ty(c.y1), tx(c.x), ty(c.y));
      else if (c.type === 'C') path.bezierCurveTo(tx(c.x1), ty(c.y1), tx(c.x2), ty(c.y2), tx(c.x), ty(c.y));
      else if (c.type === 'Z') path.close();
    }

    pen += glyph.advanceWidth;

    if (i < glyphs.length - 1) {
      pen += source.getKerningValue(glyph, glyphs[i + 1]);
    }
  }

  return new opentype.Glyph({ name, unicode, advanceWidth: UPEM, path });
}

const icons = JSON.parse(readFileSync(PACKAGE, 'utf8')).contributes.icons;
const glyphs = [new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: UPEM, path: new opentype.Path() })];

for (const [id, icon] of Object.entries(icons)) {
  const key = id.replace(/^bruno-method-/, '');
  const text = LABELS[key];

  if (!text) {
    throw new Error(`No label for ${id}; add it to LABELS`);
  }

  const unicode = parseInt(icon.default.fontCharacter.replace(/^\\/, ''), 16);
  glyphs.push(labelGlyph(key, unicode, text));
}

// opentype.js writes CFF outlines; VS Code only serves .ttf, .woff and .woff2 as icon fonts
// and browsers load the file by its contents, so the extension is .ttf.
const font = new opentype.Font({
  familyName: 'bruno-method-icons',
  styleName: 'Regular',
  unitsPerEm: UPEM,
  ascender: ASCENDER,
  descender: DESCENDER,
  glyphs
});

writeFileSync(OUT, Buffer.from(font.toArrayBuffer()));
console.log(`Wrote ${glyphs.length - 1} glyphs to ${OUT.pathname}`);
