import {Vector2} from '@canvas-commons/core';
import 'geometry-polyfill';
import {beforeEach, describe, expect, test} from 'vitest';
import {Layout} from '../components/Layout';
import {Rect} from '../components/Rect';
import {mockScene2D} from '../components/__tests__/mockScene2D';
import {useScene2D} from '../scenes';

describe('Curried Transform Signals', () => {
  mockScene2D();

  let parent: Rect;
  let child: Rect;

  beforeEach(() => {
    parent = new Rect({
      position: [100, 100],
      scale: [1, 1],
      rotation: 0,
      size: [200, 200],
    });

    child = new Rect({
      position: [50, 50],
      scale: [1, 1],
      rotation: 0,
      size: [100, 100],
    });

    parent.add(child);

    useScene2D().getView().add(parent);
  });

  describe('Position relativeTo curried API', () => {
    test('should return curried signal when called with only node', () => {
      const curried = child.position.relativeTo(parent);

      // Should be callable
      expect(typeof curried).toBe('function');

      // Should have component accessors
      expect(curried.x).toBeDefined();
      expect(curried.y).toBeDefined();
      expect(typeof curried.x).toBe('function');
      expect(typeof curried.y).toBe('function');
    });

    test('should get relative position when calling curried signal', () => {
      const curried = child.position.relativeTo(parent);
      const relativePos = curried();

      expect(relativePos).toBeInstanceOf(Vector2);
      // With simple transforms, this should work
      expect(typeof relativePos.x).toBe('number');
      expect(typeof relativePos.y).toBe('number');
    });

    test('should set relative position when calling curried signal with value', () => {
      const curried = child.position.relativeTo(parent);
      const originalPos = child.position();

      // This should work without errors
      curried([100, 200]);

      // Position should have changed
      expect(child.position()).not.toEqual(originalPos);
    });

    test('should access x component of relative position', () => {
      const curried = child.position.relativeTo(parent);

      // Get x component
      const xValue = curried.x();
      expect(typeof xValue).toBe('number');

      // Set x component
      const originalPos = child.position();
      curried.x(150);

      // Position should have changed
      expect(child.position()).not.toEqual(originalPos);
    });

    test('should access y component of relative position', () => {
      const curried = child.position.relativeTo(parent);

      // Get y component
      const yValue = curried.y();
      expect(typeof yValue).toBe('number');

      // Set y component
      const originalPos = child.position();
      curried.y(250);

      // Position should have changed
      expect(child.position()).not.toEqual(originalPos);

      // Y component should be updated
      expect(curried.y()).toBeCloseTo(250, 0.01);
    });
  });

  describe('Scale relativeTo curried API', () => {
    test('should return curried signal when called with only node', () => {
      const curried = child.scale.relativeTo(parent);

      expect(typeof curried).toBe('function');
      expect(curried.x).toBeDefined();
      expect(curried.y).toBeDefined();
    });
  });

  describe('Rotation relativeTo curried API', () => {
    test('should return curried signal when called with only node', () => {
      const curried = child.rotation.relativeTo(parent);

      expect(typeof curried).toBe('function');
    });
  });

  describe('Origin signals with transform methods', () => {
    test('should support transform methods on origin signals', () => {
      const layout = new Layout({size: [200, 100]});

      // Origin signals should have transform methods
      expect(layout.top.abs).toBeDefined();
      expect(layout.top.view).toBeDefined();
      expect(layout.top.local).toBeDefined();
      expect(layout.top.relativeTo).toBeDefined();
    });
  });

  describe('Component Tweening', () => {
    test('should support component tweening for enhanced transform methods', () => {
      // Test abs component tweening
      expect(() => {
        child.position.abs.x(100, 1);
      }).not.toThrow();

      expect(() => {
        child.position.abs.y(200, 1);
      }).not.toThrow();

      // Test view component tweening
      expect(() => {
        child.position.view.x(300, 1);
      }).not.toThrow();

      expect(() => {
        child.position.view.y(400, 1);
      }).not.toThrow();

      // Test local component tweening
      expect(() => {
        child.position.local.x(50, 1);
      }).not.toThrow();

      expect(() => {
        child.position.local.y(75, 1);
      }).not.toThrow();
    });

    test('should support component tweening for curried relativeTo', () => {
      const curried = child.position.relativeTo(parent);

      // Component tweening should now work
      expect(() => {
        curried.x(100, 1); // Duration parameter should work
      }).not.toThrow();

      expect(() => {
        curried.y(100, 1);
      }).not.toThrow();
    });

    test('should support component tweening for scale signals', () => {
      const curried = child.scale.relativeTo(parent);

      // Scale component tweening
      expect(() => {
        curried.x(2, 1);
      }).not.toThrow();

      expect(() => {
        curried.y(3, 1);
      }).not.toThrow();

      // Enhanced scale methods
      expect(() => {
        child.scale.abs.x(1.5, 1);
      }).not.toThrow();

      expect(() => {
        child.scale.view.y(2.5, 1);
      }).not.toThrow();
    });
  });

  describe('Type safety and error handling', () => {
    test('should maintain type safety with proper return types', () => {
      const curried = child.position.relativeTo(parent);

      // Getter should return Vector2
      const pos = curried();
      expect(pos).toBeInstanceOf(Vector2);

      // Component getters should return numbers
      const x = curried.x();
      const y = curried.y();
      expect(typeof x).toBe('number');
      expect(typeof y).toBe('number');

      // Setters should return the owner (child)
      const result1 = curried([100, 100]);
      expect(result1).toBe(child);

      const result2 = curried.x(150);
      expect(result2).toBe(child);
    });
  });

  describe('Coordinate Space Verification', () => {
    test('should correctly handle absolute space transformations', () => {
      // Set up known initial state
      parent.position([100, 100]);
      parent.scale([2, 2]);
      parent.rotation(45);
      child.position([50, 50]);

      // Test absolute position getter
      const absPos = child.position.abs();
      expect(absPos).toBeInstanceOf(Vector2);

      // Test absolute position setter
      child.position.abs([200, 300]);
      const newAbsPos = child.position.abs();
      expect(newAbsPos.x).toBeCloseTo(200, 0.01);
      expect(newAbsPos.y).toBeCloseTo(300, 0.01);

      // Test absolute component setters
      child.position.abs.x(250);
      expect(child.position.abs().x).toBeCloseTo(250, 0.01);

      child.position.abs.y(350);
      expect(child.position.abs().y).toBeCloseTo(350, 0.01);
    });

    test('should correctly handle relative space transformations', () => {
      // Set up known state
      parent.position([100, 100]);
      child.position([50, 50]);

      const curried = child.position.relativeTo(parent);

      // Test relative position getter
      const relPos = curried();
      expect(relPos).toBeInstanceOf(Vector2);

      // Test relative position setter
      curried([75, 25]);
      const newRelPos = curried();
      expect(newRelPos.x).toBeCloseTo(75, 0.01);
      expect(newRelPos.y).toBeCloseTo(25, 0.01);

      // Test relative component setters
      curried.x(100);
      expect(curried.x()).toBeCloseTo(100, 0.01);

      curried.y(50);
      expect(curried.y()).toBeCloseTo(50, 0.01);
    });

    test('should correctly handle view space transformations', () => {
      // Test view space getter
      const viewPos = child.position.view();
      expect(viewPos).toBeInstanceOf(Vector2);

      // Test view space setter
      child.position.view([400, 300]);
      const newViewPos = child.position.view();
      expect(newViewPos.x).toBeCloseTo(400, 0.01);
      expect(newViewPos.y).toBeCloseTo(300, 0.01);

      // Test view component setters
      child.position.view.x(450);
      expect(child.position.view().x).toBeCloseTo(450, 0.01);

      child.position.view.y(350);
      expect(child.position.view().y).toBeCloseTo(350, 0.01);
    });

    test('should correctly handle local space transformations', () => {
      // Local space should be the raw position values
      child.position([60, 80]);

      // Test local space getter
      const localPos = child.position.local();
      expect(localPos.x).toBeCloseTo(60, 0.01);
      expect(localPos.y).toBeCloseTo(80, 0.01);

      // Test local space setter
      child.position.local([120, 140]);
      const newLocalPos = child.position.local();
      expect(newLocalPos.x).toBeCloseTo(120, 0.01);
      expect(newLocalPos.y).toBeCloseTo(140, 0.01);

      // Test local component setters
      child.position.local.x(150);
      expect(child.position.local().x).toBeCloseTo(150, 0.01);

      child.position.local.y(170);
      expect(child.position.local().y).toBeCloseTo(170, 0.01);
    });

    test('should maintain consistency between coordinate spaces', () => {
      // Set a known absolute position
      child.position.abs([300, 200]);
      const absPos = child.position.abs();

      // The absolute position should be consistent
      expect(absPos.x).toBeCloseTo(300, 0.01);
      expect(absPos.y).toBeCloseTo(200, 0.01);

      // Relative position should reflect the difference from parent
      const relPos = child.position.relativeTo(parent)();
      const parentAbsPos = parent.position.abs();
      expect(relPos.x).toBeCloseTo(absPos.x - parentAbsPos.x, 0.01);
      expect(relPos.y).toBeCloseTo(absPos.y - parentAbsPos.y, 0.01);
    });
  });

  describe('Consistency across signal types', () => {
    test('should provide consistent API across position, scale, and rotation', () => {
      // All should support curried relativeTo
      const positionCurried = child.position.relativeTo(parent);
      const scaleCurried = child.scale.relativeTo(parent);
      const rotationCurried = child.rotation.relativeTo(parent);

      // All should be callable functions
      expect(typeof positionCurried).toBe('function');
      expect(typeof scaleCurried).toBe('function');
      expect(typeof rotationCurried).toBe('function');

      // Vector signals should have component access
      expect(positionCurried.x).toBeDefined();
      expect(positionCurried.y).toBeDefined();
      expect(scaleCurried.x).toBeDefined();
      expect(scaleCurried.y).toBeDefined();
    });

    test('should work with method chaining', () => {
      // Should be able to chain operations naturally
      const curried = child.position.relativeTo(parent);

      // Chain component setters
      const result = curried.x(100).position.relativeTo(parent).y(200);
      expect(result).toBe(child);

      // Verify values were set
      expect(curried.x()).toBeCloseTo(100, 0.01);
      expect(curried.y()).toBeCloseTo(200, 0.01);
    });
  });

  describe('Layout Origin Signals', () => {
    let layout: Layout;

    beforeEach(() => {
      layout = new Layout({
        size: [300, 200],
        position: [50, 50],
      });
      useScene2D().getView().add(layout);
    });

    test('should provide transform methods for layout origin signals', () => {
      // All origin signals should have transform methods
      expect(layout.left.abs).toBeDefined();
      expect(layout.left.view).toBeDefined();
      expect(layout.left.local).toBeDefined();
      expect(layout.left.relativeTo).toBeDefined();

      expect(layout.top.abs).toBeDefined();
      expect(layout.top.view).toBeDefined();
      expect(layout.top.local).toBeDefined();
      expect(layout.top.relativeTo).toBeDefined();

      expect(layout.right.abs).toBeDefined();
      expect(layout.right.view).toBeDefined();
      expect(layout.right.local).toBeDefined();
      expect(layout.right.relativeTo).toBeDefined();

      expect(layout.bottom.abs).toBeDefined();
      expect(layout.bottom.view).toBeDefined();
      expect(layout.bottom.local).toBeDefined();
      expect(layout.bottom.relativeTo).toBeDefined();
    });

    test('should support component access for layout origin signals', () => {
      // Component access should be available for all transform methods
      expect(layout.left.abs.x).toBeDefined();
      expect(layout.left.abs.y).toBeDefined();
      expect(layout.left.view.x).toBeDefined();
      expect(layout.left.view.y).toBeDefined();
      expect(layout.left.local.x).toBeDefined();
      expect(layout.left.local.y).toBeDefined();

      expect(layout.top.abs.x).toBeDefined();
      expect(layout.top.abs.y).toBeDefined();
      expect(layout.top.view.x).toBeDefined();
      expect(layout.top.view.y).toBeDefined();
      expect(layout.top.local.x).toBeDefined();
      expect(layout.top.local.y).toBeDefined();
    });

    test('should allow getting layout origin positions', () => {
      // Test absolute coordinate access
      const leftAbs = layout.left.abs();
      const topAbs = layout.top.abs();
      const rightAbs = layout.right.abs();
      const bottomAbs = layout.bottom.abs();

      expect(leftAbs).toBeInstanceOf(Vector2);
      expect(topAbs).toBeInstanceOf(Vector2);
      expect(rightAbs).toBeInstanceOf(Vector2);
      expect(bottomAbs).toBeInstanceOf(Vector2);

      // Test component access
      expect(typeof layout.left.abs.x()).toBe('number');
      expect(typeof layout.left.abs.y()).toBe('number');
      expect(typeof layout.top.view.x()).toBe('number');
      expect(typeof layout.top.view.y()).toBe('number');
    });

    test('should allow setting layout origin positions', () => {
      // Test setting absolute position
      const originalPosition = layout.position();
      layout.left.abs([100, 150]);

      // Position should have changed
      expect(layout.position()).not.toEqual(originalPosition);

      // Test component setters
      layout.top.abs.y(200);
      layout.right.view.x(300);

      // Should not throw errors
      expect(() => {
        layout.bottom.local([250, 180]);
      }).not.toThrow();
    });

    test('should support component tweening for layout origin signals', () => {
      // Test component tweening for different coordinate spaces
      expect(() => {
        layout.left.abs.x(100, 1);
      }).not.toThrow();

      expect(() => {
        layout.top.view.y(150, 1);
      }).not.toThrow();

      expect(() => {
        layout.right.local.x(200, 1);
      }).not.toThrow();

      expect(() => {
        layout.bottom.abs.y(250, 1);
      }).not.toThrow();
    });

    test('should support relativeTo for layout origin signals', () => {
      // Create another layout to use as reference
      const reference = new Layout({
        size: [200, 150],
        position: [0, 0],
      });
      useScene2D().getView().add(reference);

      // Test getting relative position
      const relativePos = layout.left.relativeTo(reference);
      expect(relativePos).toBeInstanceOf(Vector2);
    });

    test('should maintain consistency between origin signal coordinate spaces', () => {
      // Set a known position
      layout.position([100, 75]);

      // Get position through different origin signals
      const leftLocal = layout.left.local();
      const topLocal = layout.top.local();

      // Local positions should be relative to layout's local coordinate system
      expect(leftLocal).toBeInstanceOf(Vector2);
      expect(topLocal).toBeInstanceOf(Vector2);

      // Setting position through origin signals should update the layout
      const originalPos = layout.position();
      layout.left.local([150, 100]);
      expect(layout.position()).not.toEqual(originalPos);
    });

    test('should work with different layout configurations', () => {
      const centerLayout = new Layout({
        size: [200, 100],
        position: [0, 0],
      });
      useScene2D().getView().add(centerLayout);

      expect(() => {
        centerLayout.left.abs.x(50);
      }).not.toThrow();

      expect(() => {
        centerLayout.top.view.y(25);
      }).not.toThrow();

      const topLeftLayout = new Layout({
        size: [200, 100],
        position: [0, 0],
      });
      useScene2D().getView().add(topLeftLayout);

      expect(() => {
        topLeftLayout.right.abs([100, 50]);
      }).not.toThrow();

      expect(() => {
        topLeftLayout.bottom.local.y(75);
      }).not.toThrow();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle null or undefined references gracefully', () => {
      // Test relativeTo with null/undefined nodes
      expect(() => {
        child.position.relativeTo(null as any);
      }).not.toThrow();

      expect(() => {
        child.position.relativeTo(undefined as any);
      }).not.toThrow();
    });

    test('should handle nodes not in the scene tree', () => {
      const orphanNode = new Rect({
        position: [100, 100],
        size: [50, 50],
      });

      // Should not throw when working with orphaned nodes
      expect(() => {
        child.position.relativeTo(orphanNode);
      }).not.toThrow();

      expect(() => {
        orphanNode.position.abs([200, 200]);
      }).not.toThrow();

      expect(() => {
        orphanNode.position.view.x(150);
      }).not.toThrow();
    });

    test('should handle invalid vector inputs', () => {
      // Test with various invalid inputs
      expect(() => {
        child.position.abs([NaN, 100]);
      }).not.toThrow();

      expect(() => {
        child.position.view([100, Infinity]);
      }).not.toThrow();

      expect(() => {
        child.position.local([-Infinity, -100]);
      }).not.toThrow();
    });

    test('should handle deeply nested node hierarchies', () => {
      // Create a deep hierarchy
      let currentParent = parent;
      const nodes = [parent];

      for (let i = 0; i < 10; i++) {
        const newNode = new Rect({
          position: [10, 10],
          size: [50, 50],
        });
        currentParent.add(newNode);
        nodes.push(newNode);
        currentParent = newNode;
      }

      const deepChild = nodes[nodes.length - 1];
      const rootParent = nodes[0];

      // Should handle deep transformations
      expect(() => {
        deepChild.position.relativeTo(rootParent);
      }).not.toThrow();

      expect(() => {
        deepChild.position.abs([500, 500]);
      }).not.toThrow();

      const relative = deepChild.position.relativeTo(rootParent);
      expect(() => {
        relative.x(250);
      }).not.toThrow();
    });

    test('should handle circular references in relativeTo', () => {
      // Test circular references
      const nodeA = new Rect({position: [0, 0], size: [100, 100]});
      const nodeB = new Rect({position: [50, 50], size: [100, 100]});

      nodeA.add(nodeB);
      useScene2D().getView().add(nodeA);

      // This creates a logical circular reference but should not crash
      expect(() => {
        const relativeA = nodeA.position.relativeTo(nodeB);
        const relativeB = nodeB.position.relativeTo(nodeA);

        relativeA([100, 100]);
        relativeB([50, 50]);
      }).not.toThrow();
    });

    test('should handle components with zero or negative size', () => {
      const zeroLayout = new Layout({
        size: [0, 0],
        position: [100, 100],
      });
      useScene2D().getView().add(zeroLayout);

      expect(() => {
        zeroLayout.left.abs.x(50);
      }).not.toThrow();

      expect(() => {
        zeroLayout.top.view.y(75);
      }).not.toThrow();

      const negativeLayout = new Layout({
        size: [-100, -50],
        position: [100, 100],
      });
      useScene2D().getView().add(negativeLayout);

      expect(() => {
        negativeLayout.right.local([200, 150]);
      }).not.toThrow();
    });

    test('should handle extreme coordinate values', () => {
      const extremeValues = [
        Number.MAX_SAFE_INTEGER,
        Number.MIN_SAFE_INTEGER,
        1e10,
        -1e10,
        0.00001,
        -0.00001,
      ];

      extremeValues.forEach(value => {
        expect(() => {
          child.position.abs([value, value]);
        }).not.toThrow();

        expect(() => {
          child.position.view.x(value);
        }).not.toThrow();

        expect(() => {
          child.position.local.y(value);
        }).not.toThrow();
      });
    });

    test('should handle transform signals on nodes with complex transformations', () => {
      // Set up complex transformations
      parent.position([200, 150]);
      parent.scale([3, 2]);
      parent.rotation(90);
      parent.skew([30, -15]);

      child.position([75, 25]);
      child.scale([0.5, 1.5]);
      child.rotation(-45);

      // Should handle complex transform chains
      expect(() => {
        const relative = child.position.relativeTo(parent);
        relative([100, 200]);
      }).not.toThrow();

      expect(() => {
        child.position.abs([400, 300]);
      }).not.toThrow();

      expect(() => {
        child.position.view.x(500);
      }).not.toThrow();
    });

    test('should handle concurrent modifications', () => {
      // Simulate concurrent modifications
      const curried = child.position.relativeTo(parent);

      expect(() => {
        // Modify through different interfaces simultaneously
        child.position([100, 100]);
        curried([150, 150]);
        child.position.abs([200, 200]);
        curried.x(250);
        child.position.view.y(300);
      }).not.toThrow();

      // Values should be consistent after all modifications
      expect(typeof curried.x()).toBe('number');
      expect(typeof curried.y()).toBe('number');
    });
  });

  describe('Advanced Component Access and Chaining', () => {
    test('should maintain component state across coordinate space changes', () => {
      // Set initial position through one coordinate space
      child.position.abs([100, 150]);
      const absPos = child.position.abs();

      // Get the same position through different coordinate spaces
      const viewPos = child.position.view();
      const localPos = child.position.local();

      // All should be valid Vector2 instances
      expect(absPos).toBeInstanceOf(Vector2);
      expect(viewPos).toBeInstanceOf(Vector2);
      expect(localPos).toBeInstanceOf(Vector2);

      // Modify through one space and verify in another
      child.position.local.x(250);
      const newAbsPos = child.position.abs();
      expect(newAbsPos.x).not.toBe(absPos.x);
    });

    test('should support layout origin signal component chaining', () => {
      const layout = new Layout({
        size: [200, 100],
        position: [50, 25],
      });
      useScene2D().getView().add(layout);

      // Test chaining layout origin signals
      const result = layout.left.abs
        .x(100)
        .top.view.y(75)
        .right.local([150, 50]);

      expect(result).toBe(layout);

      // Test component access for layout origin signals
      const leftX = layout.left.abs.x;
      const topY = layout.top.view.y;
      const rightLocal = layout.right.local;

      expect(typeof leftX).toBe('function');
      expect(typeof topY).toBe('function');
      expect(typeof rightLocal).toBe('function');

      // Should be able to chain layout operations
      expect(() => {
        layout.left.view.x(200).bottom.abs.y(300).top.local([175, 125]);
      }).not.toThrow();
    });

    test('should support mixed signal type chaining', () => {
      // Test chaining between different signal types (position, scale, rotation)
      const result = child
        .position([100, 100])
        .scale([2, 1.5])
        .rotation(30)
        .position.abs.x(150)
        .scale.view.y(3)
        .rotation(60);

      expect(result).toBe(child);

      // Verify final values
      expect(child.position.abs().x).toBeCloseTo(150, 0.01);
      expect(child.rotation()).toBeCloseTo(60, 0.01);
    });

    test('should support component access with relativeTo chaining', () => {
      // Test component access through relativeTo chains
      const relativePosition = child.position.relativeTo(parent);
      const relativeScale = child.scale.relativeTo(parent);

      // Should support chaining after relativeTo
      const result = relativePosition
        .x(100)
        .scale.relativeTo(parent)
        .y(2)
        .position.relativeTo(parent)
        .y(150);

      expect(result).toBe(child);
      expect(relativePosition.x()).toBeCloseTo(100, 0.01);
      expect(relativeScale.y()).toBeCloseTo(2, 0.01);
    });

    test('should handle rapid successive component modifications', () => {
      // Test rapid modifications through component access
      const iterations = 100;

      expect(() => {
        for (let i = 0; i < iterations; i++) {
          child.position.abs.x(i);
          child.position.view.y(i * 2);
          child.scale.local.x(1 + i * 0.01);
        }
      }).not.toThrow();

      // Final values should be from last iteration
      expect(child.position.abs().x).toBeCloseTo(iterations - 1, 0.01);
      expect(child.scale.local().x).toBeCloseTo(
        1 + (iterations - 1) * 0.01,
        0.01,
      );
    });

    test('should support component getter/setter symmetry', () => {
      // Test that getting and setting through components is symmetric
      const testValue = 123.456;

      // Set through component
      child.position.abs.x(testValue);
      const retrievedValue = child.position.abs.x();

      expect(retrievedValue).toBeCloseTo(testValue, 0.01);

      // Test with view coordinates
      child.position.view.y(testValue);
      const retrievedViewValue = child.position.view.y();

      expect(retrievedViewValue).toBeCloseTo(testValue, 0.01);

      // Test with local coordinates
      child.position.local.x(testValue);
      const retrievedLocalValue = child.position.local.x();

      expect(retrievedLocalValue).toBeCloseTo(testValue, 0.01);
    });
  });
});
