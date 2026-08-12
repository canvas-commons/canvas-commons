import {Rect, Txt, makeScene2D} from '@canvas-commons/2d';
import {createRef, linear, waitFor} from '@canvas-commons/core';

function hyphenateWord(word: string): string[] {
  if (word.length <= 6) return [word];
  const parts: string[] = [];
  for (let i = 0; i < word.length; i += 4) {
    parts.push(word.slice(i, i + 4));
  }
  return parts;
}

/**
 * Text tweens against a fixed-width, wrapping {@link Txt}: an RPG-style
 * dialog box types and morphs its text while line breaks stay put. Each beat
 * layers in another wrapping feature — manual newlines, hyphenation,
 * Knuth-Plass, and exclusions — all of which keep composing mid-tween.
 */
export default makeScene2D(function* (view) {
  view.fill('#0d1117');

  const label = createRef<Txt>();
  const dialog = createRef<Txt>();
  const sigil = createRef<Rect>();

  view.add(
    <>
      <Txt
        ref={label}
        anchor={[-1, 0]}
        position={[-430, -216]}
        fontFamily={'sans-serif'}
        fontSize={28}
        letterSpacing={3}
        fill={'#6f7b8a'}
        text={'typewriter'}
      />
      <Rect
        position={[0, 60]}
        size={[860, 460]}
        radius={16}
        lineWidth={4}
        stroke={'#2e3947'}
      >
        <Rect
          ref={sigil}
          position={[280, -114]}
          size={[200, 140]}
          radius={12}
          lineWidth={4}
          stroke={'#8a6fb8'}
          fill={'#1a1426'}
          opacity={0}
        />
        <Txt
          ref={dialog}
          anchor={[-1, -1]}
          position={[-380, -184]}
          width={760}
          textWrap
          fontFamily={'sans-serif'}
          fontSize={36}
          lineHeight={52}
          fill={'#d7dee8'}
          text={''}
        />
      </Rect>
    </>,
  );

  // Typewriter reveal along the final layout; the manual newline holds.
  yield* dialog().text(
    'The old druid squints at you.\n' +
      '"Storms are coming," she says. "The pass will be buried by nightfall."',
    3,
    linear,
  );
  yield* waitFor(0.6);

  // Settled lines hold their breaks while the tail still shows old text.
  label().text('stable morph');
  yield* dialog().text(
    'The old druid grins at you.\n' +
      '"Storms have passed," she says. "The pass is open until the equinox."',
    2,
  );
  yield* waitFor(0.6);

  // A narrow column with a hyphenator; broken words keep their visible '-'.
  label().text('hyphenation');
  dialog().hyphenate(() => hyphenateWord);
  yield* dialog().width(460, 0.8);
  yield* dialog().text(
    'Her uncharacteristically overcomplicated topographical annotations ' +
      'circumnavigate every impassable switchback.',
    2,
  );
  yield* waitFor(0.6);

  label().text('knuth-plass');
  dialog().hyphenate(null);
  dialog().wrapMode('knuth-plass');
  yield* dialog().width(760, 0.8);
  yield* dialog().text(
    'Knuth and Plass weigh every break at once, trading a tight line here ' +
      'for an even paragraph everywhere else.',
    2,
  );
  yield* waitFor(0.6);

  // Exclusion bands carve around the sigil while the text is still typing.
  label().text('exclusions');
  dialog().wrapMode('greedy');
  yield* sigil().opacity(1, 0.5);
  dialog().exclusions([
    {
      kind: 'rect',
      x: 560,
      y: 0,
      width: 200,
      height: 140,
      horizontalPadding: 24,
      verticalPadding: 12,
    },
  ]);
  yield* dialog().text(
    'The route pours itself around the warding sigil, band by band, and ' +
      'keeps flowing while every word is still being typed.',
    2.5,
  );
  yield* waitFor(1);
});
