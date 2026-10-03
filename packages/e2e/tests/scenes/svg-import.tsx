import {Rect, SVG, makeScene2D} from '@canvas-commons/2d';
import {CellSize, SvgWidth, casePosition, svgCases} from './svg-cases';

export default makeScene2D(function* (view) {
  view.add(<Rect size={[1920, 1080]} fill="#000" />);
  svgCases.forEach((svgCase, index) => {
    const {subject, reference} = casePosition(index);
    for (const [position, svg] of [
      [subject, svgCase.subject],
      [reference, svgCase.reference],
    ] as const) {
      view.add(
        <Rect
          position={[position.x, position.y]}
          size={CellSize}
          fill={svgCase.backdrop ?? '#000'}
        >
          <SVG svg={svg} width={SvgWidth} />
        </Rect>,
      );
    }
  });
  yield;
});
