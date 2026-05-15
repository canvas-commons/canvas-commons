import hljs from 'highlight.js';
import {Marked} from 'marked';

const Renderer = new Marked({
  async: false,
  renderer: {
    link({href, text}) {
      return `<a href='${href}' target='_blank'>${text}</a>`;
    },
    code({text, lang}) {
      const [language, ...rest] = (lang ?? '').split(/\s+/);
      const cleaned = text
        .split('\n')
        .filter(line => !line.includes('prettier-ignore'))
        .join('\n');
      const resolved = hljs.getLanguage(language) ? language : 'plaintext';
      const result = hljs.highlight(cleaned, {language: resolved});
      return `<pre class="${rest.join(
        ' ',
      )}"><code class="language-${resolved}">${result.value}</code></pre>`;
    },
  },
});

export function renderMarkdown(source: string): string {
  return Renderer.parse(source) as string;
}
