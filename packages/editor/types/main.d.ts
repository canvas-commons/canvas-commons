import type {Project} from '@canvas-commons/core';

export function editor(project: Project): void;

export function index(
  projects: {
    name: string;
    url: string;
  }[],
): void;
