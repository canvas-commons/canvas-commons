import {Circle, makeScene2D, Rect, Txt} from '@canvas-commons/2d';
import {waitFor} from '@canvas-commons/core';

export default makeScene2D(function* (view) {
  view.fill('#1a1a1a');
  view.add(
    <Rect
      x={-260}
      width={220}
      height={220}
      radius={24}
      fill={'#e13238'}
      shadowColor={'#000'}
      shadowBlur={40}
      shadowOffset={[24, 24]}
    />,
  );
  view.add(
    <Circle
      size={220}
      fill={'#68abdf'}
      shadowColor={'rgba(0, 0, 0, 0.75)'}
      shadowBlur={30}
      shadowOffset={[0, 24]}
    />,
  );
  view.add(
    <Txt
      x={260}
      fill={'#e6a700'}
      fontSize={200}
      fontWeight={700}
      shadowColor={'#000'}
      shadowBlur={16}
      shadowOffset={[12, 12]}
    >
      S
    </Txt>,
  );
  yield* waitFor(0.1);
});
