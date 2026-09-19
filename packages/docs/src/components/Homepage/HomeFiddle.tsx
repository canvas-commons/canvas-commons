import type {FiddleEditor} from '@canvas-commons/fiddle/editor';
import type {FiddleHost} from '@canvas-commons/fiddle/host';
import type {EditorView} from '@codemirror/view';
import {Pause} from '@site/src/Icon/Pause';
import {PlayArrow} from '@site/src/Icon/PlayArrow';
import {SkipNext} from '@site/src/Icon/SkipNext';
import {SkipPrevious} from '@site/src/Icon/SkipPrevious';
import {parseFiddle} from '@site/src/components/Fiddle/parseFiddle';
import {
  getThemeColors,
  observeTheme,
} from '@site/src/components/Fiddle/themeColors';
import {useFiddleManifest} from '@site/src/components/Fiddle/useFiddleManifest';
import clsx from 'clsx';
import React, {useEffect, useMemo, useRef, useState} from 'react';
import styles from './HomeFiddle.module.css';

export interface HomeFiddleProps {
  children: string;
  /** The render aspect, width over height. */
  ratio?: number;
}

const RENDER_WIDTH = 960;

// The examples package renders these scenes at its 1920x1080 default.
const SCENE_RATIO = 16 / 9;

// Far enough ahead that the runtime is up by the time the section is read.
const PRELOAD_MARGIN = '300px';

const TS_DOC_ID = 'homepage';

/**
 * The homepage playground. The preview runs in a sandboxed iframe and compiles
 * in a worker, so a broken snippet cannot take the page down with it.
 */
export default function HomeFiddle({
  children,
  ratio = SCENE_RATIO,
}: HomeFiddleProps) {
  const manifest = useFiddleManifest();

  const snippets = useMemo(() => parseFiddle(children), [children]);
  const renderHeight = Math.round(RENDER_WIDTH / ratio);

  const [active, setActive] = useState(0);
  const [started, setStarted] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(true);
  const [frame, setFrame] = useState(0);
  const [duration, setDuration] = useState(0);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const editorParentRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<FiddleHost | null>(null);
  const editorRef = useRef<FiddleEditor | null>(null);
  const foldImportsRef = useRef<((view: EditorView) => void) | null>(null);
  const activeRef = useRef(0);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || started) return;
    if (!('IntersectionObserver' in window)) {
      setStarted(true);
      return;
    }
    const observer = new IntersectionObserver(
      entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        observer.disconnect();
        setStarted(true);
      },
      {rootMargin: PRELOAD_MARGIN},
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, [started]);

  useEffect(() => {
    const previewParent = previewRef.current;
    const editorParent = editorParentRef.current;
    if (!started || !manifest || !previewParent || !editorParent) return;

    let disposed = false;
    let host: FiddleHost | null = null;
    let editor: FiddleEditor | null = null;
    let unobserveTheme: (() => void) | null = null;

    void (async () => {
      const [
        {createFiddleHost},
        {createFiddleEditor},
        {codeFolding, foldGutter},
        {folding, foldImports},
      ] = await Promise.all([
        import('@canvas-commons/fiddle/host'),
        import('@canvas-commons/fiddle/editor'),
        import('@codemirror/language'),
        import('@site/src/components/Fiddle/folding'),
      ]);
      if (disposed) return;

      host = createFiddleHost({
        container: previewParent,
        manifest,
        width: RENDER_WIDTH,
        height: renderHeight,
        onState: setPaused,
        onFrame: setFrame,
        onDuration: setDuration,
        onError: (_kind, message) => setError(message),
        onDiagnostics: diagnostics => {
          editor?.setDiagnostics(diagnostics);
          const failure = diagnostics.find(
            diagnostic => diagnostic.severity === 'error',
          );
          setError(failure ? failure.message : null);
        },
      });
      hostRef.current = host;
      host.setVariables(getThemeColors());
      unobserveTheme = observeTheme(() => host?.setVariables(getThemeColors()));

      editor = createFiddleEditor({
        parent: editorParent,
        doc: snippets[activeRef.current].lines.join('\n'),
        onChange: doc => host?.setSource(doc),
        tsDocId: TS_DOC_ID,
        typesUrl: manifest.typesUrl,
        onError: setError,
        // The type pack is megabytes; a visitor who only watches never needs it.
        deferTypeScript: true,
        extensions: [codeFolding(), foldGutter(), folding()],
      });
      editorRef.current = editor;
      foldImportsRef.current = foldImports;
      foldImports(editor.view);
      host.setSource(editor.getValue());
      setReady(true);
    })().catch(cause => {
      if (!disposed) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    });

    return () => {
      disposed = true;
      unobserveTheme?.();
      editor?.destroy();
      host?.dispose();
      editorRef.current = null;
      hostRef.current = null;
      setReady(false);
      setDuration(0);
    };
  }, [started, manifest, renderHeight, snippets]);

  useEffect(() => {
    const editorParent = editorParentRef.current;
    if (!ready || !editorParent) return;
    const enableTypeScript = () => editorRef.current?.enableTypeScript();
    editorParent.addEventListener('focusin', enableTypeScript, {once: true});
    return () => editorParent.removeEventListener('focusin', enableTypeScript);
  }, [ready]);

  const selectTab = (index: number) => {
    setActive(index);
    activeRef.current = index;
    setError(null);
    const source = snippets[index].lines.join('\n');
    const editor = editorRef.current;
    editor?.setValue(source);
    if (editor) foldImportsRef.current?.(editor.view);
    hostRef.current?.recompile(source);
  };

  const togglePlayback = () => {
    const host = hostRef.current;
    if (!host) {
      setStarted(true);
      return;
    }
    if (paused) {
      host.play();
    } else {
      host.pause();
    }
  };

  return (
    <div className={styles.root} ref={rootRef}>
      <div className={styles.tabBar} role="tablist">
        {snippets.map((snippet, index) => (
          <button
            key={snippet.name}
            role="tab"
            aria-selected={index === active}
            className={clsx(styles.tab, index === active && styles.tabActive)}
            onClick={() => selectTab(index)}
          >
            {snippet.name}
          </button>
        ))}
      </div>
      <div className={styles.body}>
        <div className={styles.editor} ref={editorParentRef} />
        <div className={styles.previewPane}>
          <div
            className={styles.preview}
            ref={previewRef}
            style={{aspectRatio: `${RENDER_WIDTH} / ${renderHeight}`}}
          />
          {duration === 0 && (
            <button
              className={styles.runOverlay}
              onClick={togglePlayback}
              disabled={started}
            >
              {started ? (
                <span>Loading…</span>
              ) : (
                <>
                  <PlayArrow />
                  <span>Run</span>
                </>
              )}
            </button>
          )}
          {duration > 0 && (
            <div
              className={styles.progress}
              style={{width: `${(frame / duration) * 100}%`}}
            />
          )}
        </div>
      </div>
      <div className={styles.controls}>
        <button
          className={styles.play}
          onClick={togglePlayback}
          title="Play / pause"
        >
          {paused ? <PlayArrow /> : <Pause />}
          <span>{paused ? 'Play' : 'Pause'}</span>
        </button>
        <button
          className={styles.icon}
          onClick={() => hostRef.current?.seek(Math.max(0, frame - 1))}
          title="Previous frame"
        >
          <SkipPrevious />
        </button>
        <button
          className={styles.icon}
          onClick={() => hostRef.current?.seek(frame + 1)}
          title="Next frame"
        >
          <SkipNext />
        </button>
        <div className={styles.spacer} />
        <button className={styles.reset} onClick={() => selectTab(active)}>
          Reset
        </button>
      </div>
      {error && <pre className={styles.error}>{error}</pre>}
    </div>
  );
}
