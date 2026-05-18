import {Layout, Rect, SVG, Txt, makeScene2D} from '@canvas-commons/2d';
import {waitFor} from '@canvas-commons/core';

const CELL_BG = '#1e2024';
const PANEL_TITLE = '#9aa0a6';
const BODY = '#f5f5f5';
const ACCENT = '#f3303f';
const ACCENT2 = '#ffa56d';

function Cell(props: {
  title: string;
  width: number;
  height: number;
  children?: unknown;
}) {
  return (
    <Layout
      layout
      direction={'column'}
      gap={16}
      padding={24}
      width={props.width}
      height={props.height}
    >
      <Rect
        layout={false}
        width={props.width}
        height={props.height}
        radius={24}
        fill={CELL_BG}
        position={[0, 0]}
      />
      <Txt fontSize={20} fontWeight={500} fill={PANEL_TITLE}>
        {props.title}
      </Txt>
      {props.children as never}
    </Layout>
  );
}

export default makeScene2D(function* (view) {
  const cellWidth = 560;
  const cellHeight = 460;
  const contentWidth = cellWidth - 48;
  const contentHeight = cellHeight - 100;

  view.add(
    <Layout
      layout
      direction={'column'}
      gap={32}
      padding={48}
      width={'100%'}
      height={'100%'}
      alignItems={'center'}
      justifyContent={'center'}
    >
      <Layout layout direction={'row'} gap={32}>
        <Cell title={'Normal'} width={cellWidth} height={cellHeight}>
          <Txt fontSize={32} fill={BODY} width={contentWidth}>
            The quick brown fox jumps over the lazy dog.
          </Txt>
        </Cell>

        <Cell
          title={'Knuth-Plass + justify'}
          width={cellWidth}
          height={cellHeight}
        >
          <Txt
            wrapMode={'knuth-plass'}
            textAlign={'justify'}
            fontSize={32}
            fill={BODY}
            width={contentWidth}
          >
            Optimal line breaking finds the path through the paragraph that
            minimizes a justification badness score.
          </Txt>
        </Cell>

        <Cell title={'Inline shape'} width={cellWidth} height={cellHeight}>
          <Txt fontSize={28} fill={BODY} width={contentWidth}>
            A heart{' '}
            <SVG
              width={32}
              height={32}
              fill={ACCENT}
              svg={`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><path fill="currentColor" d="m12 21l-1.45-1.3q-2.525-2.275-4.175-3.925T3.75 12.812T2.388 10.4T2 8.15Q2 5.8 3.575 4.225T7.5 2.65q1.3 0 2.475.55T12 4.75q.85-1 2.025-1.55t2.475-.55q2.35 0 3.925 1.575T22 8.15q0 1.15-.387 2.25t-1.363 2.412t-2.625 2.963T13.45 19.7z"/></svg>`}
            />{' '}
            sits in the middle of a line and the text wraps around it.
          </Txt>
        </Cell>
      </Layout>

      <Layout layout direction={'row'} gap={32}>
        <Cell title={'Wrap around image'} width={cellWidth} height={cellHeight}>
          <Layout layout width={contentWidth} height={contentHeight}>
            <Rect
              layout={false}
              width={140}
              height={140}
              radius={16}
              fill={ACCENT2}
              topLeft={[-contentWidth / 2, -contentHeight / 2]}
            />
            <Txt
              layout={false}
              fontSize={22}
              fill={BODY}
              width={contentWidth}
              textAlign={'left'}
              topLeft={[-contentWidth / 2, -contentHeight / 2]}
              exclusions={[
                {
                  kind: 'rect',
                  x: 0,
                  y: 0,
                  width: 140,
                  height: 140,
                  horizontalPadding: 16,
                },
              ]}
            >
              Text flows around an exclusion rectangle anchored at the top-left.
              Lines respect the obstacle and fall back to the full column width
              once they clear it.
            </Txt>
          </Layout>
        </Cell>

        <Cell title={'Auto-fit'} width={cellWidth} height={cellHeight}>
          <Layout layout width={contentWidth} height={contentHeight}>
            <Rect
              layout={false}
              width={320}
              height={200}
              stroke={ACCENT2}
              lineWidth={3}
              radius={16}
            />
            {/* Txt always participates in layout (layout={false} is a no-op
                on it), so a non-layout wrapper centers it as a layout root. */}
            <Layout layout={false}>
              <Txt
                autoSize
                width={300}
                height={180}
                fontSize={72}
                fill={BODY}
                textAlign={'center'}
                verticalAlign={'middle'}
              >
                Auto-fit shrinks the font until this paragraph fits the box.
              </Txt>
            </Layout>
          </Layout>
        </Cell>

        <Cell
          title={'Preserved newlines'}
          width={cellWidth}
          height={cellHeight}
        >
          <Txt fontSize={28} fill={BODY} width={contentWidth}>
            {'Line one\nLine two\n\nA blank line above.'}
          </Txt>
        </Cell>
      </Layout>
    </Layout>,
  );

  yield* waitFor(0.2);
});
