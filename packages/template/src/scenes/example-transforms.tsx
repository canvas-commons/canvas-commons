import {Rect, makeScene2D} from '@canvas-commons/2d';
import {all, createRef, waitFor} from '@canvas-commons/core';

export default makeScene2D(function* (view) {
  const parentRect = createRef<Rect>();
  const childRect = createRef<Rect>();

  view.add(
    <>
      <Rect
        ref={parentRect}
        width={200}
        height={200}
        fill={'blue'}
        position={[100, 50]}
        scale={2}
        rotation={30}
      />
      <Rect
        ref={childRect}
        width={100}
        height={100}
        fill={'red'}
        position={[50, 25]}
        scale={1.5}
        rotation={15}
      />
    </>,
  );

  parentRect().add(childRect());

  yield* waitFor(1);

  // Test the new enhanced transform API

  // 1. Test abs() method - animate to absolute positions
  console.log('=== ABSOLUTE SPACE TRANSFORMATIONS ===');
  console.log('Parent initial absolute position:', parentRect().position.abs());
  console.log('Child initial absolute position:', childRect().position.abs());

  yield* all(
    // Animate child to absolute position [300, 200] over 2 seconds
    childRect().position.abs([300, 200], 2),
    // Animate parent scale to absolute scale [3, 3] over 2 seconds
    parentRect().scale.abs([3, 3], 2),
    // Animate parent to absolute rotation 90 degrees over 2 seconds
    parentRect().rotation.abs(90, 2),
  );

  console.log('After abs animations:');
  console.log('Parent absolute position:', parentRect().position.abs());
  console.log('Parent absolute scale:', parentRect().scale.abs());
  console.log('Parent absolute rotation:', parentRect().rotation.abs());
  console.log('Child absolute position:', childRect().position.abs());

  yield* waitFor(0.5);

  // 1.5. Test component-wise abs() method with detailed logging
  console.log('=== COMPONENT-WISE ABSOLUTE TRANSFORMATIONS ===');
  console.log(
    'Child abs position before component tweening:',
    childRect().position.abs(),
  );

  yield* childRect().position.abs.x(400, 1); // Animate only x to absolute 400
  console.log(
    'Child abs position after X tweening to 400:',
    childRect().position.abs(),
  );

  yield* childRect().position.abs.y(100, 1); // Animate only y to absolute 100
  console.log(
    'Child abs position after Y tweening to 100:',
    childRect().position.abs(),
  );

  yield* waitFor(1);

  // 2. Test relativeTo() method - animate relative to parent (curried API)
  console.log('=== RELATIVE SPACE TRANSFORMATIONS ===');
  console.log('Parent absolute position:', parentRect().position.abs());
  console.log(
    'Child relative to parent before:',
    childRect().position.relativeTo(parentRect())(),
  );
  console.log('Child absolute position before:', childRect().position.abs());

  yield* all(
    // Animate child to position [100, 100] relative to parent over 2 seconds
    childRect().position.relativeTo(parentRect())([100, 100], 2),
    // Animate child to scale [2, 2] relative to parent over 2 seconds
    childRect().scale.relativeTo(parentRect())([2, 2], 2),
    // Animate child to 45 degrees relative to parent over 2 seconds
    childRect().rotation.relativeTo(parentRect())(45, 2),
  );

  console.log('After relativeTo animations:');
  console.log(
    'Child relative to parent:',
    childRect().position.relativeTo(parentRect())(),
  );
  console.log(
    'Child absolute position (should reflect relative change):',
    childRect().position.abs(),
  );
  console.log(
    'Child relative scale:',
    childRect().scale.relativeTo(parentRect())(),
  );
  console.log(
    'Child relative rotation:',
    childRect().rotation.relativeTo(parentRect())(),
  );

  yield* waitFor(0.5);

  // 2.5. Test component access in curried relativeTo with detailed verification
  console.log('=== COMPONENT-WISE RELATIVE TRANSFORMATIONS ===');
  console.log('Before component relative tweening:');
  console.log(
    '  Child rel position:',
    childRect().position.relativeTo(parentRect())(),
  );
  console.log(
    '  Child rel scale:',
    childRect().scale.relativeTo(parentRect())(),
  );

  yield* all(
    // Animate only x position to 150 relative to parent over 1 second
    childRect().position.relativeTo(parentRect()).x(150, 1),
    // Animate only y position to 50 relative to parent over 1 second
    childRect().position.relativeTo(parentRect()).y(50, 1),
    // Test scale components
    childRect().scale.relativeTo(parentRect()).x(1.5, 1),
    childRect().scale.relativeTo(parentRect()).y(0.8, 1),
  );

  console.log('After component relative tweening:');
  console.log(
    '  Child rel position (should be [150, 50]):',
    childRect().position.relativeTo(parentRect())(),
  );
  console.log(
    '  Child rel scale (should be [1.5, 0.8]):',
    childRect().scale.relativeTo(parentRect())(),
  );

  yield* waitFor(1);

  // 3. Test view() method - animate in view space
  console.log('=== VIEW SPACE TRANSFORMATIONS ===');
  console.log('Child view position before:', childRect().position.view());
  console.log('Child view scale before:', childRect().scale.view());
  console.log('Child view rotation before:', childRect().rotation.view());

  yield* all(
    // Animate to view space position [400, 300] over 2 seconds
    childRect().position.view([400, 300], 2),
    // Animate to view space scale [1, 1] over 2 seconds
    childRect().scale.view([1, 1], 2),
    // Animate to view space rotation 0 degrees over 2 seconds
    childRect().rotation.view(0, 2),
  );

  console.log('After view space animations:');
  console.log(
    'Child view position (should be [400, 300]):',
    childRect().position.view(),
  );
  console.log('Child view scale (should be [1, 1]):', childRect().scale.view());
  console.log(
    'Child view rotation (should be 0):',
    childRect().rotation.view(),
  );
  console.log(
    'Child absolute position (for comparison):',
    childRect().position.abs(),
  );

  yield* waitFor(1);

  // 4. Test local() method - animate in local space
  console.log('=== LOCAL SPACE TRANSFORMATIONS ===');
  console.log(
    'Child local position before reset:',
    childRect().position.local(),
  );
  console.log('Child local scale before reset:', childRect().scale.local());
  console.log(
    'Child local rotation before reset:',
    childRect().rotation.local(),
  );

  yield* all(
    // Reset to local position [0, 0] over 2 seconds
    childRect().position.local([0, 0], 2),
    // Reset to local scale [1, 1] over 2 seconds
    childRect().scale.local([1, 1], 2),
    // Reset to local rotation 0 degrees over 2 seconds
    childRect().rotation.local(0, 2),
  );

  console.log('After local space reset:');
  console.log(
    'Child local position (should be [0, 0]):',
    childRect().position.local(),
  );
  console.log(
    'Child local scale (should be [1, 1]):',
    childRect().scale.local(),
  );
  console.log(
    'Child local rotation (should be 0):',
    childRect().rotation.local(),
  );
  console.log(
    'Child absolute position after local reset:',
    childRect().position.abs(),
  );

  yield* waitFor(1);

  // 5. Test origin signals with transform methods
  yield* all(
    // Test that origin signals have transform methods too
    parentRect().top.relativeTo(view)([100, 100], 1),
    parentRect().left.abs([200, 200], 1),
  );

  yield* waitFor(1);

  // Show that we can also get values without setting them (updated to curried API)
  console.log('Child absolute position:', childRect().position.abs());
  console.log(
    'Child position relative to parent:',
    childRect().position.relativeTo(parentRect())(),
  );
  console.log('Child view space position:', childRect().position.view());
  console.log('Child local position:', childRect().position.local());

  console.log('Child absolute scale:', childRect().scale.abs());
  console.log(
    'Child scale relative to parent:',
    childRect().scale.relativeTo(parentRect())(),
  );
  console.log('Child view space scale:', childRect().scale.view());
  console.log('Child local scale:', childRect().scale.local());

  console.log('Child absolute rotation:', childRect().rotation.abs());
  console.log(
    'Child rotation relative to parent:',
    childRect().rotation.relativeTo(parentRect())(),
  );
  console.log('Child view space rotation:', childRect().rotation.view());
  console.log('Child local rotation:', childRect().rotation.local());

  // Test curried signal component access
  console.log(
    'Child relative X position:',
    childRect().position.relativeTo(parentRect()).x(),
  );
  console.log(
    'Child relative Y scale:',
    childRect().scale.relativeTo(parentRect()).y(),
  );

  // Test origin signal access
  console.log('Parent top absolute position:', parentRect().top.abs());
  console.log('Parent left in view space:', parentRect().left.view());
});
