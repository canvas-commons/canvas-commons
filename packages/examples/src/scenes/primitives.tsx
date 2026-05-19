import {Circle, Layout, Rect, makeScene2D} from '@canvas-commons/2d';

export default makeScene2D(function* (view) {
  view.add(
    <Layout direction={'row'} gap={120} alignItems={'center'} layout>
      <Circle
        size={300}
        stroke={'blue'}
        lineWidth={40}
        arrowSize={40}
        fill={'lightseagreen'}
        strokeFirst
        endArrow
        endAngle={-90}
        end={0.5}
        lineCap={'round'}
        cache
      />
      <Rect
        width={300}
        height={200}
        fill={'#0008'}
        radius={[0, 100, 30, 200]}
        start={0.35}
      />
    </Layout>,
  );

  yield;
});
