import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { snippetList, Snippet } from './snippets';

export const snippetPluginKey = new PluginKey('latex-snippets');

export class SnippetPluginState {
  tabStops: { index: number; start: number; end: number; value: string }[] = [];
  currentIdx: number = -1;
  active: boolean = false;

  constructor(tabStops?: any[], currentIdx?: number, active?: boolean) {
    this.tabStops = tabStops || [];
    this.currentIdx = currentIdx !== undefined ? currentIdx : -1;
    this.active = active || false;
  }
}

// Check helper to determine if the cursor is currently inside mathematical formatting delimiters
export function isInMathMode(state: any): boolean {
  const { $from } = state.selection;
  
  // 1. Walk up hierarchy to check if inside a node whose type includes math
  for (let d = $from.depth; d >= 0; d--) {
    const node = $from.node(d);
    if (node && (node.type.name.includes('math') || node.type.name.includes('Math') || node.type.name === 'mathBlock' || node.type.name === 'mathFieldBlock')) {
      return true;
    }
  }

  // 2. Count unescaped '$' symbols in the current block, before the cursor
  const startOfParagraph = $from.before();
  const textBefore = state.doc.textBetween(startOfParagraph, $from.pos, '\n');
  const cleanText = textBefore.replace(/\\(\$)/g, '');
  const dollarCount = (cleanText.match(/\$/g) || []).length;
  
  return dollarCount % 2 === 1;
}

// State machine to parse replacement template, resolving groups and visual inputs, mapping absolute locations
export function parseReplacement(
  replacement: string, 
  match: RegExpMatchArray | null, 
  visualText: string
): { text: string; tabStops: { index: number; start: number; end: number; value: string }[] } {
  // First, resolve backreferences: [[0]], [[1]], etc.
  let resolved = replacement;
  if (match) {
    resolved = resolved.replace(/\[\[(\d+)\]\]/g, (_, groupIdxStr) => {
      const idx = parseInt(groupIdxStr, 10);
      return match[idx + 1] !== undefined ? match[idx + 1] : '';
    });
  }
  
  // Resolve ${VISUAL} selections
  resolved = resolved.replace(/\$\{VISUAL\}/g, visualText);

  let text = '';
  const tabStops: { index: number; start: number; end: number; value: string }[] = [];
  
  let i = 0;
  while (i < resolved.length) {
    // Check ${index:default}
    if (resolved.startsWith('${', i)) {
      const closingBrace = resolved.indexOf('}', i);
      if (closingBrace !== -1) {
        const interior = resolved.substring(i + 2, closingBrace);
        const colonIdx = interior.indexOf(':');
        if (colonIdx !== -1) {
          const indexStr = interior.substring(0, colonIdx);
          const defaultVal = interior.substring(colonIdx + 1);
          const index = parseInt(indexStr, 10);
          
          if (!isNaN(index)) {
            const start = text.length;
            text += defaultVal;
            const end = text.length;
            tabStops.push({ index, start, end, value: defaultVal });
            i = closingBrace + 1;
            continue;
          }
        }
      }
    }
    
    // Check raw $index e.g. $0, $1
    if (resolved[i] === '$') {
      let j = i + 1;
      while (j < resolved.length && /\d/.test(resolved[j])) {
        j++;
      }
      if (j > i + 1) {
        const indexStr = resolved.substring(i + 1, j);
        const index = parseInt(indexStr, 10);
        const start = text.length;
        tabStops.push({ index, start, end: start, value: '' });
        i = j;
        continue;
      }
    }
    
    text += resolved[i];
    i++;
  }
  
  return { text, tabStops };
}

export const LatexSnippetExtension = Extension.create({
  name: 'latexSnippetExtension',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: snippetPluginKey,
        
        state: {
          init() {
            return new SnippetPluginState();
          },
          apply(tr, value) {
            if (tr.getMeta('latex-snippet-clear')) {
              return new SnippetPluginState();
            }
            const newInsert = tr.getMeta('latex-snippet-insert');
            if (newInsert) {
              return new SnippetPluginState(newInsert.tabStops, newInsert.currentIdx, true);
            }
            if (!value.active) {
              return value;
            }
            
            // Map tab stops forward to match content edits dynamically
            const mapped = value.tabStops.map(stop => ({
              ...stop,
              start: tr.mapping.map(stop.start),
              end: tr.mapping.map(stop.end)
            }));
            
            if (mapped.length === 0) {
              return new SnippetPluginState();
            }
            return new SnippetPluginState(mapped, value.currentIdx, true);
          }
        },

        props: {
          handleClick(view) {
            const pluginState = snippetPluginKey.getState(view.state);
            if (pluginState && pluginState.active) {
              view.dispatch(view.state.tr.setMeta('latex-snippet-clear', true));
            }
            return false;
          },

          handleTextInput(view, from, to, text) {
            const { state } = view;
            const isMath = isInMathMode(state);
            const { $from } = state.selection;
            const startOfParagraph = $from.before();
            const textBefore = state.doc.textBetween(startOfParagraph, $from.pos, '\n');
            const fullText = textBefore + text;

            const candidates: { snippet: Snippet; regMatch: RegExpMatchArray | null; deleteLength: number }[] = [];

            for (const snippet of snippetList) {
              const ruleIsMath = snippet.options.includes('m');
              const ruleIsText = snippet.options.includes('t');
              if (ruleIsMath && !isMath) continue;
              if (ruleIsText && isMath) continue;

              const isAutoExpand = snippet.options.includes('A');
              const hasVisual = typeof snippet.replacement === 'string' && snippet.replacement.includes('${VISUAL}');

              if (hasVisual) {
                if (state.selection.empty) {
                  continue;
                }
              } else {
                if (!state.selection.empty) {
                  continue;
                }
                if (!isAutoExpand) {
                  continue;
                }
              }

              let matched = false;
              let regMatch: RegExpMatchArray | null = null;
              let deleteLength = 0;

              if (snippet.trigger instanceof RegExp || (typeof snippet.trigger === 'string' && snippet.options.includes('r'))) {
                let regex = snippet.trigger instanceof RegExp ? snippet.trigger : new RegExp(snippet.trigger);
                if (!regex.source.endsWith('$')) {
                  regex = new RegExp(regex.source + '$', regex.flags);
                }
                regMatch = fullText.match(regex);
                if (regMatch) {
                  matched = true;
                  deleteLength = regMatch[0].length;
                }
              } else {
                const triggerStr = snippet.trigger as string;
                if (fullText.endsWith(triggerStr)) {
                  let boundaryOk = true;
                  if (snippet.options.includes('w')) {
                    const charBeforeIdx = fullText.length - triggerStr.length - 1;
                    if (charBeforeIdx >= 0) {
                      boundaryOk = !/\w/.test(fullText[charBeforeIdx]);
                    }
                  }
                  if (boundaryOk) {
                    matched = true;
                    deleteLength = triggerStr.length;
                  }
                }
              }

              if (matched) {
                candidates.push({ snippet, regMatch, deleteLength });
              }
            }

            if (candidates.length > 0) {
              // Sort candidates by priority desc, then longer trigger desc
              candidates.sort((a, b) => {
                const pA = a.snippet.priority || 0;
                const pB = b.snippet.priority || 0;
                if (pA !== pB) return pB - pA;
                return b.deleteLength - a.deleteLength;
              });

              const win = candidates[0];
              const replacement = win.snippet.replacement;
              let resolvedText = '';
              if (typeof replacement === 'function') {
                resolvedText = replacement(win.regMatch || ([] as any));
              } else {
                resolvedText = replacement;
              }

              const visualText = state.selection.empty ? "" : state.doc.textBetween(state.selection.from, state.selection.to, '\n');
              const { text: insertedText, tabStops: parsedTabStops } = parseReplacement(resolvedText, win.regMatch, visualText);

              const { tr } = state;
              const hasVisual = resolvedText.includes('${VISUAL}');
              let deleteStart = 0;
              let deleteEnd = 0;

              if (hasVisual && !state.selection.empty) {
                deleteStart = state.selection.from;
                deleteEnd = state.selection.to;
              } else {
                const fromPos = state.selection.from;
                const deleteLenFromDoc = Math.max(0, win.deleteLength - text.length);
                deleteStart = Math.max(startOfParagraph + 1, fromPos - deleteLenFromDoc);
                deleteEnd = state.selection.to;
              }

              tr.delete(deleteStart, deleteEnd);
              tr.insertText(insertedText, deleteStart);

              const absTabStops = parsedTabStops.map(stop => ({
                ...stop,
                start: deleteStart + stop.start,
                end: deleteStart + stop.end
              }));

              absTabStops.sort((a, b) => a.index - b.index);

              if (absTabStops.length > 0) {
                const firstStop = absTabStops[0];
                const newSelection = TextSelection.create(tr.doc, firstStop.start, firstStop.end);
                tr.setSelection(newSelection);
                tr.setMeta('latex-snippet-insert', {
                  tabStops: absTabStops,
                  currentIdx: 0
                });
              } else {
                const endPos = deleteStart + insertedText.length;
                tr.setSelection(TextSelection.create(tr.doc, endPos, endPos));
                tr.setMeta('latex-snippet-clear', true);
              }

              tr.setMeta('latex-snippet', true);
              view.dispatch(tr);
              return true;
            }

            return false;
          }
        }
      })
    ];
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => {
        const state = this.editor.state;
        const pluginState = snippetPluginKey.getState(state);
        
        // 1. If tab-stop navigation is active, cycle to the next stop
        if (pluginState && pluginState.active && pluginState.tabStops.length > 0) {
          const nextIdx = pluginState.currentIdx + 1;
          const { tr } = state;
          
          if (nextIdx < pluginState.tabStops.length) {
            const stop = pluginState.tabStops[nextIdx];
            const sel = TextSelection.create(tr.doc, stop.start, stop.end);
            tr.setSelection(sel);
            tr.setMeta('latex-snippet-insert', {
              tabStops: pluginState.tabStops,
              currentIdx: nextIdx
            });
            this.editor.view.dispatch(tr);
            return true;
          } else {
            // Exit active snippet mode, place cursor at the very end of the snippet boundary
            const lastStop = pluginState.tabStops[pluginState.tabStops.length - 1];
            const sel = TextSelection.create(tr.doc, lastStop.end, lastStop.end);
            tr.setSelection(sel);
            tr.setMeta('latex-snippet-clear', true);
            this.editor.view.dispatch(tr);
            return true;
          }
        }

        // 2. Otherwise try manual trigger expansion
        const isMath = isInMathMode(state);
        const { $from } = state.selection;
        const startOfParagraph = $from.before();
        const textBefore = state.doc.textBetween(startOfParagraph, $from.pos, '\n');

        const candidates: { snippet: Snippet; regMatch: RegExpMatchArray | null; deleteLength: number }[] = [];

        for (const snippet of snippetList) {
          if (snippet.options.includes('A')) {
            continue; // Skip auto-expands
          }

          const ruleIsMath = snippet.options.includes('m');
          const ruleIsText = snippet.options.includes('t');
          if (ruleIsMath && !isMath) continue;
          if (ruleIsText && isMath) continue;

          let matched = false;
          let regMatch: RegExpMatchArray | null = null;
          let deleteLength = 0;

          if (snippet.trigger instanceof RegExp || (typeof snippet.trigger === 'string' && snippet.options.includes('r'))) {
            let regex = snippet.trigger instanceof RegExp ? snippet.trigger : new RegExp(snippet.trigger);
            if (!regex.source.endsWith('$')) {
              regex = new RegExp(regex.source + '$', regex.flags);
            }
            regMatch = textBefore.match(regex);
            if (regMatch) {
              matched = true;
              deleteLength = regMatch[0].length;
            }
          } else {
            const triggerStr = snippet.trigger as string;
            if (textBefore.endsWith(triggerStr)) {
              let boundaryOk = true;
              if (snippet.options.includes('w')) {
                const charBeforeIdx = textBefore.length - triggerStr.length - 1;
                if (charBeforeIdx >= 0) {
                  boundaryOk = !/\w/.test(textBefore[charBeforeIdx]);
                }
              }
              if (boundaryOk) {
                matched = true;
                deleteLength = triggerStr.length;
              }
            }
          }

          if (matched) {
            candidates.push({ snippet, regMatch, deleteLength });
          }
        }

        if (candidates.length > 0) {
          candidates.sort((a, b) => {
            const pA = a.snippet.priority || 0;
            const pB = b.snippet.priority || 0;
            if (pA !== pB) return pB - pA;
            return b.deleteLength - a.deleteLength;
          });

          const win = candidates[0];
          const replacement = win.snippet.replacement;
          let resolvedText = '';
          if (typeof replacement === 'function') {
            resolvedText = replacement(win.regMatch || ([] as any));
          } else {
            resolvedText = replacement;
          }

          const visualText = state.selection.empty ? "" : state.doc.textBetween(state.selection.from, state.selection.to, '\n');
          const { text: insertedText, tabStops: parsedTabStops } = parseReplacement(resolvedText, win.regMatch, visualText);

          const { tr } = state;
          const fromPos = state.selection.from;
          const toPos = state.selection.to;
          const deleteStart = Math.max(startOfParagraph + 1, fromPos - win.deleteLength);
          
          tr.delete(deleteStart, toPos);
          tr.insertText(insertedText, deleteStart);

          const absTabStops = parsedTabStops.map(stop => ({
            ...stop,
            start: deleteStart + stop.start,
            end: deleteStart + stop.end
          }));

          absTabStops.sort((a, b) => a.index - b.index);

          if (absTabStops.length > 0) {
            const firstStop = absTabStops[0];
            const newSelection = TextSelection.create(tr.doc, firstStop.start, firstStop.end);
            tr.setSelection(newSelection);
            tr.setMeta('latex-snippet-insert', {
              tabStops: absTabStops,
              currentIdx: 0
            });
          } else {
            const endPos = deleteStart + insertedText.length;
            tr.setSelection(TextSelection.create(tr.doc, endPos, endPos));
          }

          tr.setMeta('latex-snippet', true);
          this.editor.view.dispatch(tr);
          return true;
        }

        return false;
      },

      'Shift-Tab': () => {
        const state = this.editor.state;
        const pluginState = snippetPluginKey.getState(state);

        if (pluginState && pluginState.active && pluginState.tabStops.length > 0) {
          const prevIdx = pluginState.currentIdx - 1;
          const { tr } = state;

          if (prevIdx >= 0) {
            const stop = pluginState.tabStops[prevIdx];
            const sel = TextSelection.create(tr.doc, stop.start, stop.end);
            tr.setSelection(sel);
            tr.setMeta('latex-snippet-insert', {
              tabStops: pluginState.tabStops,
              currentIdx: prevIdx
            });
            this.editor.view.dispatch(tr);
            return true;
          }
        }
        return false;
      },

      Escape: () => {
        const state = this.editor.state;
        const pluginState = snippetPluginKey.getState(state);

        if (pluginState && pluginState.active) {
          const { tr } = state;
          tr.setMeta('latex-snippet-clear', true);
          this.editor.view.dispatch(tr);
          return true;
        }
        return false;
      }
    };
  }
});
