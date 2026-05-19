import type {
  PlaybackManager,
  Player,
  Presenter,
  Project,
  ProjectMetadata,
  Renderer,
} from '@canvas-commons/core';

declare global {
  interface Window {
    commons: {
      project: Project;
      meta: ProjectMetadata;
      renderer: Renderer;
      presenter: Presenter;
      player: Player;
      readonly playback: PlaybackManager;
      readonly selected: unknown;
    };
  }
}

export {};
