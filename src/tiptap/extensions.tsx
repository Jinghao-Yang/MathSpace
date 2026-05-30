import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import { mergeAttributes, Mark, Node, textblockTypeInputRule, markInputRule, InputRule, Extension } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import React, { useState, useEffect } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
// @ts-ignore
import MathfieldComponent from 'react-mathlive';
import { TextSelection } from '@tiptap/pm/state';
// @ts-ignore
import d from 'datascript';
import { getConn, subscribeToDb } from '../db/init';
import { getNextNumber } from '../db/counters';
import { LatexSnippetExtension } from './LatexSnippetExtension';


// Custom React component for editing and rendering mathematics in the editor
const MathBlockComponent = ({ node, updateAttributes }: any) => {
  const [latex, setLatex] = useState(node.attrs.latex || '');
  const [rendered, setRendered] = useState('');

  // Synchronize latex state with the node attribute
  useEffect(() => {
    if (node.attrs.latex !== latex) {
      updateAttributes({ latex });
    }
  }, [latex, updateAttributes, node.attrs.latex]);

  useEffect(() => {
    try {
      const html = katex.renderToString(latex || '\\text{Type LaTeX here (e.g. \\sum_{i=1}^n x_i)}', {
        displayMode: true,
        throwOnError: false,
      });
      setRendered(html);
    } catch (e) {
      setRendered(`<span class="text-red-500 font-sans text-xs">${String(e)}</span>`);
    }
  }, [latex]);

  return (
    <div className="math-block-editor-node my-4 p-4 bg-zinc-950 border border-zinc-800 rounded-xl text-white select-none relative group transition hover:border-zinc-700 shadow-lg">
      <div className="absolute top-2.5 right-3 px-2 py-0.5 text-[9px] uppercase tracking-wider font-semibold text-zinc-500 bg-zinc-900 border border-zinc-800 rounded select-none">
        LaTeX Block (Ctrl+Enter to Save)
      </div>
      <div className="w-full mt-4 font-mono text-zinc-100 text-sm focus:outline-none select-text">
        <textarea
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 focus:border-zinc-600 focus:outline-none text-zinc-100 placeholder-zinc-600 font-mono resize-y text-xs"
          placeholder="E.g. f(x) = \int_{-\infty}^{\infty} e^{-x^2} dx"
          value={latex}
          onChange={(e) => setLatex(e.target.value)}
          onKeyDown={(e) => {
            // Prevent editor shortcuts like Enter/Ctrl+Enter from being consumed by parent if editing math
            if (e.key === 'Enter') {
              e.stopPropagation();
            }
          }}
          rows={Math.max(2, latex.split('\n').length)}
        />
      </div>
      <div 
        className="mt-4 py-5 px-3 bg-zinc-900/50 rounded-lg border border-zinc-800/80 flex justify-center overflow-x-auto text-slate-100 select-all"
        dangerouslySetInnerHTML={{ __html: rendered }}
        contentEditable={false}
      />
    </div>
  );
};

// Define Tiptap Custom Node for Mathematics Block
export const MathBlock = Node.create({
  name: 'mathBlock',
  group: 'block',
  atom: true, // Treat as a single unit inside editor
  draggable: true,

  addAttributes() {
    return {
      latex: {
        default: '',
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="math-block"]',
        getAttrs: (element) => {
          if (typeof element === 'string') return {};
          const rawLatex = element.getAttribute('data-latex') || '';
          try {
            return { latex: decodeURIComponent(rawLatex) };
          } catch {
            return { latex: rawLatex };
          }
        },
      },
      {
        tag: 'pre.math-block',
        getAttrs: (element) => {
          if (typeof element === 'string') return {};
          return {
            latex: element.textContent || '',
          };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'math-block',
        'data-latex': encodeURIComponent(node.attrs.latex || ''),
        class: 'math-block-render py-2 text-center select-all cursor-pointer hover:bg-zinc-800/25 rounded transition',
      }),
      node.attrs.latex || '',
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathBlockComponent);
  },

  addInputRules() {
    return [];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state, node) {
          state.write("$$\n");
          state.write(node.attrs.latex || "");
          state.ensureNewLine();
          state.write("$$");
          state.closeBlock(node);
        },
        parse: {
          setup(markdownit) {
            // Add custom block rule for $$ ... $$ matching
            markdownit.block.ruler.after('blockquote', 'math_block', (state, startLine, endLine, silent) => {
              let nextLine = startLine;
              let pos = state.bMarks[startLine] + state.tShift[startLine];
              let max = state.eMarks[startLine];

              if (pos + 2 > max) return false;
              if (state.src.slice(pos, pos + 2) !== '$$') return false;

              if (silent) return true;

              // Check if single line block math: eg $$ E=mc^2 $$
              const firstLineContent = state.src.slice(pos + 2, max).trim();
              if (firstLineContent.endsWith('$$') && firstLineContent.length >= 2) {
                const latex = firstLineContent.slice(0, -2);
                state.line = startLine + 1;
                const token = state.push('math_block_token', 'div', 0);
                token.block = true;
                token.markup = '$$';
                token.content = latex;
                return true;
              }

              let found = false;
              for (;;) {
                nextLine++;
                if (nextLine >= endLine) break;

                const currentPos = state.bMarks[nextLine] + state.tShift[nextLine];
                const currentMax = state.eMarks[nextLine];

                if (state.src.slice(currentPos, currentMax).trim() === '$$') {
                  found = true;
                  break;
                }
              }

              const latexLines = [];
              for (let l = startLine + 1; l < nextLine; l++) {
                const start = state.bMarks[l] + state.tShift[l];
                const end = state.eMarks[l];
                latexLines.push(state.src.slice(start, end));
              }

              state.line = nextLine + (found ? 1 : 0);
              const token = state.push('math_block_token', 'div', 0);
              token.block = true;
              token.markup = '$$';
              token.content = latexLines.join('\n');
              return true;
            });

            // Register markdown-it renderer for math tokens
            markdownit.renderer.rules.math_block_token = (tokens, idx) => {
              const content = tokens[idx].content || '';
              return `<div data-type="math-block" data-latex="${encodeURIComponent(content)}"></div>`;
            };
          }
        }
      }
    };
  }
});

// React node view component for interactive Mathfield math node
const MathFieldBlockComponent = ({ node, updateAttributes, selected }: any) => {
  const [latex, setLatex] = useState(node.attrs.latex || '');
  const [isEditing, setIsEditing] = useState(selected || !node.attrs.latex);
  const [rendered, setRendered] = useState('');
  const mfRef = React.useRef<any>(null);

  // Synchronize internal state when node attribute changes externally (e.g. undo/redo)
  useEffect(() => {
    if (node.attrs.latex !== latex) {
      setLatex(node.attrs.latex || '');
    }
  }, [node.attrs.latex]);

  // Render static KaTeX when not editing
  useEffect(() => {
    try {
      const html = katex.renderToString(latex || '\\text{Type LaTeX formula here...}', {
        displayMode: true,
        throwOnError: false,
      });
      setRendered(html);
    } catch (e) {
      setRendered(`<span class="text-red-500 font-sans text-xs">${String(e)}</span>`);
    }
  }, [latex]);

  // Sync editing mode with Tiptap selected prop
  useEffect(() => {
    if (selected) {
      setIsEditing(true);
    } else {
      setIsEditing(false);
    }
  }, [selected]);

  const handleInsert = (tex: string) => {
    if (mfRef.current) {
      mfRef.current.insert(tex);
      mfRef.current.focus();
    }
  };

  if (isEditing) {
    return (
      <div 
        className="mathfield-block-editor-container my-4 p-4 bg-zinc-950 border border-zinc-700 rounded-xl text-white select-none relative shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-800 pb-2 mb-3">
          {/* Custom minimal toolbar: only fraction, sqrt, superscript, subscript */}
          <div className="flex items-center gap-1.5" onMouseDown={(e) => e.preventDefault()}>
            <button
              type="button"
              className="px-2.5 py-1 text-xs bg-zinc-900 hover:bg-zinc-855 border border-zinc-800 hover:border-zinc-700 rounded text-zinc-300 font-medium cursor-pointer transition flex items-center gap-1 hover:text-white"
              onClick={() => handleInsert('\\frac{a}{b}')}
              title="Fraction"
            >
              <span className="font-serif font-bold">½</span> <span className="text-[10px] text-zinc-500">Frac</span>
            </button>
            <button
              type="button"
              className="px-2.5 py-1 text-xs bg-zinc-900 hover:bg-zinc-855 border border-zinc-800 hover:border-zinc-700 rounded text-zinc-300 font-medium cursor-pointer transition flex items-center gap-1 hover:text-white"
              onClick={() => handleInsert('\\sqrt{x}')}
              title="Square Root"
            >
              <span className="font-mono font-bold">√x</span> <span className="text-[10px] text-zinc-500">Sqrt</span>
            </button>
            <button
              type="button"
              className="px-2.5 py-1 text-xs bg-zinc-900 hover:bg-zinc-855 border border-zinc-800 hover:border-zinc-700 rounded text-zinc-300 font-medium cursor-pointer transition flex items-center gap-1 hover:text-white"
              onClick={() => handleInsert('^{2}')}
              title="Superscript"
            >
              <span className="font-bold">x²</span> <span className="text-[10px] text-zinc-500">Super</span>
            </button>
            <button
              type="button"
              className="px-2.5 py-1 text-xs bg-zinc-900 hover:bg-zinc-855 border border-zinc-800 hover:border-zinc-700 rounded text-zinc-300 font-medium cursor-pointer transition flex items-center gap-1 hover:text-white"
              onClick={() => handleInsert('_{i}')}
              title="Subscript"
            >
              <span className="font-bold">xᵢ</span> <span className="text-[10px] text-zinc-500">Sub</span>
            </button>
          </div>
          <div className="text-[9px] uppercase tracking-wider font-semibold text-zinc-500 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded select-none">
            Interactive Editor
          </div>
        </div>

        <div className="mathlive-wrapper bg-zinc-900 border border-zinc-800 rounded-lg p-3 focus-within:border-zinc-600 transition">
          {/* @ts-ignore */}
          <MathfieldComponent
            value={latex}
            onChange={(val: string) => {
              setLatex(val);
              updateAttributes({ latex: val });
            }}
            mathfieldRef={(mf: any) => {
              mfRef.current = mf;
            }}
            mathfieldConfig={{
              virtualKeyboardMode: 'off',
              smartFence: false,
            }}
          />
        </div>
        
        <div className="flex justify-end mt-3">
          <button
            type="button"
            className="px-3 py-1 text-xs font-semibold rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white cursor-pointer select-none transition"
            onClick={() => setIsEditing(false)}
          >
            Finish Editing
          </button>
        </div>
      </div>
    );
  }

  // Not editing: render static KaTeX preview
  return (
    <div 
      className="mathfield-block-preview my-4 p-4 bg-zinc-900/10 border border-zinc-800/40 rounded-xl hover:border-teal-500/30 hover:bg-zinc-800/20 active:bg-zinc-800/30 transition shadow-sm cursor-pointer select-none relative group"
      onClick={(e) => {
        e.stopPropagation();
        setIsEditing(true);
      }}
    >
      <div className="absolute top-2.5 right-3 px-1.5 py-0.5 text-[8px] uppercase tracking-wider font-bold text-teal-400 bg-teal-500/10 border border-teal-500/20 rounded select-none opacity-0 group-hover:opacity-100 transition duration-150">
        Click to Edit
      </div>
      <div 
        className="py-6 flex justify-center text-zinc-100 overflow-x-auto"
        dangerouslySetInnerHTML={{ __html: rendered }}
      />
    </div>
  );
};

// Define Tiptap Custom Node for Interactive Mathfield Block
export const MathFieldBlock = Node.create({
  name: 'mathFieldBlock',
  group: 'block',
  atom: true, // Treat as a single unit inside editor
  draggable: true,

  addAttributes() {
    return {
      latex: {
        default: '',
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="math-field-block"]',
        getAttrs: (element) => {
          if (typeof element === 'string') return {};
          const rawLatex = element.getAttribute('data-latex') || '';
          try {
            return { latex: decodeURIComponent(rawLatex) };
          } catch {
            return { latex: rawLatex };
          }
        },
      },
      {
        tag: 'div[data-type="math-block"]',
        getAttrs: (element) => {
          if (typeof element === 'string') return {};
          const rawLatex = element.getAttribute('data-latex') || '';
          try {
            return { latex: decodeURIComponent(rawLatex) };
          } catch {
            return { latex: rawLatex };
          }
        },
      },
      {
        tag: 'pre.math-block',
        getAttrs: (element) => {
          if (typeof element === 'string') return {};
          return {
            latex: element.textContent || '',
          };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'math-field-block',
        'data-latex': encodeURIComponent(node.attrs.latex || ''),
        class: 'math-field-block-render py-2 text-center select-all cursor-pointer hover:bg-zinc-800/25 rounded transition',
      }),
      node.attrs.latex || '',
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathFieldBlockComponent);
  },

  addInputRules() {
    return [
      textblockTypeInputRule({
        find: /^\$\$\s$/,
        type: this.type,
      }),
    ];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state, node) {
          state.write("$$\n");
          state.write(node.attrs.latex || "");
          state.ensureNewLine();
          state.write("$$");
          state.closeBlock(node);
        },
        parse: {
          setup(markdownit) {
            markdownit.block.ruler.after('blockquote', 'math_field_block', (state, startLine, endLine, silent) => {
              let nextLine = startLine;
              let pos = state.bMarks[startLine] + state.tShift[startLine];
              let max = state.eMarks[startLine];

              if (pos + 2 > max) return false;
              if (state.src.slice(pos, pos + 2) !== '$$') return false;

              if (silent) return true;

              // Check if single line block math: eg $$ E=mc^2 $$
              const firstLineContent = state.src.slice(pos + 2, max).trim();
              if (firstLineContent.endsWith('$$') && firstLineContent.length >= 2) {
                const latex = firstLineContent.slice(0, -2);
                state.line = startLine + 1;
                const token = state.push('math_field_block_token', 'div', 0);
                token.block = true;
                token.markup = '$$';
                token.content = latex;
                return true;
              }

              let found = false;
              for (;;) {
                nextLine++;
                if (nextLine >= endLine) break;

                const currentPos = state.bMarks[nextLine] + state.tShift[nextLine];
                const currentMax = state.eMarks[nextLine];

                if (state.src.slice(currentPos, currentMax).trim() === '$$') {
                  found = true;
                  break;
                }
              }

              const latexLines = [];
              for (let l = startLine + 1; l < nextLine; l++) {
                const start = state.bMarks[l] + state.tShift[l];
                const end = state.eMarks[l];
                latexLines.push(state.src.slice(start, end));
              }

              state.line = nextLine + (found ? 1 : 0);
              const token = state.push('math_field_block_token', 'div', 0);
              token.block = true;
              token.markup = '$$';
              token.content = latexLines.join('\n');
              return true;
            });

            markdownit.renderer.rules.math_field_block_token = (tokens, idx) => {
              const content = tokens[idx].content || '';
              return `<div data-type="math-field-block" data-latex="${encodeURIComponent(content)}"></div>`;
            };
          }
        }
      }
    };
  }
});

// Custom Tiptap Mark representing a localized bidirectional link
export const BlockLink = Mark.create({
  name: 'blockLink',

  addAttributes() {
    return {
      blockId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-block-id') || element.getAttribute('href')?.replace('#block-', '') || null,
        renderHTML: (attributes) => {
          if (!attributes.blockId) {
            return {};
          }
          return {
            'data-block-id': attributes.blockId,
            'href': `#block-${attributes.blockId}`,
            'class': 'block-link text-blue-400 hover:text-blue-300 hover:underline transition-all duration-150 font-medium cursor-pointer',
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'a[href^="#block-"]',
      },
      {
        tag: 'a[data-block-id]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['a', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  },
});

// Custom Tiptap Mark representing a hashtag (#tag)
export const HashTag = Mark.create({
  name: 'hashTag',

  addAttributes() {
    return {
      tag: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-tag') || element.textContent?.replace('#', '') || null,
        renderHTML: (attributes) => {
          if (!attributes.tag) {
            return {};
          }
          return {
            'data-tag': attributes.tag,
            'class': 'hashtag bg-teal-500/15 text-teal-300 font-medium px-1.5 py-0.5 rounded border border-teal-500/30 font-mono text-[12px] transition-all duration-150 cursor-pointer hover:bg-teal-500/25',
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-tag]',
      },
      {
        tag: 'span.hashtag',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  },

  addInputRules() {
    return [
      markInputRule({
        find: /(?:^|\s)(#([a-zA-Z][a-zA-Z0-9_-]*))\s$/,
        type: this.type,
        getAttributes: (match) => {
          return {
            tag: match[2],
          };
        },
      }),
    ];
  },
});

// Custom React component for MathEnvironment node
const MathEnvironmentComponent = ({ node, updateAttributes, editor }: any) => {
  const isEditable = editor.isEditable;
  const { envType, title, number, label } = node.attrs;

  const envTypeNames: Record<string, string> = {
    theorem: 'Theorem',
    lemma: 'Lemma',
    proof: 'Proof',
    definition: 'Definition',
    corollary: 'Corollary',
    proposition: 'Proposition',
    remark: 'Remark',
  };

  const typeColors: Record<string, { border: string, bg: string, text: string, headerText: string }> = {
    theorem: { border: 'border-l-blue-500', bg: 'bg-blue-500/5', text: 'text-blue-300', headerText: 'text-blue-400 font-bold' },
    lemma: { border: 'border-l-indigo-500', bg: 'bg-indigo-500/5', text: 'text-indigo-300', headerText: 'text-indigo-400 font-bold' },
    proof: { border: 'border-l-stone-500/50', bg: 'bg-stone-500/5', text: 'text-stone-300', headerText: 'text-stone-400/90 font-medium font-bold' },
    definition: { border: 'border-l-emerald-500', bg: 'bg-emerald-500/5', text: 'text-emerald-300', headerText: 'text-emerald-400 font-bold' },
    corollary: { border: 'border-l-purple-500', bg: 'bg-purple-500/5', text: 'text-purple-300', headerText: 'text-purple-400 font-bold' },
    proposition: { border: 'border-l-cyan-500', bg: 'bg-cyan-500/5', text: 'text-cyan-300', headerText: 'text-cyan-400 font-bold' },
    remark: { border: 'border-l-zinc-500', bg: 'bg-zinc-500/5', text: 'text-zinc-400', headerText: 'text-zinc-400 font-bold' },
  };

  const config = typeColors[envType] || typeColors.theorem;
  const displayName = envTypeNames[envType] || (envType ? envType.charAt(0).toUpperCase() + envType.slice(1) : 'Theorem');

  const isProof = envType === 'proof';
  const numberStr = isProof ? '' : ` ${number || ''}`;
  const titleStr = title ? ` (${title})` : '';
  const suffix = isProof ? '.' : '.';

  return (
    <NodeViewWrapper className={`math-env-node my-4 p-4 rounded-xl border-l-4 ${config.border} ${config.bg} relative group transition-all duration-200 shadow-sm text-left`}>
      {isEditable && (
        <div 
          className="absolute top-2 right-3 flex items-center gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity select-none" 
          contentEditable={false}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <span className="text-[9px] font-mono uppercase tracking-wider font-bold text-zinc-500 bg-zinc-950/40 px-1 rounded">
            {envType}{number ? ` #${number}` : ''}{label ? ` [${label}]` : ''}
          </span>
          <input
            type="text"
            value={title || ''}
            placeholder="Title..."
            onChange={(e) => updateAttributes({ title: e.target.value })}
            className="bg-zinc-950/80 border border-zinc-800 text-[10px] rounded px-1.5 py-0.5 text-zinc-300 focus:outline-none focus:border-zinc-650 max-w-[80px]"
          />
          <input
            type="text"
            value={label || ''}
            placeholder="Label..."
            onChange={(e) => updateAttributes({ label: e.target.value })}
            className="bg-zinc-950/80 border border-zinc-800 text-[10px] rounded px-1.5 py-0.5 text-zinc-300 focus:outline-none focus:border-zinc-650 max-w-[80px]"
          />
        </div>
      )}

      <div className={`font-sans font-bold text-sm mb-2 select-none flex items-center gap-1.5 ${config.headerText}`} contentEditable={false}>
        <span>{displayName}{numberStr}{titleStr}{suffix}</span>
      </div>

      <div className="math-env-content-area outline-none relative text-slate-100 text-sm leading-relaxed">
        <NodeViewContent className="math-env-inner-editor" />
        {isProof && (
          <span className="inline-block hover:scale-115 transition-transform font-serif text-amber-400 font-bold ml-1.5 cursor-help select-none" title="End of Proof" contentEditable={false}>
            ∎
          </span>
        )}
      </div>
    </NodeViewWrapper>
  );
};

// Define Tiptap Custom Node for MathEnvironment block
export const MathEnvironment = Node.create({
  name: 'mathEnvironment',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      envType: {
        default: 'theorem',
      },
      title: {
        default: '',
      },
      number: {
        default: null,
      },
      label: {
        default: '',
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="math-environment"]',
        getAttrs: (element) => {
          if (typeof element === 'string') return {};
          return {
            envType: element.getAttribute('data-env-type') || 'theorem',
            title: element.getAttribute('data-title') || '',
            number: element.getAttribute('data-number') ? parseInt(element.getAttribute('data-number')!, 10) : null,
            label: element.getAttribute('data-label') || '',
          };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'math-environment',
        'data-env-type': node.attrs.envType,
        'data-title': node.attrs.title || '',
        'data-number': node.attrs.number || '',
        'data-label': node.attrs.label || '',
        class: 'math-environment-node py-2 px-3 border-l-2 my-2 rounded',
      }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathEnvironmentComponent);
  },

  addInputRules() {
    return [
      new InputRule({
        find: /\\begin\{(theorem|lemma|proof|definition|corollary|proposition|remark)\}(?:\[(.*?)\])?\s?$/,
        handler: ({ state, range, match }) => {
          const envType = match[1];
          const title = match[2] || '';
          
          let num = null;
          try {
            // Assign interactive number preview atomic on input rule creation if connection exists
            num = getNextNumber(getConn(), envType);
          } catch (_) {}

          const { tr } = state;
          tr.delete(range.from, range.to);

          const envNode = state.schema.nodes.mathEnvironment.create(
            { envType, title, number: num },
            state.schema.nodes.paragraph.create()
          );

          tr.replaceWith(range.from, range.from, envNode);
          
          const resolvedPos = tr.doc.resolve(range.from + 1);
          tr.setSelection(TextSelection.near(resolvedPos));
          
          return tr;
        },
      }),
    ];
  },

  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        const { state, view } = editor;
        const { selection } = state;
        const { $from } = selection;

        let depth = $from.depth;
        let envPos = -1;
        let envNode = null;
        while (depth > 0) {
          const node = $from.node(depth);
          if (node.type.name === 'mathEnvironment') {
            envPos = $from.before(depth);
            envNode = node;
            break;
          }
          depth--;
        }

        if (envNode && envPos !== -1) {
          const textBefore = $from.parent.textContent;
          const envType = envNode.attrs.envType;
          
          const endRegex = new RegExp(`^\\\\end\\{${envType}\\}$`);
          if (endRegex.test(textBefore.trim())) {
            const { tr } = state;
            const startOfParent = $from.before();
            const endOfParent = $from.after();
            
            tr.delete(startOfParent, endOfParent);

            const deletedSize = endOfParent - startOfParent;
            const adjustedSize = envNode.nodeSize - deletedSize;
            const mathEnvEnd = envPos + adjustedSize;

            const emptyPara = state.schema.nodes.paragraph.create();
            tr.insert(mathEnvEnd, emptyPara);
            
            const newSelectionPos = mathEnvEnd + 1;
            tr.setSelection(TextSelection.create(tr.doc, newSelectionPos));

            view.dispatch(tr);
            return true;
          }
        }

        return false;
      }
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(state, node) {
          const { envType, title } = node.attrs;
          const titleStr = title ? `[${title}]` : '';
          state.write(`\\begin{${envType}}${titleStr}\n`);
          state.renderContent(node);
          state.ensureNewLine();
          state.write(`\\end{${envType}}`);
          state.closeBlock(node);
        },
        parse: {
          setup(markdownit) {
            markdownit.block.ruler.after('blockquote', 'math_environment', (state, startLine, endLine, silent) => {
              let nextLine = startLine;
              let pos = state.bMarks[startLine] + state.tShift[startLine];
              let max = state.eMarks[startLine];

              if (pos + 6 > max) return false;
              const text = state.src.slice(pos, max).trim();
              
              const beginRegex = /^\\begin\{(theorem|lemma|proof|definition|corollary|proposition|remark)\}(?:\[(.*?)\])?$/;
              const match = beginRegex.exec(text);
              if (!match) return false;

              if (silent) return true;

              const envType = match[1];
              const title = match[2] || '';

              let found = false;
              const endLabel = `\\end{${envType}}`;

              for (;;) {
                nextLine++;
                if (nextLine >= endLine) break;

                const currentPos = state.bMarks[nextLine] + state.tShift[nextLine];
                const currentMax = state.eMarks[nextLine];
                const currentLineText = state.src.slice(currentPos, currentMax).trim();

                if (currentLineText === endLabel) {
                  found = true;
                  break;
                }
              }

              const contentLines = [];
              for (let l = startLine + 1; l < nextLine; l++) {
                const start = state.bMarks[l] + state.tShift[l];
                const end = state.eMarks[l];
                contentLines.push(state.src.slice(start, end));
              }

              state.line = nextLine + (found ? 1 : 0);
              const token = state.push('math_environment_token', 'div', 0);
              token.block = true;
              token.info = envType;
              token.content = contentLines.join('\n');
              token.meta = { title };
              return true;
            });

            markdownit.renderer.rules.math_environment_token = (tokens, idx) => {
              const token = tokens[idx];
              const envType = token.info;
              const content = token.content || '';
              const title = token.meta?.title || '';
              return `<div data-type="math-environment" data-env-type="${envType}" data-title="${title}">${content}</div>`;
            };
          }
        }
      }
    };
  }
});

// React node view reference lookup custom component
const ReferenceComponent = ({ node }: any) => {
  const refKey = node.attrs.referenceKey;
  const [resolvedText, setResolvedText] = useState(node.attrs.resolvedText || '');
  const [hovered, setHovered] = useState(false);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string>('');

  useEffect(() => {
    let active = true;
    const fetchRef = () => {
      try {
        const conn = getConn();
        const db = d.db(conn);
        // Find by label
        const qResultsLabel = d.q(
          `[:find ?e ?num ?type ?title ?content :where [?e "block/label" "${refKey}"] [?e "block/number" ?num] [?e "block/type" ?type] [?e "block/title" ?title] [?e "block/content" ?content]]`,
          db
        );
        if (qResultsLabel && qResultsLabel.length > 0) {
          const [_, num, type, title, content] = qResultsLabel[0];
          const displayTypes: Record<string, string> = {
            theorem: 'Theorem',
            lemma: 'Lemma',
            proof: 'Proof',
            definition: 'Definition',
            corollary: 'Corollary',
            proposition: 'Proposition',
            remark: 'Remark',
          };
          const labelName = displayTypes[type] || 'Theorem';
          const textValue = `${labelName} ${num}`;
          if (active) {
            setResolvedText(textValue);
            setPreviewTitle(`${labelName} ${num} (${title || 'Untitled'})`);
            setPreviewContent(content);
          }
        } else {
          if (active) {
            setResolvedText(`[??: ${refKey}]`);
            setPreviewTitle(`Reference: ${refKey}`);
            setPreviewContent('Reference target loading or not yet persisted.');
          }
        }
      } catch (e) {
        console.error(e);
      }
    };

    fetchRef();
    const unsubscribe = subscribeToDb(fetchRef);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [refKey]);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const conn = getConn();
      const db = d.db(conn);
      const results = d.q(
        `[:find ?uuid ?x ?y :where [?e "block/label" "${refKey}"] [?e "block/id" ?uuid] [?e "block/x" ?x] [?e "block/y" ?y]]`,
        db
      );
      if (results && results.length > 0) {
        const [uuid, x, y] = results[0];
        const ev = new CustomEvent('navigate-to-block', {
          detail: { blockId: uuid, x, y }
        });
        window.dispatchEvent(ev);
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <span
      className="relative inline-block select-none"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span
        onClick={handleClick}
        className="math-reference inline-block px-1.5 py-0.5 rounded bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 hover:text-blue-300 font-sans font-semibold text-xs transition cursor-pointer border border-blue-500/20 active:scale-95"
      >
        {resolvedText || `[${refKey}]`}
      </span>

      {hovered && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-64 bg-zinc-950 border border-zinc-750 p-3 rounded-lg shadow-xl text-xs text-zinc-100 pointer-events-none text-left backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 block whitespace-normal select-text">
          <span className="block font-bold text-blue-400 border-b border-zinc-800 pb-1.5 mb-1.5 tracking-tight">
            {previewTitle}
          </span>
          <span className="block text-zinc-400 font-mono text-[10px] line-clamp-3 leading-normal">
            {previewContent || 'Empty environment content'}
          </span>
        </span>
      )}
    </span>
  );
};

// Define Tiptap Custom Inline Node for Reference
export const ReferenceNode = Node.create({
  name: 'referenceNode',
  group: 'inline',
  inline: true,
  selectable: true,
  draggable: true,
  atom: true,

  addAttributes() {
    return {
      referenceKey: {
        default: '',
      },
      resolvedText: {
        default: '',
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="reference"]',
        getAttrs: (element) => {
          if (typeof element === 'string') return {};
          return {
            referenceKey: element.getAttribute('data-ref-key') || '',
            resolvedText: element.getAttribute('data-resolved-text') || '',
          };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'reference',
        'data-ref-key': node.attrs.referenceKey,
        'data-resolved-text': node.attrs.resolvedText || '',
        class: 'math-reference inline-block px-1.5 py-0.5 rounded bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 font-sans font-medium text-xs cursor-pointer transition',
      }),
      node.attrs.resolvedText || `[Ref: ${node.attrs.referenceKey}]`,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ReferenceComponent);
  },

  addInputRules() {
    return [
      new InputRule({
        find: /\\ref\{([a-zA-Z0-9_-]+)\}\s?$/,
        handler: ({ state, range, match }) => {
          const { tr } = state;
          const refKey = match[1];
          const node = state.schema.nodes.referenceNode.create({
            referenceKey: refKey,
            resolvedText: `[Ref: ${refKey}]`,
          });
          tr.replaceWith(range.from, range.to, node);
          return tr;
        },
      }),
    ];
  },
});

// Helper function to turn standard text formulas with delimiters to rendered KaTeX HTML
export function renderLatexInHtml(html: string): string {
  if (!html) return '';

  let processed = html;

  // Process reference nodes e.g. <span data-type="reference" data-ref-key="refId" ...>...</span>
  processed = processed.replace(/<span[^>]*data-type="reference"[^>]*data-ref-key="([^"]*)"[^>]*data-resolved-text="([^"]*)"[^>]*>([\s\S]*?)<\/span>/g, (match, refKey, resolvedText, defaultText) => {
    const fallbackText = resolvedText || defaultText || `[Ref: ${refKey}]`;
    return `<span class="math-reference inline-block px-1.5 py-0.5 rounded bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 text-xs font-semibold select-all cursor-pointer transition" data-type="reference" data-ref-key="${refKey}">${fallbackText}</span>`;
  });

  // Process custom math block div blocks first
  processed = processed.replace(/<div[^>]*data-type="(math-block|math-field-block)"[^>]*data-latex="([^"]*)"[^>]*>([\s\S]*?)<\/div>/g, (match, type, latexAttr) => {
    const rawLatex = decodeURIComponent(latexAttr) || '';
    try {
      return `<div class="katex-display-container my-4 text-center overflow-x-auto select-none">${katex.renderToString(rawLatex, {
        displayMode: true,
        throwOnError: false,
      })}</div>`;
    } catch (e) {
      return `<div class="text-red-500 font-sans text-xs my-2 text-center border border-red-200 bg-red-50 p-2 rounded">${String(e)}</div>`;
    }
  });

  // Process math environment blocks statically (for reader/static modes)
  processed = processed.replace(/<div[^>]*data-type="math-environment"[^>]*data-env-type="([^"]*)"(?:[^>]*data-title="([^"]*)")?(?:[^>]*data-number="([^"]*)")?(?:[^>]*data-label="([^"]*)")?[^>]*>([\s\S]*?)<\/div>/g, (match, envType, title, number, label, content) => {
    const envTypeNames: Record<string, string> = {
      theorem: 'Theorem',
      lemma: 'Lemma',
      proof: 'Proof',
      definition: 'Definition',
      corollary: 'Corollary',
      proposition: 'Proposition',
      remark: 'Remark',
    };
    const typeColors: Record<string, { border: string, bg: string, text: string, headerText: string }> = {
      theorem: { border: 'border-l-blue-500', bg: 'bg-blue-500/5', text: 'text-blue-300', headerText: 'text-blue-400' },
      lemma: { border: 'border-l-indigo-500', bg: 'bg-indigo-500/5', text: 'text-indigo-300', headerText: 'text-indigo-400' },
      proof: { border: 'border-l-stone-500/50', bg: 'bg-stone-500/5', text: 'text-stone-300', headerText: 'text-stone-400 font-medium' },
      definition: { border: 'border-l-emerald-500', bg: 'bg-emerald-500/5', text: 'text-emerald-300', headerText: 'text-emerald-400' },
      corollary: { border: 'border-l-purple-500', bg: 'bg-purple-500/5', text: 'text-purple-300', headerText: 'text-purple-400' },
      proposition: { border: 'border-l-cyan-500', bg: 'bg-cyan-500/5', text: 'text-cyan-300', headerText: 'text-cyan-400' },
      remark: { border: 'border-l-zinc-500', bg: 'bg-zinc-500/5', text: 'text-zinc-400', headerText: 'text-zinc-400' },
    };

    const config = typeColors[envType] || typeColors.theorem;
    const name = envTypeNames[envType] || (envType ? envType.charAt(0).toUpperCase() + envType.slice(1) : 'Theorem');
    const isProof = envType === 'proof';
    const numberStr = isProof ? '' : ` ${number || ''}`;
    const titleStr = title ? ` (${title})` : '';
    const tombstone = isProof ? '<span class="text-amber-400 font-serif font-bold ml-1.5 select-none inline-block">∎</span>' : '';

    return `<div class="math-env-static my-4 p-4 rounded-xl border-l-4 ${config.border} ${config.bg} relative text-left">
      <div class="font-sans font-bold text-sm mb-2 select-none ${config.headerText}">
        ${name}${numberStr}${titleStr}.
      </div>
      <div class="text-slate-100 text-sm leading-relaxed">
        ${content}${tombstone}
      </div>
    </div>`;
  });

  // Process standard block blocks $$...$$
  processed = processed.replace(/\$\$\s*([\s\S]+?)\s*\$\$/g, (match, tex) => {
    try {
      return `<div class="katex-display-container my-4 text-center overflow-x-auto select-none">${katex.renderToString(tex, {
        displayMode: true,
        throwOnError: false,
      })}</div>`;
    } catch (e) {
      return `<div class="text-red-500 font-sans text-xs my-2 text-center border border-red-200 bg-red-50 p-2 rounded">${String(e)}</div>`;
    }
  });

  // Process inline math $...$ Next
  processed = processed.replace(/\$([^\$\n]+?)\$/g, (match, tex) => {
    try {
      return `<span class="katex-inline-container inline-block select-none mx-0.5">${katex.renderToString(tex, {
        displayMode: false,
        throwOnError: false,
      })}</span>`;
    } catch (e) {
      return `<span class="text-red-500 font-sans text-[11px] px-1 bg-red-50 rounded">${String(e)}</span>`;
    }
  });

  // Highlight raw hashtags in statically rendered text (avoiding block links and color codes)
  processed = processed.replace(/(^|\s)#([a-zA-Z][a-zA-Z0-9_-]*)(?=\s|$|[.,!?;:<>"'])/g, (match, space, tag) => {
    if (tag.startsWith('block-')) return match;
    return `${space}<span class="hashtag bg-teal-500/15 text-teal-300 font-semibold px-1.5 py-0.5 rounded border border-teal-500/25 font-mono text-[11px] select-all cursor-pointer transition hover:bg-teal-500/25 inline-block" data-tag="${tag}">#${tag}</span>`;
  });

  return processed;
}

export const BlockIdExtension = Extension.create({
  name: 'blockIdExtension',
  addGlobalAttributes() {
    return [
      {
        types: [
          'paragraph',
          'heading',
          'mathBlock',
          'mathFieldBlock',
          'mathEnvironment',
          'bulletList',
          'orderedList',
          'blockquote',
          'codeBlock',
        ],
        attributes: {
          blockId: {
            default: null,
            parseHTML: (element) => element.getAttribute('data-block-id'),
            renderHTML: (attributes) => {
              if (!attributes.blockId) return {};
              return { 'data-block-id': attributes.blockId };
            },
          },
        },
      },
    ];
  },
});

// Full array of math configured rich extensions
export const extensions = [
  StarterKit.configure({
    codeBlock: false, // Override codeblock or adjust
  }),
  Markdown.configure({
    html: true,
    linkify: true,
  }),
  MathBlock,
  LatexSnippetExtension,
  MathFieldBlock,
  MathEnvironment,
  ReferenceNode,
  BlockLink,
  HashTag,
  BlockIdExtension,
];
