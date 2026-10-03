import {Node, Rect, RectProps, makeScene2D} from '@canvas-commons/2d';
import {waitFor} from '@canvas-commons/core';

const PASS_THROUGH = `#version 300 es
precision highp float;
in vec2 sourceUV;
out vec4 outColor;
uniform sampler2D sourceTexture;
void main() { outColor = texture(sourceTexture, sourceUV); }`;

const FILL = '#2040e0';
const STROKE = '#d02020';

function shapes(shaders: boolean, props: RectProps = {}) {
  return (
    <>
      <Rect
        x={-100}
        size={80}
        fill={FILL}
        fillShaders={shaders ? PASS_THROUGH : []}
        {...props}
      />
      <Rect
        x={100}
        size={80}
        stroke={STROKE}
        lineWidth={12}
        strokeShaders={shaders ? PASS_THROUGH : []}
        {...props}
      />
    </>
  );
}

const ROWS: ((shaders: boolean) => ReturnType<typeof shapes>)[] = [
  shaders => shapes(shaders, {scale: 2, rotation: 30}),
  shaders => (
    <Node rotation={15} scale={1.5}>
      {shapes(shaders)}
    </Node>
  ),
  shaders => shapes(shaders, {opacity: 0.5}),
];

export default makeScene2D(function* (view) {
  view.add(<Rect size={[1920, 1080]} fill="#ffffff" />);

  ROWS.forEach((row, index) => {
    const y = (index - 1) * 340;
    view.add(
      <Node x={-480} y={y}>
        {row(true)}
      </Node>,
    );
    view.add(
      <Node x={480} y={y}>
        {row(false)}
      </Node>,
    );
  });

  yield* waitFor(0.1);
});
