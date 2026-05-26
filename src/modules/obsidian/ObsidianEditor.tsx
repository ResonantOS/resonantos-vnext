// Intent citation: docs/architecture/ADR-020-resonant-notes-clean-room-workspace.md

import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { useEffect, useMemo, useRef } from "react";

type ObsidianEditorProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

const editableCompartment = new Compartment();

const markdownHighlighting = HighlightStyle.define([
  { tag: tags.heading1, color: "var(--text-primary)", fontWeight: "700", fontSize: "1.34em" },
  { tag: tags.heading2, color: "var(--text-primary)", fontWeight: "700", fontSize: "1.2em" },
  { tag: tags.heading3, color: "var(--text-primary)", fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.link, color: "var(--accent)" },
  { tag: tags.url, color: "var(--accent)" },
  { tag: tags.monospace, color: "var(--text-primary)", backgroundColor: "rgba(255, 248, 236, 0.06)" },
  { tag: tags.quote, color: "var(--text-muted)" },
]);

const resonantNotesTheme = EditorView.theme({
  "&": {
    height: "100%",
    minHeight: "0",
    background: "transparent",
    color: "var(--text-primary)",
    fontFamily: "\"IBM Plex Mono\", \"SFMono-Regular\", monospace",
    fontSize: "0.86rem",
    lineHeight: "1.72",
  },
  ".cm-scroller": {
    overflow: "auto",
    padding: "1.25rem clamp(1.2rem, 6vw, 8rem)",
  },
  ".cm-content": {
    caretColor: "var(--accent)",
    minHeight: "100%",
  },
  ".cm-line": {
    padding: "0 0.08rem",
  },
  ".cm-gutters": {
    background: "transparent",
    border: "0",
    color: "rgba(138, 128, 112, 0.46)",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    minWidth: "2.2rem",
    padding: "0 0.85rem 0 0",
  },
  ".cm-activeLine": {
    background: "rgba(255, 248, 236, 0.025)",
  },
  ".cm-activeLineGutter": {
    background: "transparent",
    color: "var(--text-muted)",
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    background: "rgba(16, 185, 129, 0.22)",
  },
  "&.cm-focused": {
    outline: "0",
  },
});

function editorExtensions(onChange: (value: string) => void, disabled: boolean): Extension[] {
  return [
    resonantNotesTheme,
    syntaxHighlighting(markdownHighlighting),
    lineNumbers(),
    history(),
    markdown(),
    keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
    editableCompartment.of(EditorView.editable.of(!disabled)),
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({
      "aria-label": "Resonant Notes note editor",
      spellcheck: "true",
    }),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChange(update.state.doc.toString());
      }
    }),
  ];
}

export function ObsidianEditor({ value, onChange, disabled = false }: ObsidianEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const extensions = useMemo(
    () => editorExtensions((nextValue) => onChangeRef.current(nextValue), disabled),
    [disabled],
  );

  useEffect(() => {
    if (!hostRef.current) {
      return undefined;
    }

    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: value,
        extensions,
      }),
    });

    viewRef.current = view;
    // Deterministic tests dispatch through the real editor state instead of pretending CodeMirror is a textarea.
    Object.assign(hostRef.current, {
      __resonantSetEditorValue(nextValue: string) {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: nextValue },
        });
      },
    });

    return () => {
      delete (hostRef.current as { __resonantSetEditorValue?: unknown } | null)?.__resonantSetEditorValue;
      view.destroy();
      viewRef.current = null;
    };
  }, [extensions]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === value) {
      return;
    }

    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    });
  }, [value]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: editableCompartment.reconfigure(EditorView.editable.of(!disabled)),
    });
  }, [disabled]);

  return <div ref={hostRef} className="obsidian-editor-host" />;
}
