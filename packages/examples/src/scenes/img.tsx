import {Img, makeScene2D} from '@canvas-commons/2d';
import {createRef, waitFor} from '@canvas-commons/core';

// A tiny inline PNG so the scene has no external dependency.
const IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHgAAAB4CAYAAAA5ZDbSAAACHklEQVR4nO3dzU3DQBQA4RhRBWVwopWUQgWUkrq40Ia5ZKXIsr0/2fWuJ/PdyT5leLKRiDP9fn7Nlxfy833rPcKh3noPoLYMDGdgOAPDGRjOwHAGhjMwnIHhDAxnYDgDwxkYzsBwBoYzMJyB4QwMZ2A4A8MZGM7AcAaGMzCcgeEMDGdgOAPDGRjOwHAGhjMwnIHhDAxnYDgDwxkYzsBwBoYzMJyB4QwMZ2A4A8MZGM7AcAaGMzCcgeEMDGdgOAPDGRjOwHAGhjMwnIHhDAxnYLjp73Z5qe8u/Lhept4zHMkNhjMwnIHhDAxnYLj33gNQzfMc/etkmqbmd/QGriQlaOxnWgQ38JNKwsZeq2ZoAxeqGXbrtWuE9iarQMu4tc9xgzMcFXbtzNJtdoMT9Yhb43wDJ+gdNyiZw8ARo8QNcucx8I7R4gY5cxkYzsAbRt3eIHU+A68YPW6QMqeB4Qy8cJbtDWLzGhjOwA/Otr3B3twGhjMwnIHhDHx31utvsDW/geEMDGdgOAPDGRjOwHAGhjMwnIHvjvggWEtb8xsYzsBwBoYz8IOzXof35jYwnIEXzrbFsXkNDGfgFWfZ4pQ5Dbxh9Mip8xkYzsA7Rt3inLkMHDFa5Nx5DJxglMglcxg4Ue/Ipef7GKUM4U0+8n+on/3FcoMLHLXNNc5xgwu13GafVTmQmqF92uzAlnF8XjRc77vuwJssOAPDGRjOwHD/V4yL+PArBJAAAAAASUVORK5CYII=';

export default makeScene2D(function* (view) {
  view.fill('#141414');
  const image = createRef<Img>();
  // A radius rounds the corners; `draw` clips the bitmap to them, so the SVG
  // must clip the embedded `<image>` to match (square corners would leak).
  view.add(
    <Img
      ref={image}
      src={IMAGE}
      width={400}
      height={400}
      radius={80}
      stroke={'#e6a700'}
      lineWidth={8}
      smoothing
    />,
  );
  yield* waitFor(0.5);
});
