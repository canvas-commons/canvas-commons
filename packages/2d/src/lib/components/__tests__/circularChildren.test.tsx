import {createComputed, useLogger} from '@canvas-commons/core';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {useScene2D} from '../../scenes';
import {Node} from '../Node';
import {mockScene2D} from './mockScene2D';

describe('adding children inside a computation', () => {
  mockScene2D();

  it('does not depend on the parent of the node it builds', () => {
    let runs = 0;
    const build = createComputed(() => {
      runs++;
      const group = new Node({});
      group.add(new Node({}));
      return group;
    });

    const group = build();
    useScene2D().getView().add(group);

    expect(build()).toBe(group);
    expect(runs).toBe(1);
  });
});

describe('adding a node under itself', () => {
  mockScene2D();
  afterEach(() => vi.restoreAllMocks());

  it('logs an error for the rejected node only', () => {
    const error = vi.spyOn(useLogger(), 'error').mockImplementation(() => {});

    const inner = new Node({});
    const outer = new Node({children: [inner]});
    useScene2D().getView().add(outer);
    expect(error).not.toHaveBeenCalled();

    inner.add([outer, new Node({})]);

    expect(error).toHaveBeenCalledOnce();
    expect(inner.children()).toHaveLength(1);
    expect(outer.parent()).toBe(useScene2D().getView());
  });
});
