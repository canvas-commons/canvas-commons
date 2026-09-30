const Blue = '#00aaff';

function svgDocument(body: string, attributes = 'viewBox="0 0 10 10"') {
  return `<svg xmlns="http://www.w3.org/2000/svg" ${attributes}>${body}</svg>`;
}

const PlainRect = `<rect width="5" height="5" fill="${Blue}"/>`;

/** Region relative to the cell center; the whole SVG when omitted. */
export interface CaseRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SvgCase {
  region?: CaseRegion;
  name: string;
  subject: string;
  reference: string;
  backdrop?: string;
}

export const svgCases: SvgCase[] = [
  {
    name: 'unparseable paint does not blank the drawing',
    subject: svgDocument(
      `<defs><linearGradient id="g"><stop offset="0" stop-color="#f00"/><stop offset="1" stop-color="#00f"/></linearGradient></defs>${PlainRect}<rect x="5" y="5" width="5" height="5" fill="url(#g)"/>`,
    ),
    reference: svgDocument(PlainRect),
    region: {x: -98, y: -98, width: 96, height: 96},
  },
  {
    name: 'polygon without points does not blank the drawing',
    subject: svgDocument(`${PlainRect}<polygon/>`),
    reference: svgDocument(PlainRect),
  },
  {
    name: 'style element classes apply',
    subject: svgDocument(
      '<style>.a{fill:rgb(255,0,0)}</style><rect class="a" width="5" height="5"/>',
    ),
    reference: svgDocument('<rect width="5" height="5" fill="rgb(255,0,0)"/>'),
  },
  {
    name: 'display none elements are not drawn',
    subject: svgDocument(
      `${PlainRect}<rect x="5" y="5" width="5" height="5" fill="#ff0000" style="display:none"/>`,
    ),
    reference: svgDocument(PlainRect),
  },
  {
    name: 'group opacity composes with element opacity',
    subject: svgDocument(
      '<g opacity=".5"><rect width="10" height="10" opacity=".5" fill="#000"/></g>',
    ),
    reference: svgDocument(
      '<rect width="10" height="10" opacity=".25" fill="#000"/>',
    ),
    backdrop: '#fff',
  },
  {
    name: 'where() adds no specificity to a rule',
    subject: svgDocument(
      `<style>#r{fill:${Blue}}:where(#r){fill:#ff0000}</style><rect id="r" width="5" height="5"/>`,
    ),
    reference: svgDocument(PlainRect),
  },
  {
    name: 'opacity above one is clamped before it composes',
    subject: svgDocument(
      '<g opacity="2"><rect width="10" height="10" opacity=".25" fill="#000"/></g>',
    ),
    reference: svgDocument(
      '<rect width="10" height="10" opacity=".25" fill="#000"/>',
    ),
    backdrop: '#fff',
  },
];

export const CellSize = 240;
export const SvgWidth = 200;
const ColumnSpacing = 640;
const RowSpacing = 360;
const PairOffset = 150;

export function casePosition(index: number) {
  const column = index % 3;
  const row = Math.floor(index / 3);
  const x = (column - 1) * ColumnSpacing;
  const y = (row - 1) * RowSpacing;
  return {subject: {x: x - PairOffset, y}, reference: {x: x + PairOffset, y}};
}
