import type {FiddleEditor} from '@canvas-commons/fiddle/editor';
import type {FiddleHost} from '@canvas-commons/fiddle/host';
import {javascript} from '@codemirror/lang-javascript';
import {codeFolding, foldGutter} from '@codemirror/language';
import {EditorState, Text} from '@codemirror/state';
import {keymap} from '@codemirror/view';
import IconImage from '@site/src/Icon/Image';
import {Pause} from '@site/src/Icon/Pause';
import {PlayArrow} from '@site/src/Icon/PlayArrow';
import {SkipNext} from '@site/src/Icon/SkipNext';
import {SkipPrevious} from '@site/src/Icon/SkipPrevious';
import IconSplit from '@site/src/Icon/Split';
import IconText from '@site/src/Icon/Text';
import Dropdown from '@site/src/components/Dropdown';
import CodeBlock from '@theme/CodeBlock';
import clsx from 'clsx';
import React, {useEffect, useId, useMemo, useRef, useState} from 'react';
import {
  areImportsFolded,
  findImportRange,
  foldImports,
  folding,
} from './folding';
import {parseFiddle} from './parseFiddle';
import styles from './styles.module.css';
import {getThemeColors, observeTheme} from './themeColors';
import {useFiddleManifest} from './useFiddleManifest';

export interface FiddleProps {
  className?: string;
  children: string;
  mode?: 'code' | 'editor' | 'preview';
  ratio?: string;
}

/** How far outside the viewport a fiddle keeps its iframe and worker. */
const RETAIN_MARGIN = '50% 0px';

/** An editable docs example with isolated playback and a shared language service. */
export default function Fiddle({
  children,
  className,
  mode: initialMode = 'editor',
  ratio = '4',
}: FiddleProps) {
  const manifest = useFiddleManifest();
  const id = useId();
  const snippets = useMemo(
    () =>
      parseFiddle(children).map(snippet => ({
        name: snippet.name,
        source: snippet.lines.join('\n'),
      })),
    [children],
  );
  const [snippetId, setSnippetId] = useState(0);
  const [mode, setMode] = useState(initialMode);
  const [mounted, setMounted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(true);
  const [frame, setFrame] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [doc, setDoc] = useState(snippets[0].source);
  const [lastDoc, setLastDoc] = useState(snippets[0].source);
  const docRef = useRef(doc);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const editorParentRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<FiddleEditor | null>(null);
  const hostRef = useRef<FiddleHost | null>(null);
  const modeRef = useRef(mode);
  const snippetRef = useRef(0);
  const playbackRef = useRef<'playing' | 'paused'>('paused');
  const visibleRef = useRef(false);

  const parsedRatio = useMemo(() => {
    const [width, height = '1'] = ratio.split('/');
    const value = Number(width) / Number(height);
    return Number.isFinite(value) && value > 0 ? value : 4;
  }, [ratio]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    playbackRef.current = motion.matches ? 'paused' : 'playing';
    const onMotionChange = () => {
      if (!motion.matches) return;
      playbackRef.current = 'paused';
      hostRef.current?.pause();
    };
    motion.addEventListener('change', onMotionChange);
    const visibility = new IntersectionObserver(entries => {
      visibleRef.current = entries.some(entry => entry.isIntersecting);
      if (visibleRef.current) {
        if (playbackRef.current === 'playing' && modeRef.current !== 'code') {
          hostRef.current?.play();
        }
      } else {
        hostRef.current?.pause();
      }
    });
    const retention = new IntersectionObserver(
      entries => {
        const near = entries.some(entry => entry.isIntersecting);
        setMounted(near && modeRef.current !== 'code');
      },
      {rootMargin: RETAIN_MARGIN},
    );
    visibility.observe(root);
    retention.observe(root);
    return () => {
      visibility.disconnect();
      retention.disconnect();
      motion.removeEventListener('change', onMotionChange);
    };
  }, []);

  useEffect(() => {
    const previewParent = previewRef.current;
    const editorParent = editorParentRef.current;
    if (!mounted || !manifest || !previewParent || !editorParent) return;
    const lifetime = new AbortController();
    let host: FiddleHost | null = null;
    let editor: FiddleEditor | null = null;
    let unobserveTheme: (() => void) | undefined;

    const update = (source: string) => {
      setError(null);
      setLastDoc(source);
      host?.recompile(source);
    };
    const enableTypeScript = () => editor?.enableTypeScript();
    editorParent.addEventListener('focusin', enableTypeScript);

    void (async () => {
      const [{createFiddleHost}, {createFiddleEditor}] = await Promise.all([
        import('@canvas-commons/fiddle/host'),
        import('@canvas-commons/fiddle/editor'),
      ]);
      if (lifetime.signal.aborted) return;
      host = createFiddleHost({
        container: previewParent,
        manifest,
        width: 960,
        height: Math.round(960 / parsedRatio),
        onState: setPaused,
        onFrame: setFrame,
        onDuration: value => {
          setDuration(value);
          if (
            visibleRef.current &&
            playbackRef.current === 'playing' &&
            modeRef.current !== 'code'
          ) {
            host?.play();
          }
        },
        onError: (_kind, message) => setError(message),
        onDiagnostics: diagnostics => {
          editor?.setDiagnostics(diagnostics);
          setError(
            diagnostics.find(item => item.severity === 'error')?.message ??
              null,
          );
        },
      });
      hostRef.current = host;
      host.setVariables(getThemeColors());
      unobserveTheme = observeTheme(() => host?.setVariables(getThemeColors()));
      editor = createFiddleEditor({
        parent: editorParent,
        doc: docRef.current,
        onChange: source => {
          docRef.current = source;
          setDoc(source);
          setError(null);
          editor?.setDiagnostics([]);
        },
        tsDocId: `docs-${id.replace(/:/g, '')}`,
        typesUrl: manifest.typesUrl,
        deferTypeScript: true,
        onError: setError,
        extensions: [
          codeFolding(),
          foldGutter(),
          folding(),
          keymap.of([
            {
              key: 'Mod-s',
              preventDefault: true,
              run: view => {
                update(view.state.doc.toString());
                return true;
              },
            },
          ]),
        ],
      });
      editorRef.current = editor;
      foldImports(editor.view);
      update(editor.getValue());
    })().catch(cause => {
      if (!lifetime.signal.aborted) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    });

    return () => {
      lifetime.abort();
      editorParent.removeEventListener('focusin', enableTypeScript);
      unobserveTheme?.();
      editor?.destroy();
      host?.dispose();
      hostRef.current = null;
      editorRef.current = null;
      setDuration(null);
      setError(null);
    };
  }, [mounted, manifest, parsedRatio, snippets, id]);

  const updatePreview = () => {
    const source = editorRef.current?.getValue();
    if (source === undefined) return;
    setError(null);
    setLastDoc(source);
    hostRef.current?.recompile(source);
  };

  const switchSnippet = (index: number) => {
    const snippet = snippets[index];
    if (!snippet) return;
    const editor = editorRef.current;
    const folded = editor ? areImportsFolded(editor.view.state) : true;
    snippetRef.current = index;
    setSnippetId(index);
    docRef.current = snippet.source;
    setDoc(snippet.source);
    setLastDoc(snippet.source);
    setError(null);
    editor?.setValue(snippet.source);
    if (editor && folded) foldImports(editor.view);
    hostRef.current?.recompile(snippet.source);
  };

  const switchMode = (next: NonNullable<FiddleProps['mode']>) => {
    setMode(next);
    modeRef.current = next;
    if (next === 'code') {
      hostRef.current?.pause();
      return;
    }
    if (playbackRef.current === 'playing') hostRef.current?.play();
    setMounted(true);
  };

  const ghostCode = useMemo(() => {
    const state = EditorState.create({
      doc: snippets[snippetId].source,
      extensions: [javascript({jsx: true, typescript: true})],
    });
    const range = findImportRange(state);
    return (
      (range
        ? state.doc.replace(range.from, range.to, Text.of(['...']))
        : state.doc
      ).toString() + '\n'
    );
  }, [snippets, snippetId]);
  const hasChangedSinceLastUpdate = doc !== lastDoc;
  const hasChanged = doc !== snippets[snippetId].source;

  return (
    <div
      ref={rootRef}
      className={clsx(styles.root, className, {
        [styles.codeOnly]: mode === 'code',
        [styles.previewOnly]: mode === 'preview',
      })}
    >
      <div className={styles.layoutControl}>
        <button
          className={clsx(styles.icon, mode === 'code' && styles.active)}
          onClick={() => switchMode('code')}
          title="Source code"
          aria-pressed={mode === 'code'}
        >
          <IconText />
        </button>
        <button
          className={clsx(styles.icon, mode === 'editor' && styles.active)}
          onClick={() => switchMode('editor')}
          title="Editor with preview"
          aria-pressed={mode === 'editor'}
        >
          <IconSplit />
        </button>
        <button
          className={clsx(styles.icon, mode === 'preview' && styles.active)}
          onClick={() => switchMode('preview')}
          title="Preview"
          aria-pressed={mode === 'preview'}
        >
          <IconImage />
        </button>
      </div>
      <div className={styles.preview} style={{aspectRatio: parsedRatio}}>
        <div className={styles.previewHost} ref={previewRef} />
        {duration === null && (
          <div className={styles.loading}>
            {error ? 'Preview unavailable' : 'Loading preview…'}
          </div>
        )}
      </div>
      {duration !== null && duration > 0 && (
        <div
          className={styles.progress}
          style={{width: `${(frame / duration) * 100}%`}}
        />
      )}
      <div className={styles.controls}>
        <div className={styles.section}>
          {hasChangedSinceLastUpdate && (
            <button onClick={updatePreview} className={styles.button}>
              <kbd>CTRL</kbd>
              <kbd>S</kbd>
              <small>Update preview</small>
            </button>
          )}
        </div>
        <div className={styles.section}>
          <button
            className={styles.icon}
            title="Previous frame"
            disabled={duration === null}
            onClick={() => hostRef.current?.seek(Math.max(0, frame - 1))}
          >
            <SkipPrevious />
          </button>
          <button
            className={styles.icon}
            title={paused ? 'Play' : 'Pause'}
            disabled={duration === null}
            onClick={() => {
              playbackRef.current = paused ? 'playing' : 'paused';
              if (paused) hostRef.current?.play();
              else hostRef.current?.pause();
            }}
          >
            {paused ? <PlayArrow /> : <Pause />}
          </button>
          <button
            className={styles.icon}
            title="Next frame"
            disabled={duration === null}
            onClick={() =>
              hostRef.current?.seek(Math.min(duration ?? 0, frame + 1))
            }
          >
            <SkipNext />
          </button>
        </div>
        <div className={styles.section}>
          {snippets.length === 1 && hasChanged && (
            <button className={styles.button} onClick={() => switchSnippet(0)}>
              <small>Reset example</small>
            </button>
          )}
          {snippets.length > 1 && (
            <Dropdown
              className={styles.picker}
              value={hasChanged ? -1 : snippetId}
              onChange={switchSnippet}
              options={snippets
                .map((snippet, index) => ({value: index, name: snippet.name}))
                .concat(hasChanged ? [{value: -1, name: 'Custom'}] : [])}
            />
          )}
        </div>
      </div>
      {error && (
        <pre role="alert" className={styles.error}>
          {error}
        </pre>
      )}
      <div className={styles.editor} ref={editorParentRef}>
        <CodeBlock className={styles.source} language="tsx">
          {mode === 'code' ? snippets[snippetId].source : ghostCode}
        </CodeBlock>
      </div>
    </div>
  );
}
