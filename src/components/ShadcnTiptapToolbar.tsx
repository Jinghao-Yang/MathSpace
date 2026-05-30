import React, { useState } from 'react';
import { Editor } from '@tiptap/react';
import { 
  Bold, 
  Italic, 
  Strikethrough, 
  Code, 
  List, 
  ListOrdered, 
  Quote, 
  Undo2, 
  Redo2, 
  Sigma, 
  FileCode,
  Sparkles,
  Link,
  ChevronDown,
  Calculator,
  Brackets,
  BookOpen,
  Info,
  Flame,
  HelpCircle
} from 'lucide-react';

interface ShadcnTiptapToolbarProps {
  editor: Editor | null;
}

export const ShadcnTiptapToolbar: React.FC<ShadcnTiptapToolbarProps> = ({ editor }) => {
  const [showEnvDropdown, setShowEnvDropdown] = useState(false);
  const [showMathDropdown, setShowMathDropdown] = useState(false);

  if (!editor) return null;

  const handleInsertMathBlock = () => {
    editor
      .chain()
      .focus()
      .insertContent({
        type: 'mathFieldBlock',
        attrs: { latex: 'f(x) = \\int_{-\\infty}^{\\infty} e^{-x^2} dx' },
      })
      .run();
    setShowMathDropdown(false);
  };

  const handleInsertInlineMath = () => {
    editor
      .chain()
      .focus()
      .insertContent('$E = mc^2$')
      .run();
    setShowMathDropdown(false);
  };

  const insertMathEnvironment = (envType: string) => {
    editor
      .chain()
      .focus()
      .insertContent({
        type: 'mathEnvironment',
        attrs: { 
          envType, 
          title: '', 
          number: null, 
          label: '' 
        },
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Enter continuous proof, math statements, or content here...' }] }]
      })
      .run();
    setShowEnvDropdown(false);
  };

  const insertReferenceTrigger = () => {
    editor.chain().focus().insertContent('\\ref{my_label}').run();
  };

  const insertBidirectionalLinkTrigger = () => {
    editor.chain().focus().insertContent('[[').run();
  };

  const activeBtnClass = "bg-blue-500/15 text-blue-400 border border-blue-500/30 rounded-lg p-1.5 transition text-xs font-semibold focus:outline-none";
  const inactiveBtnClass = "hover:bg-zinc-800 text-zinc-400 hover:text-white border border-transparent rounded-lg p-1.5 transition text-xs font-semibold focus:outline-none";

  const environments = [
    { type: 'theorem', name: 'Theorem', color: 'text-blue-400 border-l-blue-500', desc: 'Auto-numbered formal mathematical results' },
    { type: 'lemma', name: 'Lemma', color: 'text-indigo-400 border-l-indigo-500', desc: 'Auxiliary supporting proposition' },
    { type: 'proof', name: 'Proof', color: 'text-stone-400 border-l-stone-500', desc: 'Logical verification ending with tombstone ∎' },
    { type: 'definition', name: 'Definition', color: 'text-emerald-400 border-l-emerald-500', desc: 'Precise formulation of a new term' },
    { type: 'corollary', name: 'Corollary', color: 'text-purple-400 border-l-purple-500', desc: 'Direct consequence of a theorem' },
    { type: 'proposition', name: 'Proposition', color: 'text-cyan-400 border-l-cyan-500', desc: 'Intermediate result of minor significance' },
    { type: 'remark', name: 'Remark', color: 'text-zinc-400 border-l-zinc-500', desc: 'Informal or cautionary annotation' },
  ];

  return (
    <div className="bg-zinc-950/90 hover:bg-zinc-950 border-b border-zinc-800/80 px-3 py-2 flex flex-wrap gap-1.5 items-center relative z-20 rounded-t-xl shrink-0 select-none">
      
      {/* Undo/Redo Group */}
      <div className="flex items-center gap-0.5 border-r border-zinc-800/60 pr-1.5">
        <button
          type="button"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          className="hover:bg-zinc-800 disabled:opacity-40 text-zinc-400 hover:text-white rounded p-1 transition cursor-pointer"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          className="hover:bg-zinc-800 disabled:opacity-40 text-zinc-400 hover:text-white rounded p-1 transition cursor-pointer"
          title="Redo (Ctrl+Shift+Z)"
        >
          <Redo2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Basic Font formatting */}
      <div className="flex items-center gap-0.5 border-r border-zinc-800/60 pr-1.5">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={editor.isActive('bold') ? activeBtnClass : inactiveBtnClass}
          title="Bold (Ctrl+B)"
        >
          <Bold className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={editor.isActive('italic') ? activeBtnClass : inactiveBtnClass}
          title="Italic (Ctrl+I)"
        >
          <Italic className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={editor.isActive('strike') ? activeBtnClass : inactiveBtnClass}
          title="Strikethrough"
        >
          <Strikethrough className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleCode().run()}
          className={editor.isActive('code') ? activeBtnClass : inactiveBtnClass}
          title="Monospace Monospaced Code"
        >
          <Code className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Node / Block environments Lists */}
      <div className="flex items-center gap-0.5 border-r border-zinc-800/60 pr-1.5">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={editor.isActive('bulletList') ? activeBtnClass : inactiveBtnClass}
          title="Bullet List"
        >
          <List className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={editor.isActive('orderedList') ? activeBtnClass : inactiveBtnClass}
          title="Ordered List"
        >
          <ListOrdered className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={editor.isActive('blockquote') ? activeBtnClass : inactiveBtnClass}
          title="Blockquote"
        >
          <Quote className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Interactive Mathematics inserts */}
      <div className="flex items-center gap-1.5 border-r border-zinc-800/60 pr-1.5 relative">
        <button
          type="button"
          onClick={() => setShowMathDropdown(!showMathDropdown)}
          className={`flex items-center gap-1.5 py-1 px-2 border rounded-lg text-xs font-bold transition select-none ${
            showMathDropdown 
              ? 'bg-emerald-500/15 border-emerald-500/45 text-emerald-400' 
              : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700 text-teal-300 hover:text-teal-200'
          }`}
          title="Insert Math equations"
        >
          <Sigma className="w-3.5 h-3.5 text-teal-400" />
          <span>Insert Math</span>
          <ChevronDown className="w-2.5 h-2.5 opacity-60" />
        </button>

        {showMathDropdown && (
          <>
            <div 
              className="fixed inset-0 z-30" 
              onClick={() => setShowMathDropdown(false)} 
            />
            <div className="absolute top-full left-0 mt-1.5 w-60 bg-zinc-950 border border-[#2d2d31] rounded-xl shadow-2xl p-1 z-40 text-left animate-in fade-in zoom-in-95 duration-100">
              <div className="px-3 py-1.5 font-bold text-[9px] uppercase tracking-wider text-zinc-500 border-b border-zinc-900 mb-1 select-none">
                Equation Styles
              </div>
              <button
                type="button"
                onClick={handleInsertMathBlock}
                className="w-full text-left px-3 py-2 hover:bg-zinc-900 text-slate-200 text-xs rounded-lg transition-colors flex items-center justify-between group"
              >
                <div className="flex items-center gap-2">
                  <Calculator className="w-3.5 h-3.5 text-teal-400" />
                  <div>
                    <div className="font-semibold text-slate-100">Interactive Math Block</div>
                    <div className="text-[10px] text-zinc-500">Live Mathfield input view ($$)</div>
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={handleInsertInlineMath}
                className="w-full text-left px-3 py-2 hover:bg-zinc-900 text-slate-200 text-xs rounded-lg transition-colors flex items-center justify-between group"
              >
                <div className="flex items-center gap-2">
                  <Sigma className="w-3.5 h-3.5 text-blue-400" />
                  <div>
                    <div className="font-semibold text-slate-100">Inline Formula</div>
                    <div className="text-[10px] text-zinc-500">Static inline statement ($..$)</div>
                  </div>
                </div>
              </button>
            </div>
          </>
        )}
      </div>

      {/* Theorem Environments inserts selector and markup */}
      <div className="flex items-center gap-1.5 border-r border-zinc-800/60 pr-1.5 relative">
        <button
          type="button"
          onClick={() => setShowEnvDropdown(!showEnvDropdown)}
          className={`flex items-center gap-1.5 py-1 px-2 border rounded-lg text-xs font-bold transition select-none ${
            showEnvDropdown 
              ? 'bg-blue-500/15 border-blue-500/45 text-blue-400' 
              : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700 text-blue-400 hover:text-blue-300'
          }`}
          title="LaTeX Theorem Environments"
        >
          <Sparkles className="w-3.5 h-3.5 text-blue-400" />
          <span>Environments</span>
          <ChevronDown className="w-2.5 h-2.5 opacity-60" />
        </button>

        {showEnvDropdown && (
          <>
            <div 
              className="fixed inset-0 z-30" 
              onClick={() => setShowEnvDropdown(false)} 
            />
            <div className="absolute top-full left-0 mt-1.5 w-72 bg-[#0d0d0f] border border-[#2d2d31] rounded-xl shadow-2xl p-1 z-40 text-left overflow-y-auto max-h-80 animate-in fade-in zoom-in-95 duration-100">
              <div className="px-3 py-1.5 font-bold text-[9px] uppercase tracking-wider text-zinc-500 border-b border-zinc-900 mb-1 select-none">
                LaTeX Theorem Environments
              </div>
              {environments.map((env) => (
                <button
                  type="button"
                  key={env.type}
                  onClick={() => insertMathEnvironment(env.type)}
                  className="w-full text-left px-3 py-1.5 hover:bg-zinc-900/80 text-xs rounded-lg transition-colors border-l-4 border-transparent hover:border-l-indigo-500 flex flex-col justify-start mb-0.5 group"
                >
                  <span className={`font-semibold ${env.color} flex items-center gap-1`}>
                    {env.name}
                  </span>
                  <span className="text-[9.5px] text-zinc-500 mt-0.5 font-normal leading-normal">
                    {env.desc}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Fast Reference Autocomplete Helpers */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={insertReferenceTrigger}
          className="bg-zinc-900 text-slate-300 border border-zinc-805 hover:border-zinc-700 rounded-lg py-1 px-2.5 text-xs font-bold hover:text-white transition flex items-center gap-1"
          title="Insert \ref{key} link helper"
        >
          <Brackets className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
          <span>{"\\ref{..}"}</span>
        </button>
        <button
          type="button"
          onClick={insertBidirectionalLinkTrigger}
          className="bg-zinc-900 text-slate-300 border border-zinc-805 hover:border-zinc-700 rounded-lg py-1 px-2.5 text-xs font-bold hover:text-white transition flex items-center gap-1"
          title="Insert [[ bidirectional page link"
        >
          <Link className="w-3.5 h-3.5 text-indigo-400" />
          <span>[[Link]]</span>
        </button>
      </div>

    </div>
  );
};
