import { useEffect, useRef } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { keymap } from '@codemirror/view';
import { Prec } from '@codemirror/state';
import { sql, MySQL } from '@codemirror/lang-sql';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

// Colors come from theme.css, so the editor follows Light / Dark / Latte.
const colors = HighlightStyle.define([
  { tag: [t.keyword, t.operatorKeyword, t.modifier], color: 'var(--accent)', fontWeight: '600' },
  { tag: [t.string, t.special(t.string)], color: 'var(--good)' },
  { tag: [t.number, t.bool, t.null], color: 'var(--amber)' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--muted)', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.standard(t.name), t.typeName], color: 'var(--violet)' },
  { tag: [t.operator, t.punctuation, t.bracket], color: 'var(--muted)' },
]);
const look = EditorView.theme({
  '&': { background: 'var(--card)', color: 'var(--ink)', fontSize: '13.5px', border: '1.5px solid var(--line)', borderRadius: '10px', overflow: 'hidden' },
  '&.cm-focused': { outline: 'none', borderColor: 'var(--accent)' },
  '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.6', minHeight: '130px', maxHeight: '360px' },
  '.cm-gutters': { background: 'var(--card-2)', color: 'var(--muted)', border: 'none' },
  '.cm-activeLine, .cm-activeLineGutter': { background: 'color-mix(in srgb, var(--accent) 7%, transparent)' },
  '.cm-cursor': { borderLeftColor: 'var(--ink)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { background: 'color-mix(in srgb, var(--accent) 25%, transparent) !important' },
  '.cm-tooltip': { background: 'var(--card)', border: '1px solid var(--line)', color: 'var(--ink)' },
  '.cm-tooltip-autocomplete ul li[aria-selected]': { background: 'var(--accent-soft)', color: 'var(--ink)' },
  '.cm-matchingBracket': { background: 'var(--accent-soft)', outline: 'none' },
});

// SQL editor with highlighting, line numbers, auto-indent, bracket closing and autocomplete of table/column names.
// Ctrl/⌘ + Enter runs. `value` is controlled: a change from outside (Restore query) replaces the text.
export default function SqlEditor({ value, onChange, onRun, schema }) {
  const host = useRef(null), view = useRef(null), cb = useRef({});
  cb.current = { onChange, onRun };
  useEffect(() => {
    view.current = new EditorView({
      parent: host.current,
      doc: value,
      extensions: [
        Prec.highest(keymap.of([{ key: 'Mod-Enter', run: () => { cb.current.onRun(); return true; } }])),
        basicSetup,
        sql({ dialect: MySQL, schema, upperCaseKeywords: true }),
        syntaxHighlighting(colors),
        look,
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ 'aria-label': 'SQL editor', id: 'editor' }),
        EditorView.updateListener.of((u) => { if (u.docChanged) cb.current.onChange(u.state.doc.toString()); }),
      ],
    });
    view.current.focus();
    return () => view.current.destroy();
  }, []);
  useEffect(() => { // outside change (e.g. Restore query)
    const v = view.current;
    if (v && value !== v.state.doc.toString()) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
  }, [value]);
  return <div ref={host} className="sql-editor" />;
}
