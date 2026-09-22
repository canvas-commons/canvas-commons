import {Layout, Rect, Txt, makeScene2D} from '@canvas-commons/2d';
import {createRefArray, createSignal, waitFor} from '@canvas-commons/core';

const Label = {
  fontSize: 24,
  fill: '#9aa5b1',
};

const Demo = {
  fontSize: 32,
  fill: '#ffffff',
};

const Filler = {
  fill: '#1f3a52',
  stroke: '#2f5f88',
  lineWidth: 2,
  height: 44,
};

export default makeScene2D(function* (view) {
  view.fill('#141824');

  const outlined = createRefArray<Layout>();
  const caption = createSignal('short');

  view.add(
    <Layout
      layout
      direction={'column'}
      gap={56}
      padding={64}
      width={1920}
      height={1080}
    >
      <Layout direction={'row'} gap={64}>
        <Layout direction={'column'} gap={12} width={520}>
          <Txt {...Label}>line numbers beside a long code line</Txt>
          <Layout direction={'row'} gap={16} width={420}>
            <Layout ref={outlined} direction={'column'} gap={4}>
              <Txt ref={outlined} {...Demo}>
                9
              </Txt>
              <Txt ref={outlined} {...Demo}>
                10
              </Txt>
            </Layout>
            <Rect {...Filler} width={600} height={92} />
          </Layout>
        </Layout>

        <Layout direction={'column'} gap={12} width={520}>
          <Txt {...Label}>a squeezed label, then the same with shrink 0</Txt>
          <Layout direction={'row'} gap={16} width={420}>
            <Txt ref={outlined} {...Demo}>
              one two three
            </Txt>
            <Rect {...Filler} width={600} />
          </Layout>
          <Layout direction={'row'} gap={16} width={420}>
            <Txt ref={outlined} {...Demo} shrink={0}>
              one two three
            </Txt>
            <Rect {...Filler} width={600} />
          </Layout>
        </Layout>

        <Layout direction={'column'} gap={12} width={520}>
          <Txt {...Label}>overflowWrap normal, then anywhere</Txt>
          <Layout direction={'row'} gap={16} width={200}>
            <Txt ref={outlined} {...Demo}>
              incomprehensible
            </Txt>
          </Layout>
          <Layout direction={'row'} gap={16} width={200}>
            <Txt ref={outlined} {...Demo} overflowWrap={'anywhere'}>
              incomprehensible
            </Txt>
          </Layout>
        </Layout>
      </Layout>

      <Layout direction={'row'} gap={64}>
        <Layout direction={'column'} gap={12} width={520}>
          <Txt {...Label}>textWrap false in a squeezed row</Txt>
          <Layout direction={'row'} gap={16} width={420}>
            <Txt ref={outlined} {...Demo} textWrap={false}>
              one two three
            </Txt>
            <Rect {...Filler} width={600} />
          </Layout>
        </Layout>

        <Layout direction={'column'} gap={12} width={520}>
          <Txt {...Label}>a styled Txt and an inline box in a column</Txt>
          <Layout direction={'column'} width={240}>
            <Txt ref={outlined} {...Demo}>
              <Txt fontWeight={700} fill={'#ffd479'}>
                emphasis
              </Txt>{' '}
              and
              <Rect fill={'#4f8cc9'} width={120} height={28} radius={6} />
              after
            </Txt>
          </Layout>
        </Layout>

        <Layout direction={'column'} gap={12} width={520}>
          <Txt {...Label}>a reactive text in a squeezed row</Txt>
          <Layout direction={'row'} gap={16} width={420}>
            <Txt ref={outlined} {...Demo} text={caption} />
            <Rect {...Filler} width={600} />
          </Layout>
        </Layout>
      </Layout>

      <Layout direction={'row'} gap={64}>
        <Layout direction={'column'} gap={12} width={520}>
          <Txt {...Label}>a nested container in a squeezed row</Txt>
          <Layout direction={'row'} gap={16} width={420}>
            <Layout ref={outlined} direction={'column'} gap={4}>
              <Layout direction={'row'} gap={8}>
                <Txt {...Demo}>width</Txt>
                <Txt {...Demo}>128</Txt>
              </Layout>
            </Layout>
            <Rect {...Filler} width={600} height={92} />
          </Layout>
        </Layout>

        <Layout direction={'column'} gap={12} width={520}>
          <Txt {...Label}>a narrow column keeps its box and overflows</Txt>
          <Layout direction={'column'} width={160}>
            <Txt ref={outlined} {...Demo}>
              an incomprehensible word
            </Txt>
          </Layout>
        </Layout>

        <Layout direction={'column'} gap={12} width={520}>
          <Txt {...Label}>a short column keeps its items at their height</Txt>
          <Layout ref={outlined} direction={'column'} width={100} height={60}>
            <Txt {...Demo}>one two three</Txt>
            <Txt {...Demo} fill={'#f9c66d'}>
              next
            </Txt>
          </Layout>
        </Layout>
      </Layout>
    </Layout>,
  );

  for (const box of outlined) {
    box
      .parent()
      ?.add(
        <Rect
          layoutSelf={false}
          stroke={'#68abdf'}
          lineWidth={2}
          size={() => box.size()}
          position={() => box.position()}
        />,
      );
  }

  yield* waitFor(0.5);
  caption('considerably');
  yield* waitFor(0.5);
  caption('a few short words');
  yield* waitFor(0.5);
});
