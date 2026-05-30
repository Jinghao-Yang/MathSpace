import React, { useState, useEffect, useRef, useMemo } from 'react';
// @ts-ignore
import d from 'datascript';
import { useEditor, EditorContent } from '@tiptap/react';
import { extensions, renderLatexInHtml } from '../tiptap/extensions';
import { getConn, subscribeToDb } from '../db/init';
import { extractAndSetLabels } from '../utils/editor';
import { ShadcnTiptapToolbar } from '../components/ShadcnTiptapToolbar';

interface CustomBlockShapeProps {
  blockId: string;
  isEditing: boolean;
  setEditingBlockId: (id: string | null) => void;
  editorRefInstance?: any; // To allow jumping to shapes
}

export const CustomBlockShape: React.FC<CustomBlockShapeProps> = ({
  blockId,
  isEditing,
  setEditingBlockId,
  editorRefInstance,
}) => {
  const [db, setDb] = useState<any>(null);
  const [isHovered, setIsHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-complete status for [[ links
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteMode, setAutocompleteMode] = useState<'link' | 'ref' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [autocompleteIndex, setAutocompleteIndex] = useState(0);
  const [autocompleteCoords, setAutocompleteCoords] = useState<{ top: number; left: number } | null>(null);

  // Reset suggestions list selection index when query changes
  useEffect(() => {
    setAutocompleteIndex(0);
  }, [searchQuery]);

  // Subscribe to DataScript changes
  useEffect(() => {
    try {
      const conn = getConn();
      setDb(d.db(conn));
      const unsubscribe = subscribeToDb((newDb: any) => {
        setDb(newDb);
      });
      return unsubscribe;
    } catch (e) {
      console.error(e);
    }
  }, []);

  // Fetch this specific block entity
  const blockEntity = useMemo(() => {
    if (!db) return null;
    try {
      const result = d.q(
        `[:find ?e :where [?e "block/id" "${blockId}"]]`,
        db
      );
      if (result.length === 0) return null;
      const eid = result[0][0];
      return d.pull(db, '[*]', eid);
    } catch (err) {
      console.error('Failed to pull entity for blockId', blockId, err);
      return null;
    }
  }, [db, blockId]);

  const blockContent = blockEntity?.['block/content'] || '';
  const blockType = blockEntity?.['block/type'] || 'general';

  // Floating tooltip preview for [[ links
  const [hoveredLinkBlock, setHoveredLinkBlock] = useState<{
    id: string;
    title: string;
    content: string;
    x: number;
    y: number;
  } | null>(null);

  // Setup rich text Tiptap editor
  const editor = useEditor({
    extensions,
    content: blockContent,
    editable: isEditing,
    onUpdate({ editor }) {
      const html = editor.getHTML();
      // Parse markdown representation
      const markdown = (editor.storage as any).markdown?.getMarkdown() || html;

      // Extract title as the first sentence/line of the text
      const plainText = editor.getText().trim();
      const firstLine = plainText.split('\n')[0] || '';
      const blockTitle = firstLine.substring(0, 50) || 'Untitled Block';

      // 1. Check for quick semantic type change commands (/thm, /proof, /remark, etc.) at the start of paragraphs
      const slashMatches = [
        { cmd: '/thm', type: 'theorem' },
        { cmd: '/lemma', type: 'lemma' },
        { cmd: '/proof', type: 'proof' },
        { cmd: '/definition', type: 'definition' },
        { cmd: '/corollary', type: 'corollary' },
        { cmd: '/proposition', type: 'proposition' },
        { cmd: '/remark', type: 'remark' },
        { cmd: '/general', type: 'general' }
      ];

      for (const item of slashMatches) {
        if (plainText.startsWith(`${item.cmd} `) || plainText === item.cmd) {
          const cleanedText = plainText.replace(new RegExp(`^\\${item.cmd}\\s*`), '');
          editor.commands.setContent(cleanedText);
          try {
            d.transact(getConn(), [
              {
                'block/id': blockId,
                'block/type': item.type,
              },
            ]);
          } catch (txErr) {
            console.error(txErr);
          }
          return;
        }
      }

      // Check and update in-editor math environment label
      const extractedLabel = extractAndSetLabels(editor);

      // Find non-empty label on mathEnvironment node or get from extraction
      let labelKey: string | null = extractedLabel;
      if (!labelKey) {
        editor.state.doc.descendants((node: any) => {
          if (node.type.name === 'mathEnvironment' && node.attrs.label) {
            labelKey = node.attrs.label;
          }
        });
      }

      // 2. Scan content for bidirectional links (double brackets) autocomplete trigger [[ OR referencing mechanism trigger \ref{
      const selection = editor.state.selection;
      const cursorPosition = selection.from;
      const { $from } = selection;
      
      // Extract text safely around cursor position using ProseMirror's state
      let textBeforeCursor = '';
      try {
        const startOfParagraph = $from.start();
        textBeforeCursor = editor.state.doc.textBetween(
          startOfParagraph,
          cursorPosition,
          ' '
        );
      } catch (pmErr) {
        textBeforeCursor = plainText.substring(0, cursorPosition);
      }
      
      let triggerMode: 'link' | 'ref' | null = null;
      let triggerIndex = -1;
      let triggerQuery = '';

      const lastDoubleBracket = textBeforeCursor.lastIndexOf('[[');
      const lastRefTrigger = textBeforeCursor.lastIndexOf('\\ref{');

      if (lastDoubleBracket !== -1 && (lastRefTrigger === -1 || lastDoubleBracket > lastRefTrigger)) {
        const afterBracket = textBeforeCursor.substring(lastDoubleBracket + 2);
        if (!afterBracket.includes(']]') && !afterBracket.includes('[')) {
          triggerMode = 'link';
          triggerIndex = lastDoubleBracket;
          triggerQuery = afterBracket;
        }
      } else if (lastRefTrigger !== -1) {
        const afterRef = textBeforeCursor.substring(lastRefTrigger + 5);
        if (!afterRef.includes('}') && !afterRef.includes('{')) {
          triggerMode = 'ref';
          triggerIndex = lastRefTrigger;
          triggerQuery = afterRef;
        }
      }

      if (triggerMode) {
        setSearchQuery(triggerQuery);
        setAutocompleteMode(triggerMode);
        setShowAutocomplete(true);

        try {
          const coords = editor.view.coordsAtPos(cursorPosition);
          const containerRect = containerRef.current?.getBoundingClientRect();
          if (containerRect) {
            setAutocompleteCoords({
              top: coords.bottom - containerRect.top + 6,
              left: coords.left - containerRect.left,
            });
          }
        } catch (coordErr) {
          console.warn(coordErr);
        }
      } else {
        setShowAutocomplete(false);
        setAutocompleteMode(null);
      }

      // Save content synchronously back to local DataScript
      try {
        // Extract references to target block ids
        const matches = Array.from(markdown.matchAll(/#block-([a-zA-Z0-9-]+)/g));
        const referencedBlockIds = matches.map((m) => m[1]);

        // Extract hashtag references e.g. #algebra
        const tagMatches = Array.from(markdown.matchAll(/(?:^|\s)#([a-zA-Z][a-zA-Z0-9_-]*)/g));
        // Deduplicate and lower-case tags for standard matching
        const currentTags = Array.from(new Set(tagMatches.map((m) => m[1].toLowerCase()).filter(t => !t.startsWith('block-'))));

        const currentDb = d.db(getConn());
        
        // Fetch old tags for this block to retract
        const existingTagsResults = d.q(
          `[:find ?tag :where [?e "block/id" "${blockId}"] [?e "block/tag" ?tag]]`,
          currentDb
        );
        const oldTags = existingTagsResults.map((v: any) => v[0]);

        // Issue retract transactions for tags that are database stale
        const retractTxs = oldTags.map((t: string) => [
          ':db/retract',
          ['block/id', blockId],
          'block/tag',
          t
        ]);

        // Handle old label retraction
        const existingLabelResults = d.q(
          `[:find ?lbl :where [?e "block/id" "${blockId}"] [?e "block/label" ?lbl]]`,
          currentDb
        );
        const oldLabel = existingLabelResults.length > 0 ? existingLabelResults[0][0] : null;

        if (oldLabel && oldLabel !== labelKey) {
          retractTxs.push([
            ':db/retract',
            ['block/id', blockId],
            'block/label',
            oldLabel
          ]);
        }

        // Accumulate link, label, and tag datoms
        const txs: any[] = [
          {
            'block/id': blockId,
            'block/content': markdown,
            'block/title': blockTitle,
          },
        ];

        // Store block label on entity if present
        if (labelKey) {
          txs.push({
            'block/id': blockId,
            'block/label': labelKey,
          });
        }

        // Perform tag datom additions
        currentTags.forEach((tag) => {
          txs.push({
            'block/id': blockId,
            'block/tag': tag,
          });
        });

        // Retract old tags/labels first to avoid growing set pollution
        if (retractTxs.length > 0) {
          d.transact(getConn(), retractTxs);
        }

        // Perform transactional update for bidirectional reference relationships
        if (referencedBlockIds.length > 0) {
          referencedBlockIds.forEach((targetUuid) => {
            // Setup direct references using lookup refs in datascript
            txs.push({
              'block/id': blockId,
              'link/from': ['block/id', targetUuid],
            });
            txs.push({
              'block/id': targetUuid,
              'link/to': ['block/id', blockId],
            });
          });
        }

        d.transact(getConn(), txs);
      } catch (err) {
        console.error('Failed to auto-save content transaction', err);
      }
    },
  }, [blockId]);


  // Handle external edit-toggle adjustments
  useEffect(() => {
    if (editor) {
      editor.setEditable(isEditing);
      if (isEditing) {
        editor.commands.focus('end');
      }
    }
  }, [isEditing, editor]);

  // Synchronize initial content
  useEffect(() => {
    if (editor && blockContent && editor.getHTML() === '<p></p>') {
      editor.commands.setContent(blockContent);
    }
  }, [editor, blockContent]);

  // Commit text modifications
  const handleCommit = () => {
    setEditingBlockId(null);
  };

  // Query all other blocks for autocomplete bidirectional link or ref suggestions
  const autocompleteSuggestions = useMemo(() => {
    if (!db || !showAutocomplete) return [];
    try {
      const q = searchQuery.toLowerCase();
      if (autocompleteMode === 'ref') {
        const results = d.q(
          `[:find ?uuid ?lbl ?num ?type ?title :where [?e "block/id" ?uuid] [?e "block/label" ?lbl] [?e "block/number" ?num] [?e "block/type" ?type] [?e "block/title" ?title]]`,
          db
        );
        return results
          .map(([uuid, lbl, num, type, title]: any) => ({
            id: uuid,
            label: lbl,
            number: num,
            type,
            title,
          }))
          .filter((item: any) => item.label.toLowerCase().includes(q) || item.title.toLowerCase().includes(q))
          .slice(0, 5);
      } else {
        const results = d.q(`[:find ?id ?title :where [?e "block/id" ?id] [?e "block/title" ?title]]`, db);
        return results
          .map(([id, title]: any) => ({ id, title }))
          .filter((item: any) => item.id !== blockId && item.title.toLowerCase().includes(q))
          .slice(0, 5);
      }
    } catch (e) {
      console.error(e);
      return [];
    }
  }, [db, showAutocomplete, autocompleteMode, searchQuery, blockId]);

  // Autocomplete option selection helper
  const handleSelectAutocomplete = (selected: any) => {
    if (!editor) return;
    const { from, $from } = editor.state.selection;

    let textBeforeCursor = '';
    let startOfParagraph = 0;
    try {
      startOfParagraph = $from.start();
      textBeforeCursor = editor.state.doc.textBetween(
        startOfParagraph,
        from,
        ' '
      );
    } catch (_) {
      const plainText = editor.getText();
      textBeforeCursor = plainText.substring(0, from);
    }

    if (autocompleteMode === 'ref') {
      const lastRefTrigger = textBeforeCursor.lastIndexOf('\\ref{');
      if (lastRefTrigger !== -1) {
        const absStartPos = startOfParagraph + lastRefTrigger;
        editor.commands.deleteRange({ from: absStartPos, to: from });
        editor.commands.insertContent([
          {
            type: 'referenceNode',
            attrs: {
              referenceKey: selected.label,
              resolvedText: `${selected.type.charAt(0).toUpperCase() + selected.type.slice(1)} ${selected.number}`,
            },
          },
          {
            type: 'text',
            text: ' ',
          },
        ]);
      }
      setShowAutocomplete(false);
      setAutocompleteMode(null);
      return;
    }

    // Find the exact trigger position before the cursor using the same reverse match
    const lastDoubleBracket = textBeforeCursor.lastIndexOf('[[');
    let bracketMatch = null;
    if (lastDoubleBracket !== -1) {
      const afterBracket = textBeforeCursor.substring(lastDoubleBracket + 2);
      if (!afterBracket.includes(']]') && !afterBracket.includes('[')) {
        bracketMatch = {
          index: lastDoubleBracket,
          query: afterBracket
        };
      }
    }

    if (bracketMatch) {
      const matchIndex = bracketMatch.index;
      const absStartPos = startOfParagraph + matchIndex;

      // Replace everything from double brackets query trigger to the cursor position
      editor.commands.deleteRange({ from: absStartPos, to: from });

      // Insert link with the custom blockLink mark
      editor.commands.insertContent([
        {
          type: 'text',
          text: selected.title,
          marks: [
            {
              type: 'blockLink',
              attrs: {
                blockId: selected.id,
              },
            },
          ],
        },
        {
          type: 'text',
          text: ' ',
        },
      ]);
    }
    setShowAutocomplete(false);
  };

  // Keyboard and outside triggers configurations
  useEffect(() => {
    if (!editor) return;

    // Capture shortcuts in editor and register suggestions popup navigation
    const onKeyDown = (e: KeyboardEvent) => {
      if (showAutocomplete && autocompleteSuggestions.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          e.stopPropagation();
          setAutocompleteIndex((prev) => (prev + 1) % autocompleteSuggestions.length);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          e.stopPropagation();
          setAutocompleteIndex((prev) => (prev - 1 + autocompleteSuggestions.length) % autocompleteSuggestions.length);
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          const selected = autocompleteSuggestions[autocompleteIndex];
          if (selected) {
            handleSelectAutocomplete(selected);
          }
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          setShowAutocomplete(false);
          return;
        }
      }

      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        e.stopPropagation();
        handleCommit();
      }
    };
    
    // Register event hooks inside editor container using capture phase to override default Editor handling
    const editorDom = containerRef.current;
    if (editorDom) {
      editorDom.addEventListener('keydown', onKeyDown, true);
    }
    return () => {
      if (editorDom) {
        editorDom.removeEventListener('keydown', onKeyDown, true);
      }
    };
  }, [editor, showAutocomplete, autocompleteSuggestions, autocompleteIndex]);

  // Compile LaTeX formulas asynchronously to avoid CPU freezing
  const formattedHtml = useMemo(() => {
    if (isEditing) return '';
    return renderLatexInHtml(editor?.getHTML() || `<p>${blockContent}</p>`);
  }, [isEditing, editor, blockContent]);

  // Direct canvas alignment clicks and popup tooling
  const handleStaticClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const anchor = target.closest('a');
    if (anchor && anchor.getAttribute('href')?.startsWith('#block-')) {
      e.preventDefault();
      const targetBlockId = anchor.getAttribute('href')!.replace('#block-', '');
      
      // Request tldraw to center visual camera frame on this shape!
      if (editorRefInstance) {
        const shapes = editorRefInstance.getRasterizedInstanceShapes
          ? editorRefInstance.getRasterizedInstanceShapes()
          : editorRefInstance.getCurrentPageShapes();
        const found = shapes.find((s: any) => s.type === 'block' && s.props?.blockId === targetBlockId);
        if (found) {
          editorRefInstance.select(found.id);
          editorRefInstance.zoomToSelection();
        }
      }
    }
  };

  // Tooltip previews hovering calculations
  const handleStaticHover = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const anchor = target.closest('a');
    const tooltip = target.closest('.preview-tooltip-card');

    if (tooltip) {
      // Currently hovering inside the interactive tooltip itself. Do not close it!
      return;
    }

    if (anchor && anchor.getAttribute('href')?.startsWith('#block-')) {
      const targetBlockId = anchor.getAttribute('href')!.replace('#block-', '');
      try {
        const qResults = d.q(`[:find ?e :where [?e "block/id" "${targetBlockId}"]]`, db);
        if (qResults.length > 0) {
          const matchedEntity = d.pull(db, '[*]', qResults[0][0]);
          const rect = anchor.getBoundingClientRect();
          const parentRect = containerRef.current?.getBoundingClientRect();
          
          setHoveredLinkBlock({
            id: targetBlockId,
            title: matchedEntity['block/title'] || 'Untitled Block',
            content: matchedEntity['block/content'] || '',
            x: rect.left - (parentRect?.left || 0),
            y: rect.bottom - (parentRect?.top || 0) + 5,
          });
        }
      } catch (err) {
        console.error(err);
      }
    } else {
      setHoveredLinkBlock(null);
    }
  };

  // Styling maps based on block semantic selection
  const borderClasses: Record<string, string> = {
    general: 'border border-white/10 bg-[#141416]/75 hover:bg-[#141416]/85 text-slate-300 shadow-xl hover:border-white/20 backdrop-blur-md',
    theorem: 'border border-white/10 border-l-4 border-l-blue-500 bg-[#141416]/75 hover:bg-[#141416]/85 text-slate-300 shadow-xl hover:border-l-blue-400 hover:border-white/20 backdrop-blur-md',
    proof: 'border border-white/10 border-l-4 border-l-stone-500 bg-[#141416]/75 hover:bg-[#141416]/85 text-slate-300 shadow-xl hover:border-l-stone-400 hover:border-white/20 backdrop-blur-md',
    remark: 'border border-white/10 border-l-4 border-l-emerald-500 bg-[#141416]/75 hover:bg-[#141416]/85 text-slate-300 shadow-xl hover:border-l-emerald-400 hover:border-white/20 backdrop-blur-md',
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full rounded-xl flex flex-col overflow-visible font-sans leading-relaxed select-text transition-all duration-200 ${
        isEditing 
          ? 'bg-[#141416]/90 border border-blue-500/40 ring-1 ring-blue-500/20 shadow-2xl glow-blue'
          : borderClasses[blockType]
      }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setHoveredLinkBlock(null);
      }}
    >
      {/* Immersive HUD Editing Mode Header Bar inside Shape */}
      {isEditing && <ShadcnTiptapToolbar editor={editor} />}

      <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0 relative">
        {/* Editor active mode viewport layout */}
        {isEditing ? (
          <div className="w-full h-full outline-none prose prose-invert max-w-none text-sm leading-relaxed text-slate-200 focus:outline-none">
            <EditorContent editor={editor} className="outline-none focus:outline-none" />
            
            {/* Autocomplete Suggestions dropdown render */}
            {showAutocomplete && autocompleteSuggestions.length > 0 && (
              <div 
                className="absolute z-50 mt-1 max-w-xs bg-[#1a1a1e] border border-white/10 rounded-lg shadow-2xl overflow-hidden py-1 text-xs text-slate-300 font-sans cursor-pointer select-none backdrop-blur-md glow-blue animate-in fade-in zoom-in-95 duration-100"
                style={{
                  top: autocompleteCoords ? `${autocompleteCoords.top}px` : '40px',
                  left: autocompleteCoords ? `${autocompleteCoords.left}px` : '20px'
                }}
              >
                <div className="px-3 py-1.5 font-bold text-[9px] uppercase tracking-wider text-slate-500 border-b border-white/5 select-none">
                  {autocompleteMode === 'ref' ? 'Reference Environment Suggestions' : 'Link Block Suggestions'}
                </div>
                {autocompleteSuggestions.map((item: any, idx) => (
                  <div
                    key={item.id}
                    className={`px-3 py-2 flex flex-col transition hover:bg-blue-500/10 hover:text-white ${
                      autocompleteIndex === idx ? 'bg-blue-500/10 text-white' : ''
                    }`}
                    onClick={() => handleSelectAutocomplete(item)}
                  >
                    {autocompleteMode === 'ref' ? (
                      <>
                        <span className="font-semibold text-slate-200">
                          {item.type.charAt(0).toUpperCase() + item.type.slice(1)} {item.number}
                        </span>
                        <span className="text-[10px] text-blue-400 font-mono">
                          label: {item.label}
                        </span>
                        {item.title && (
                          <span className="text-[10px] text-slate-500 truncate mt-0.5">
                            {item.title}
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="font-semibold text-slate-200">{item.title}</span>
                        <span className="text-[10px] text-slate-500 font-mono truncate">{item.id}</span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Static read-only HTML mode viewport layout */
          <div 
            className="w-full h-full text-slate-300 text-[13.5px] leading-relaxed prose prose-invert max-w-none select-text cursor-default overflow-y-auto"
            onClick={handleStaticClick}
            onMouseMove={handleStaticHover}
            dangerouslySetInnerHTML={{ __html: formattedHtml }}
          />
        )}
      </div>

      {/* Floating preview tooltip */}
      {hoveredLinkBlock && (
        <div
          className="preview-tooltip-card absolute z-50 w-64 bg-[#141416]/95 text-white p-3.5 rounded-lg shadow-2xl text-xs select-none border border-blue-500/20 backdrop-blur-md cursor-pointer hover:border-blue-500/45 transition-all duration-150 hover:scale-[1.01] animate-in fade-in zoom-in-95 duration-100"
          style={{
            top: `${hoveredLinkBlock.y}px`,
            left: `${Math.max(10, Math.min(hoveredLinkBlock.x, 200))}px`
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (editorRefInstance) {
              const shapes = editorRefInstance.getRasterizedInstanceShapes
                ? editorRefInstance.getRasterizedInstanceShapes()
                : editorRefInstance.getCurrentPageShapes();
              const found = shapes.find((s: any) => s.type === 'block' && s.props?.blockId === hoveredLinkBlock.id);
              if (found) {
                editorRefInstance.select(found.id);
                editorRefInstance.zoomToSelection();
                setHoveredLinkBlock(null);
              }
            }
          }}
        >
          <div className="font-bold border-b border-white/5 pb-1 mb-1.5 flex items-center justify-between text-blue-400">
            <span>→ {hoveredLinkBlock.title}</span>
            <span className="text-[9px] uppercase font-mono tracking-wider text-slate-500 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded">Jump</span>
          </div>
          <div className="line-clamp-4 text-slate-400 leading-relaxed font-mono text-[11px]">
            {hoveredLinkBlock.content || 'No content.'}
          </div>
          <div className="mt-2 text-[8.5px] text-zinc-500 text-right font-mono select-none">
            Click this card to navigate and center
          </div>
        </div>
      )}

      {/* Help Quick Actions Overlay */}
      {isEditing && (
        <div className="absolute bottom-1.5 right-3 text-[9px] text-slate-500 select-none pointer-events-none tracking-tight font-mono">
          Type <span className="text-blue-400/80">/thm</span>, <span className="text-emerald-400/80">/proof</span>, or <span className="text-amber-400/80">$$</span>
        </div>
      )}
    </div>
  );
};
