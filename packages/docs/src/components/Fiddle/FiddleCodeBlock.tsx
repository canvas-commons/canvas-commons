import Fiddle from '@site/src/components/Fiddle/index';
import Pre, {Props} from '@theme-original/MDXComponents/Pre';
import React, {isValidElement} from 'react';

interface CodeProps {
  children?: string;
  className?: string;
  metastring?: string;
  editor?: boolean;
  mode?: 'code' | 'editor' | 'preview';
  ratio?: string;
}

/** Render editor-marked MDX fences as interactive examples. */
export default function FiddleCodeBlock(props: Props) {
  if (isValidElement<CodeProps>(props.children)) {
    const code = props.children.props;
    const meta = code.metastring ?? '';
    if (
      (code.editor || /(?:^|\s)editor(?:\s|$)/.test(meta)) &&
      typeof code.children === 'string'
    ) {
      const mode =
        code.mode ??
        meta.match(
          /(?:^|\s)mode=["']?(code|editor|preview)(?:["']?(?:\s|$))/,
        )?.[1];
      const ratio =
        code.ratio ??
        meta.match(/(?:^|\s)ratio=["']?([\d./]+)(?:["']?(?:\s|$))/)?.[1];
      return (
        <Fiddle
          mode={mode === 'code' || mode === 'preview' ? mode : 'editor'}
          ratio={ratio}
        >
          {code.children}
        </Fiddle>
      );
    }
  }
  return <Pre {...props} />;
}
