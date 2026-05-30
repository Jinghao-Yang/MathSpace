import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
// @ts-ignore
import d from 'datascript';
// @ts-ignore
import { useEditor, EditorContent } from '@tiptap/react';
import { extensions, renderLatexInHtml } from '../tiptap/extensions';
import { getConn, subscribeToDb } from '../db/init';
import { getNextNumber } from '../db/counters';
import { ShadcnTiptapToolbar } from './ShadcnTiptapToolbar';
import { TextSelection } from '@tiptap/pm/state';
import { 
  Plus, 
  Map, 
  BookOpen, 
  ChevronRight, 
  Search, 
  List, 
  X, 
  Sparkles,
  Info,
  Bold,
  Italic,
  Strikethrough,
  Code,
  Link,
  ChevronDown,
  Calculator,
  Hash,
  Sigma
} from 'lucide-react';

function debounce<T extends (...args: any[]) => any>(func: T, wait: number): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}

interface PageEditorProps {
  pageId: string;
  onSwitchMode: (mode: 'page' | 'canvas') => void;
}

// Configurable layout elements for Slash Command Popup
const slashItems = [
  { key: 'theorem', name: 'Theorem Environment', desc: 'Auto-numbered formal mathematical results', icon: Sparkles },
  { key: 'lemma', name: 'Lemma Environment', desc: 'Auxiliary supporting proposition', icon: Sparkles },
  { key: 'proof', name: 'Proof Environment', desc: 'Logical verification ending with tombstone ∎', icon: Sparkles },
  { key: 'definition', name: 'Definition Environment', desc: 'Precise formulation of a new term', icon: Sparkles },
  { key: 'corollary', name: 'Corollary Environment', desc: 'Direct consequence of a theorem', icon: Sparkles },
  { key: 'proposition', name: 'Proposition Environment', desc: 'Intermediate result of minor significance', icon: Sparkles },
  { key: 'remark', name: 'Remark Environment', desc: 'Informal or cautionary annotation', icon: Sparkles },
  { key: 'math-block', name: 'Interactive Math Block', desc: 'Live editable Formula ($$)', icon: Calculator },
  { key: 'ref', name: 'Reference Environment', desc: 'Insert local environment hyper-link (\\ref)', icon: Hash },
];

export const PageEditor: React.FC<PageEditorProps> = ({
  pageId,
  onSwitchMode,
}) => {
  const [db, setDb] = useState<any>(null);
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);

  // UI Panels State
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showOutline, setShowOutline] = useState(false);

  // Autocomplete state
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteMode, setAutocompleteMode] = useState<'link' | 'ref' | null>(null);
  const [autocompleteQuery, setAutocompleteQuery] = useState('');
  const [autocompleteIndex, setAutocompleteIndex] = useState(0);
  const [autocompleteCoords, setAutocompleteCoords] = useState<{ top: number; left: number } | null>(null);

  // Slash command menu state
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashCoords, setSlashCoords] = useState<{ top: number; left: number } | null>(null);

  // Text Selection Bubble menu state
  const [showBubbleMenu, setShowBubbleMenu] = useState(false);
  const [bubbleCoords, setBubbleCoords] = useState<{ top: number; left: number } | null>(null);

  // Tooltip Previews
  const [hoveredLinkBlock, setHoveredLinkBlock] = useState<{
    id: string;
    title: string;
    content: string;
    x: number;
    y: number;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const isSyncingRef = useRef(false);
  const loadedPageRef = useRef<string | null>(null);

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

  // Fetch current page entity title
  const pageEntity = useMemo(() => {
    if (!db) return null;
    try {
      const pageRes = d.q(`[:find ?e :where [?e "block/id" "${pageId}"]]`, db);
      if (pageRes.length === 0) return null;
      return d.pull(db, '[*]', pageRes[0][0]);
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [db, pageId]);

  const pageTitle = pageEntity?.['block/title'] || 'Untitled Page';

  // Fetch all child blocks belonging to this page
  const childBlocks = useMemo(() => {
    if (!db || !pageEntity) return [];
    try {
      const pageEid = pageEntity[':db/id'];
      const results = d.q(
        `[:find ?id ?order :where [?e "block/parent" ${pageEid}] [?e "block/id" ?id] [?e "block/order" ?order]]`,
        db
      );
      
      return results
        .map(([id, order]: any) => {
          const bRes = d.q(`[:find ?e :where [?e "block/id" "${id}"]]`, db);
          const entity = d.pull(db, '[*]', bRes[0][0]);
          return {
            id,
            order: typeof order === 'number' ? order : 0,
            content: entity['block/content'] || '',
            type: entity['block/type'] || 'general',
            x: entity['block/x'] || 100,
            y: entity['block/y'] || 100,
            w: entity['block/w'] || 320,
            h: entity['block/h'] || 160,
          };
        })
        .sort((a, b) => a.order - b.order);
    } catch (err) {
      console.error('Failed to query children of page', err);
      return [];
    }
  }, [db, pageEntity]);

  // Sync scroll focus and highlight to a specific block ID inside Tiptap
  const scrollToBlockInEditor = useCallback((targetBlockId: string) => {
    if (!editor) return;
    let targetPos = -1;
    editor.state.doc.descendants((node, pos) => {
      if (node.attrs.blockId === targetBlockId) {
        targetPos = pos;
        return false; // stop traversal
      }
    });
    
    if (targetPos !== -1) {
      editor.commands.focus(targetPos);
      const domNode = editor.view.nodeDOM(targetPos) as HTMLElement;
      if (domNode) {
        domNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
        domNode.classList.add('ring-2', 'ring-blue-500/50', 'transition-all', 'duration-300');
        setTimeout(() => {
          domNode.classList.remove('ring-2', 'ring-blue-500/50');
        }, 1500);
      }
    }
  }, [childBlocks]);

  // Support jumps from elements or global shortcuts
  useEffect(() => {
    const handleNavigationEvent = (e: any) => {
      const targetBlockId = e.detail?.blockId;
      if (targetBlockId) {
        setTimeout(() => {
          scrollToBlockInEditor(targetBlockId);
        }, 100);
      }
    };
    window.addEventListener('navigate-to-block', handleNavigationEvent);
    return () => {
      window.removeEventListener('navigate-to-block', handleNavigationEvent);
    };
  }, [scrollToBlockInEditor]);

  // Trace select component breadcrumbs path
  const breadcrumbs = useMemo(() => {
    if (!db || !focusedBlockId) return [];
    try {
      const trail: { id: string; title: string; type: string; label?: string }[] = [];
      const visited = new Set<string>();

      const traverse = (blockUuid: string) => {
        if (visited.has(blockUuid)) return;
        visited.add(blockUuid);

        const res = d.q(`[:find ?e :where [?e "block/id" "${blockUuid}"]]`, db);
        if (res.length === 0) return;
        const eId = res[0][0];
        const entity = d.pull(db, '[*]', eId);
        const title = entity['block/title'] || 'Untitled Block';
        const type = entity['block/type'] || 'general';
        const label = entity['block/label'];
        const num = entity['block/number'];

        let displayTitle = title;
        if (type !== 'general') {
          displayTitle = `${type.charAt(0).toUpperCase() + type.slice(1)}${num ? ' #' + num : ''}`;
        }

        if (blockUuid !== pageId) {
          trail.unshift({ id: blockUuid, title: displayTitle, type, label });
        }

        // Trace up through connections or sequential lists if parent links exist
        const parentRes = d.q(
          `[:find ?parentId :where [?parent "link/from" ${eId}] [?parent "block/id" ?parentId]]`,
          db
        );
        if (parentRes.length > 0) {
          traverse(parentRes[0][0]);
        }
      };

      traverse(focusedBlockId);
      return trail;
    } catch (err) {
      console.error('Failed to resolve breadcrumbs', err);
      return [];
    }
  }, [db, focusedBlockId, pageId]);

  // Debounced Page Content Save to Database
  const saveToDatabase = useCallback((editorInstance: any) => {
    if (!pageEntity || isSyncingRef.current) return;
    
    const conn = getConn();
    const currentDb = d.db(conn);
    const pageEid = pageEntity[':db/id'];
    
    // 1. Assign blockId to any raw top-level ProseMirror nodes that lack one
    let assignedNewIds = false;
    editorInstance.commands.command(({ tr }: any) => {
      const nodeWithPos: { node: any, pos: number }[] = [];
      tr.doc.forEach((node: any, pos: number) => {
        if (!node.attrs.blockId) {
          nodeWithPos.push({ node, pos });
        }
      });
      
      if (nodeWithPos.length > 0) {
        nodeWithPos.forEach(({ node, pos }) => {
          const newBlockId = `block-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
          tr.setNodeMarkup(pos, undefined, {
            ...node.attrs,
            blockId: newBlockId,
          });
        });
        assignedNewIds = true;
      }
      return true;
    });
    
    if (assignedNewIds) return;

    // 2. Fetch current child blocks of this page in database
    const dbChildrenResults = d.q(
      `[:find ?id :where [?e "block/parent" ${pageEid}] [?e "block/id" ?id]]`,
      currentDb
    );
    const oldBlockIds = new Set<string>(dbChildrenResults.map((v: any) => v[0]));
    
    // 3. Keep a list of visited blockId's in this edit update session
    const seenBlockIds = new Set<string>();
    
    // 4. Group ProseMirror nodes by blockId to preserve paragraph flows for any compound elements
    const blockGroups: Record<string, { nodes: any[], type: string }> = {};
    const orderedBlockIds: string[] = [];
    
    editorInstance.state.doc.forEach((node: any) => {
      const bId = node.attrs.blockId;
      if (!bId) return;
      
      if (!blockGroups[bId]) {
        blockGroups[bId] = { nodes: [], type: 'general' };
        orderedBlockIds.push(bId);
      }
      
      blockGroups[bId].nodes.push(node);
      seenBlockIds.add(bId);
      
      if (node.type.name === 'mathEnvironment') {
        blockGroups[bId].type = node.attrs.envType || 'general';
      }
    });

    // 5. Build transaction list
    const transactionList: any[] = [];
    
    orderedBlockIds.forEach((bId, idx) => {
      const group = blockGroups[bId];
      
      let markdownText = "";
      try {
        const serializer = (editorInstance.storage as any).markdown?.serializer;
        if (serializer) {
          const tempDoc = editorInstance.schema.nodes.doc.create(null, group.nodes);
          markdownText = serializer.serialize(tempDoc);
        }
      } catch (err) {
        console.error('Serialization of node failed', err);
      }
      
      let labelKey: string | null = null;
      group.nodes.forEach((node) => {
        if (node.type.name === 'mathEnvironment' && node.attrs.label) {
          labelKey = node.attrs.label;
        }
      });
      
      let plainText = "";
      group.nodes.forEach((n) => {
        plainText += (plainText ? "\n" : "") + n.textContent;
      });
      plainText = plainText.trim();
      const firstLine = plainText.split('\n')[0] || '';
      let blockTitle = firstLine.substring(0, 50) || 'Untitled Card';
      if (blockTitle.startsWith('\\begin{')) {
        blockTitle = plainText.replace(/\\begin\{[a-zA-Z]+\}(?:\[.*?\])?/g, '').trim().split('\n')[0];
        blockTitle = blockTitle.substring(0, 50) || `${group.type.toUpperCase()} Block`;
      }
      
      let posX = 100;
      let posY = 100 + idx * 180;
      let posW = 320;
      let posH = 160;
      
      const existingRes = d.q(`[:find ?x ?y ?w ?h :where [?e "block/id" "${bId}"] [?e "block/x" ?x] [?e "block/y" ?y] [?e "block/w" ?w] [?e "block/h" ?h]]`, currentDb);
      if (existingRes.length > 0) {
        posX = existingRes[0][0];
        posY = existingRes[0][1];
        posW = existingRes[0][2];
        posH = existingRes[0][3];
      }
      
      const tagMatches = Array.from(markdownText.matchAll(/(?:^|\s)#([a-zA-Z][a-zA-Z0-9_-]*)/g));
      const currentTags = Array.from(new Set(tagMatches.map((m) => m[1].toLowerCase()).filter(t => !t.startsWith('block-'))));
      
      const existingTagsResults = d.q(
        `[:find ?tag :where [?e "block/id" "${bId}"] [?e "block/tag" ?tag]]`,
        currentDb
      );
      const oldTags = existingTagsResults.map((v: any) => v[0]);
      
      oldTags.forEach((t: string) => {
        transactionList.push([':db/retract', ['block/id', bId], 'block/tag', t]);
      });
      
      const existingLabelResults = d.q(`[:find ?lbl :where [?e "block/id" "${bId}"] [?e "block/label" ?lbl]]`, currentDb);
      const oldLabel = existingLabelResults.length > 0 ? existingLabelResults[0][0] : null;
      if (oldLabel && oldLabel !== labelKey) {
        transactionList.push([':db/retract', ['block/id', bId], 'block/label', oldLabel]);
      }
      
      transactionList.push({
        'block/id': bId,
        'block/type': group.type,
        'block/content': markdownText,
        'block/title': blockTitle,
        'block/parent': pageEid,
        'block/order': idx,
        'block/x': posX,
        'block/y': posY,
        'block/w': posW,
        'block/h': posH,
      });
      
      if (labelKey) {
        transactionList.push({
          'block/id': bId,
          'block/label': labelKey,
        });
      }
      
      currentTags.forEach((tag) => {
        transactionList.push({
          'block/id': bId,
          'block/tag': tag,
        });
      });
    });
    
    oldBlockIds.forEach((oldId) => {
      if (!seenBlockIds.has(oldId)) {
        const retractEid = d.q(`[:find ?e :where [?e "block/id" "${oldId}"]]`, currentDb);
        if (retractEid.length > 0) {
          transactionList.push([':db.fn/retractEntity', retractEid[0][0]]);
        }
      }
    });
    
    if (transactionList.length > 0) {
      try {
        isSyncingRef.current = true;
        d.transact(conn, transactionList);
        isSyncingRef.current = false;
      } catch (txErr) {
        console.error('Transaction commit failed on save', txErr);
        isSyncingRef.current = false;
      }
    }
  }, [pageEntity]);

  const saveToDbDebounced = useRef<any>(null);

  useEffect(() => {
    saveToDbDebounced.current = debounce((editorInst: any) => {
      saveToDatabase(editorInst);
    }, 500);
  }, [saveToDatabase]);

  // Set up continuous Tiptap editor
  const editor = useEditor({
    extensions,
    content: '',
    onUpdate({ editor }) {
      if (isSyncingRef.current) return;

      // 1. Slash command conversion
      const { selection } = editor.state;
      const { $from } = selection;
      let hasSlash = false;
      if ($from.depth >= 1) {
        const parentNode = $from.node($from.depth);
        if (parentNode.type.name === 'paragraph') {
          const text = parentNode.textContent;
          if (text.startsWith('/')) {
            hasSlash = true;
            const queryVal = text.substring(1);
            setSlashQuery(queryVal);
            setShowSlashMenu(true);
            
            try {
              const coords = editor.view.coordsAtPos(selection.from);
              const containerRect = containerRef.current?.getBoundingClientRect();
              if (containerRect) {
                setSlashCoords({
                  top: coords.bottom - containerRect.top + 28,
                  left: coords.left - containerRect.left,
                });
              }
            } catch (coordErr) {
              console.warn(coordErr);
            }
          }
        }
      }
      if (!hasSlash) {
        setShowSlashMenu(false);
      }

      // 2. Scan content for autocomplete brackets
      const cursorPosition = selection.from;
      let textBeforeCursor = '';
      try {
        const startOfParagraph = $from.start();
        textBeforeCursor = editor.state.doc.textBetween(
          startOfParagraph,
          cursorPosition,
          ' '
        );
      } catch (_) {}

      let triggerMode: 'link' | 'ref' | null = null;
      let triggerQuery = '';

      const lastDoubleBracket = textBeforeCursor.lastIndexOf('[[');
      const lastRefTrigger = textBeforeCursor.lastIndexOf('\\ref{');

      if (lastDoubleBracket !== -1 && (lastRefTrigger === -1 || lastDoubleBracket > lastRefTrigger)) {
        const afterBracket = textBeforeCursor.substring(lastDoubleBracket + 2);
        if (!afterBracket.includes(']]') && !afterBracket.includes('[')) {
          triggerMode = 'link';
          triggerQuery = afterBracket;
        }
      } else if (lastRefTrigger !== -1) {
        const afterRef = textBeforeCursor.substring(lastRefTrigger + 5);
        if (!afterRef.includes('}') && !afterRef.includes('{')) {
          triggerMode = 'ref';
          triggerQuery = afterRef;
        }
      }

      if (triggerMode) {
        setAutocompleteQuery(triggerQuery);
        setAutocompleteMode(triggerMode);
        setShowAutocomplete(true);

        try {
          const coords = editor.view.coordsAtPos(cursorPosition);
          const containerRect = containerRef.current?.getBoundingClientRect();
          if (containerRect) {
            setAutocompleteCoords({
              top: coords.bottom - containerRect.top + 28,
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

      // 3. Trigger debounced database save
      if (saveToDbDebounced.current) {
        saveToDbDebounced.current(editor);
      }
    },
    onSelectionUpdate({ editor }) {
      const { selection } = editor.state;
      const { $from } = selection;
      if ($from.depth >= 1) {
        const topLevelNode = $from.node(1);
        const bId = topLevelNode?.attrs?.blockId;
        if (bId) {
          setFocusedBlockId(bId);
        }
      } else {
        setFocusedBlockId(null);
      }

      // 2. Active selection Coordinates for Lightweight Bubble toolbar
      if (editor && !selection.empty) {
        try {
          const coords = editor.view.coordsAtPos(selection.from);
          const containerRect = containerRef.current?.getBoundingClientRect();
          if (containerRect && coords) {
            setBubbleCoords({
              top: coords.top - containerRect.top - 46, // offset above selection text
              left: coords.left - containerRect.left,
            });
            setShowBubbleMenu(true);
            return;
          }
        } catch (err) {
          console.warn(err);
        }
      }
      setShowBubbleMenu(false);
    }
  });

  // Slash suggestions filtering
  const filteredSlashItems = useMemo(() => {
    if (!showSlashMenu) return [];
    const q = slashQuery.toLowerCase();
    return slashItems.filter(item => 
      item.key.toLowerCase().includes(q) || 
      item.name.toLowerCase().includes(q) ||
      item.desc.toLowerCase().includes(q)
    );
  }, [showSlashMenu, slashQuery]);

  const handleSelectSlashItem = (itemKey: string) => {
    if (!editor) return;
    const { from, $from } = editor.state.selection;
    const startOfParagraph = $from.start();
    
    // Select outline environment types or live editing math items
    editor.commands.deleteRange({ from: startOfParagraph, to: from });
    
    if (itemKey === 'math-block') {
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'mathFieldBlock',
          attrs: { latex: '' },
        })
        .run();
    } else if (itemKey === 'ref') {
      editor.chain().focus().insertContent('\\ref{my_label}').run();
    } else {
      let num = null;
      try {
        num = getNextNumber(getConn(), itemKey);
      } catch (_) {}
      
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'mathEnvironment',
          attrs: { envType: itemKey, title: '', number: num, label: '' },
          content: [{ type: 'paragraph' }]
        })
        .run();
    }
    
    setShowSlashMenu(false);
  };

  // Autocomplete Suggestions logic
  const autocompleteSuggestions = useMemo(() => {
    if (!db || !showAutocomplete) return [];
    try {
      const q = autocompleteQuery.toLowerCase();
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
          .filter((item: any) => item.title.toLowerCase().includes(q))
          .slice(0, 5);
      }
    } catch (e) {
      console.error(e);
      return [];
    }
  }, [db, showAutocomplete, autocompleteMode, autocompleteQuery]);

  const handleSelectAutocomplete = (selected: any) => {
    if (!editor) return;
    const { from, $from } = editor.state.selection;
    const startOfParagraph = $from.start();

    let textBeforeCursor = '';
    try {
      textBeforeCursor = editor.state.doc.textBetween(
        startOfParagraph,
        from,
        ' '
      );
    } catch (_) {}

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

    const lastDoubleBracket = textBeforeCursor.lastIndexOf('[[');
    if (lastDoubleBracket !== -1) {
      const absStartPos = startOfParagraph + lastDoubleBracket;
      editor.commands.deleteRange({ from: absStartPos, to: from });
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

  // Track dynamic coordinates and autocomplete popups
  useEffect(() => {
    if (!editor) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (showSlashMenu && filteredSlashItems.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          e.stopPropagation();
          setSlashIndex((prev) => (prev + 1) % filteredSlashItems.length);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          e.stopPropagation();
          setSlashIndex((prev) => (prev - 1 + filteredSlashItems.length) % filteredSlashItems.length);
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          const selected = filteredSlashItems[slashIndex];
          if (selected) {
            handleSelectSlashItem(selected.key);
          }
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          setShowSlashMenu(false);
          return;
        }
      }

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
    };
    
    const editorDom = containerRef.current;
    if (editorDom) {
      editorDom.addEventListener('keydown', onKeyDown, true);
    }
    return () => {
      if (editorDom) {
        editorDom.removeEventListener('keydown', onKeyDown, true);
      }
    };
  }, [editor, showSlashMenu, filteredSlashItems, slashIndex, showAutocomplete, autocompleteIndex, autocompleteSuggestions]);

  // Sync loaded page's discrete datastores as a continuous editor flow
  useEffect(() => {
    if (!editor || !pageEntity) return;
    
    if (loadedPageRef.current === pageId) return;
    
    loadedPageRef.current = pageId;
    
    const allNodes: any[] = [];
    childBlocks.forEach((block) => {
      let content = block.content || '';
      const type = block.type || 'general';
      
      if (type !== 'general') {
        const beginRegex = new RegExp(`^\\\\begin\\{${type}\\}`);
        if (!beginRegex.test(content.trim())) {
          content = `\\begin{${type}}\n${content}\n\\end{${type}}`;
        }
      }
      
      try {
        const parser = (editor.storage as any).markdown?.parser;
        if (parser) {
          const pmDoc = parser.parse(content);
          if (pmDoc.content.size === 0) {
            allNodes.push(editor.schema.nodes.paragraph.create({ blockId: block.id }));
          } else {
            pmDoc.content.forEach((node: any) => {
              const cloned = node.type.create(
                {
                  ...node.attrs,
                  blockId: block.id,
                },
                node.content,
                node.marks
              );
              allNodes.push(cloned);
            });
          }
        }
      } catch (err) {
        console.error('Failed to parse block markdown', block.id, err);
      }
    });
    
    if (allNodes.length === 0) {
      allNodes.push(editor.schema.nodes.paragraph.create({ blockId: `block-${Date.now()}` }));
    }
    
    const completeDoc = editor.schema.nodes.doc.create(null, allNodes);
    
    isSyncingRef.current = true;
    editor.commands.setContent(completeDoc.toJSON());
    isSyncingRef.current = false;
  }, [editor, pageId, pageEntity, childBlocks]);



  // Header update actions
  const handleUpdatePageTitle = (newTitle: string) => {
    if (!newTitle.trim()) return;
    try {
      const conn = getConn();
      d.transact(conn, [
        {
          'block/id': pageId,
          'block/title': newTitle.trim(),
        }
      ]);
    } catch (err) {
      console.error('Failed to update page title', err);
    }
  };

  const handleEditorMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!db) return;
    const target = e.target as HTMLElement;
    const blockLinkNode = target.closest('[data-type="blockLink"]');
    const refNode = target.closest('.math-reference');

    if (blockLinkNode) {
      const refId = blockLinkNode.getAttribute('data-id') || blockLinkNode.getAttribute('blockid');
      if (refId && (!hoveredLinkBlock || hoveredLinkBlock.id !== refId)) {
        try {
          const res = d.q(`[:find ?title ?content :where [?e "block/id" "${refId}"] [?e "block/title" ?title] [?e "block/content" ?content]]`, db);
          if (res.length > 0) {
            const containerRect = e.currentTarget.getBoundingClientRect();
            const px = e.clientX - containerRect.left;
            const py = e.clientY - containerRect.top + 24;
            setHoveredLinkBlock({
              id: refId,
              title: res[0][0] || 'Untitled Card',
              content: res[0][1] || 'No content.',
              x: px,
              y: py,
            });
          }
        } catch (_) {}
      }
    } else if (refNode) {
      const refKey = refNode.getAttribute('data-ref-key') || refNode.getAttribute('referencekey');
      if (refKey && (!hoveredLinkBlock || hoveredLinkBlock.id !== refKey)) {
        try {
          const res = d.q(`[:find ?uuid ?title ?content :where [?e "block/label" "${refKey}"] [?e "block/id" ?uuid] [?e "block/title" ?title] [?e "block/content" ?content]]`, db);
          if (res.length > 0) {
            const containerRect = e.currentTarget.getBoundingClientRect();
            const px = e.clientX - containerRect.left;
            const py = e.clientY - containerRect.top + 24;
            setHoveredLinkBlock({
              id: res[0][0],
              title: res[0][1] || `[Label: ${refKey}]`,
              content: res[0][2] || 'No content.',
              x: px,
              y: py,
            });
          }
        } catch (_) {}
      }
    } else {
      if (hoveredLinkBlock) {
        const tooltip = target.closest('.preview-tooltip-card');
        if (!tooltip) {
          setHoveredLinkBlock(null);
        }
      }
    }
  };

  const handleEditorClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const linkNode = target.closest('[data-type="blockLink"]') || target.closest('.math-reference');
    if (linkNode) {
      const refKey = linkNode.getAttribute('data-ref-key') || linkNode.getAttribute('referencekey');
      const targetId = linkNode.getAttribute('data-id') || linkNode.getAttribute('blockid');

      if (targetId) {
        e.preventDefault();
        e.stopPropagation();
        setHoveredLinkBlock(null);
        scrollToBlockInEditor(targetId);
      } else if (refKey && db) {
        e.preventDefault();
        e.stopPropagation();
        try {
          const results = d.q(`[:find ?uuid :where [?e "block/label" "${refKey}"] [?e "block/id" ?uuid]]`, db);
          if (results.length > 0) {
            setHoveredLinkBlock(null);
            scrollToBlockInEditor(results[0][0]);
          }
        } catch (_) {}
      }
    }
  };

  // SPOTLIGHT Search Query matches
  const pageSearchList = useMemo(() => {
    if (!db || !pageEntity) return [];
    try {
      const pageEid = pageEntity[':db/id'];
      const results = d.q(
        `[:find ?id ?title ?type ?content :where [?e "block/parent" ${pageEid}] [?e "block/id" ?id] [?e "block/title" ?title] [?e "block/type" ?type] [?e "block/content" ?content]]`,
        db
      );
      return results.map(([id, title, type, content]: any) => ({
        id,
        title: title || 'Untitled Block',
        type,
        snippet: content ? content.substring(0, 80) : '',
      }));
    } catch (e) {
      console.error(e);
      return [];
    }
  }, [db, pageEntity, showSearch]);

  const filteredSearchResults = useMemo(() => {
    if (!searchQuery) return pageSearchList;
    const q = searchQuery.toLowerCase();
    return pageSearchList.filter(
      (item: any) =>
        item.title.toLowerCase().includes(q) ||
        item.snippet.toLowerCase().includes(q)
    );
  }, [pageSearchList, searchQuery]);

  // Headings and Math Environments list for Floating Outline Navigator
  const documentOutline = useMemo(() => {
    if (!db || !pageEntity) return [];
    try {
      const pageEid = pageEntity[':db/id'];
      const results = d.q(
        `[:find ?id ?title ?type ?order :where [?e "block/parent" ${pageEid}] [?e "block/id" ?id] [?e "block/title" ?title] [?e "block/type" ?type] [?e "block/order" ?order]]`,
        db
      );
      
      const unsorted = results.map(([id, title, type, order]: any) => {
        let displayTitle = title;
        let isHeading = false;
        let depth = 0;

        // Trace if block represents environments or contains headings
        if (type !== 'general') {
          displayTitle = `${type.charAt(0).toUpperCase() + type.slice(1)}`;
        }

        return {
          id,
          title: displayTitle || 'Untitled Section',
          type,
          order: typeof order === 'number' ? order : 0,
        };
      });

      return unsorted.sort((a, b) => a.order - b.order);
    } catch (e) {
      console.error(e);
      return [];
    }
  }, [db, pageEntity, showOutline, childBlocks]);

  return (
    <div className="flex-1 flex flex-col h-full bg-[#111112] text-slate-100 overflow-hidden font-sans select-none">
      
      {/* Page Header Area */}
      <div className="h-14 px-6 border-b border-[#262629] flex items-center justify-between shrink-0 bg-[#161618] relative z-30">
        
        {/* Breadcrumb pathing */}
        <div className="flex items-center gap-3 max-w-[calc(100%-240px)]">
          <BookOpen className="w-4 h-4 text-blue-500 shrink-0" />
          <input
            type="text"
            value={pageTitle}
            onChange={(e) => handleUpdatePageTitle(e.target.value)}
            className="bg-transparent text-xs font-bold text-slate-300 hover:text-white focus:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-2 py-0.5 w-40 border border-transparent hover:border-[#262629] transition shrink-0"
            title="Page title"
          />

          {breadcrumbs.length > 0 && (
            <>
              <ChevronRight className="w-3 h-3 text-slate-600 shrink-0" />
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-1">
                {breadcrumbs.map((crumb, idx) => (
                  <React.Fragment key={crumb.id}>
                    {idx > 0 && <ChevronRight className="w-2.5 h-2.5 text-slate-700 shrink-0" />}
                    <span
                      onClick={() => scrollToBlockInEditor(crumb.id)}
                      className="text-[10px] font-bold text-violet-400 hover:text-violet-300 hover:underline cursor-pointer tracking-wider truncate max-w-[124px] uppercase shrink-0 transition"
                      title={crumb.label ? `label: ${crumb.label}` : crumb.title}
                    >
                      {crumb.title}
                      {crumb.label && <span className="text-[8px] text-zinc-500 lowercase ml-1">({crumb.label})</span>}
                    </span>
                  </React.Fragment>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Board mode switches */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onSwitchMode('canvas')}
            className="flex items-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-semibold bg-[#212124] hover:bg-[#2b2b2f] text-blue-400 border border-blue-500/20 active:scale-95 transition cursor-pointer"
            title="Switch to Canvas Mode space"
          >
            <Map className="w-3.5 h-3.5" /> Canvas Mode
          </button>
        </div>
      </div>

      {/* Tiptap Custom Formatting toolbar */}
      <ShadcnTiptapToolbar editor={editor} />

      {/* Main scrolling viewport content */}
      <div className="flex-1 overflow-y-auto px-6 py-8 relative" ref={containerRef}>
        <div className="w-full max-w-3xl mx-auto pb-32">
          
          {/* Header page titles */}
          <div className="border-b border-[#262629] pb-5 mb-8 text-left">
            <h1 className="text-3xl font-black text-white tracking-tight leading-tight">
              {pageTitle}
            </h1>
            <p className="text-[10px] text-zinc-500 tracking-wider font-mono mt-2 uppercase">
              Page doc ID: {pageId} • {childBlocks.length} core elements
            </p>
          </div>

          {/* Unified Editor Content container */}
          <div 
            className="w-full min-h-[500px] text-slate-200 text-sm leading-relaxed max-w-none prose prose-invert focus:outline-none editor-continuous-wrap"
            onMouseMove={handleEditorMouseMove}
            onClick={handleEditorClick}
          >
            {showBubbleMenu && bubbleCoords && editor && (
              <div 
                className="absolute z-[60] flex items-center gap-0.5 bg-[#171719]/95 border border-white/10 rounded-xl p-1 shadow-2xl backdrop-blur-md select-none animate-in fade-in zoom-in-95 duration-100"
                style={{
                  top: `${bubbleCoords.top}px`,
                  left: `${bubbleCoords.left}px`,
                }}
              >
                <button
                  type="button"
                  onClick={() => editor.chain().focus().toggleBold().run()}
                  className={`p-1.5 rounded-lg hover:bg-zinc-800 transition cursor-pointer ${
                    editor.isActive('bold') ? 'text-blue-400 bg-blue-500/10' : 'text-zinc-400 hover:text-zinc-100'
                  }`}
                  title="Bold"
                >
                  <Bold className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => editor.chain().focus().toggleItalic().run()}
                  className={`p-1.5 rounded-lg hover:bg-zinc-800 transition cursor-pointer ${
                    editor.isActive('italic') ? 'text-blue-400 bg-blue-500/10' : 'text-zinc-400 hover:text-zinc-100'
                  }`}
                  title="Italic"
                >
                  <Italic className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => editor.chain().focus().toggleStrike().run()}
                  className={`p-1.5 rounded-lg hover:bg-zinc-800 transition cursor-pointer ${
                    editor.isActive('strike') ? 'text-blue-400 bg-blue-500/10' : 'text-zinc-400 hover:text-zinc-100'
                  }`}
                  title="Strikethrough"
                >
                  <Strikethrough className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => editor.chain().focus().toggleCode().run()}
                  className={`p-1.5 rounded-lg hover:bg-zinc-800 transition cursor-pointer ${
                    editor.isActive('code') ? 'text-blue-400 bg-blue-500/10' : 'text-zinc-400 hover:text-zinc-100'
                  }`}
                  title="Code snippet"
                >
                  <Code className="w-3.5 h-3.5" />
                </button>
                <div className="w-px h-4 bg-zinc-800 mx-1 shrink-0" />
                <button
                  type="button"
                  onClick={() => {
                    const selText = editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to);
                    editor.chain().focus().insertContent(`$${selText || 'formula'}$`).run();
                  }}
                  className="p-1.5 rounded-lg hover:bg-zinc-800 text-teal-400 hover:text-teal-300 transition cursor-pointer"
                  title="Convert text to Inline Formula ($...$)"
                >
                  <Sigma className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => editor.chain().focus().insertContent('[[').run()}
                  className="p-1.5 rounded-lg hover:bg-zinc-800 text-violet-400 hover:text-violet-300 transition cursor-pointer"
                  title="Insert Link as Page Card"
                >
                  <Link className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <EditorContent editor={editor} className="math-tiptap-editor outline-none focus:outline-none" />

            {/* In-Editor Slash Command suggestions popup */}
            {showSlashMenu && filteredSlashItems.length > 0 && (
              <div 
                className="absolute z-50 min-w-64 bg-[#141416]/98 border border-white/10 rounded-xl shadow-3xl p-1 text-xs select-none backdrop-blur-md animate-in fade-in zoom-in-95 duration-100"
                style={{
                  top: `${slashCoords?.top || 50}px`,
                  left: `${slashCoords?.left || 50}px`
                }}
              >
                <div className="px-3 py-1.5 font-bold text-[9px] uppercase tracking-wider text-slate-500 border-b border-white/5 select-none text-left">
                  Slash Command Environments
                </div>
                <div className="max-h-64 overflow-y-auto p-1 space-y-0.5">
                  {filteredSlashItems.map((item: any, idx) => {
                    const IconComp = item.icon;
                    return (
                      <div
                        key={item.key}
                        className={`px-3 py-2 flex items-start gap-2.5 text-left transition hover:bg-violet-600/10 hover:text-white cursor-pointer rounded-lg ${
                          slashIndex === idx ? 'bg-violet-600/15 text-white ring-1 ring-violet-500/20' : ''
                        }`}
                        onClick={() => handleSelectSlashItem(item.key)}
                      >
                        <IconComp className={`w-4 h-4 shrink-0 mt-0.5 ${item.key === 'math-block' ? 'text-teal-400' : 'text-blue-400'}`} />
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-200 text-xs">{item.name}</span>
                          <span className="text-[10px] text-slate-500 font-mono leading-normal mt-0.5">
                            {item.desc}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* In-Editor autocomplete Suggestions popups */}
            {showAutocomplete && autocompleteSuggestions.length > 0 && (
              <div 
                className="absolute z-50 min-w-56 bg-[#141416]/95 border border-white/10 rounded-xl shadow-2xl p-1 text-xs select-none backdrop-blur-md animate-in fade-in zoom-in-95 duration-100"
                style={{
                  top: `${autocompleteCoords?.top || 50}px`,
                  left: `${autocompleteCoords?.left || 50}px`
                }}
              >
                <div className="px-3 py-1.5 font-bold text-[9px] uppercase tracking-wider text-slate-500 border-b border-white/5 select-none text-left">
                  {autocompleteMode === 'ref' ? 'Reference Environment Suggestions' : 'Link Block Suggestions'}
                </div>
                {autocompleteSuggestions.map((item: any, idx) => (
                  <div
                    key={item.id}
                    className={`px-3 py-2 flex flex-col text-left transition hover:bg-blue-500/10 hover:text-white cursor-pointer rounded-lg ${
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
                      </>
                    ) : (
                      <>
                        <span className="font-semibold text-slate-200 text-xs truncate">{item.title}</span>
                        <span className="text-[9px] text-slate-500 font-mono truncate">{item.id}</span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Hover preview tooltips inside Page Mode */}
      {hoveredLinkBlock && (
        <div
          className="preview-tooltip-card absolute z-50 w-64 bg-[#141416]/95 text-white p-4 rounded-xl shadow-2xl text-xs select-none border border-blue-500/25 backdrop-blur-md cursor-pointer hover:border-blue-500/45 transition-all duration-150 animate-in fade-in zoom-in-95 duration-100"
          style={{
            top: `${hoveredLinkBlock.y}px`,
            left: `${Math.max(16, Math.min(hoveredLinkBlock.x, 500))}px`
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setHoveredLinkBlock(null);
            scrollToBlockInEditor(hoveredLinkBlock.id);
          }}
        >
          <div className="font-bold border-b border-white/5 pb-1 mb-1.5 flex items-center justify-between text-blue-400">
            <span className="truncate pr-2">→ {hoveredLinkBlock.title}</span>
            <span className="text-[9px] uppercase font-mono tracking-wider text-slate-500 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded shrink-0">Jump</span>
          </div>
          <div className="line-clamp-4 text-slate-400 leading-relaxed font-mono text-[11px] text-left">
            {hoveredLinkBlock.content || 'No content.'}
          </div>
        </div>
      )}

      {/* Bottom Floating circular controls for Command palette search and Section Outline tree finder */}
      <div className="absolute bottom-6 right-6 z-40 flex items-center gap-2">
        <button
          onClick={() => setShowSearch(true)}
          className="p-3 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-teal-400 hover:text-teal-300 rounded-full shadow-2xl active:scale-90 transition cursor-pointer"
          title="Search documents spotlight"
        >
          <Search className="w-5 h-5" />
        </button>

        <button
          onClick={() => {
            setShowOutline(!showOutline);
          }}
          className={`p-3 border rounded-full shadow-2xl active:scale-90 transition cursor-pointer ${
            showOutline 
              ? 'bg-violet-600/20 border-violet-500/35 text-violet-400' 
              : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700 text-violet-400 hover:text-violet-350'
          }`}
          title="Toggle page proof outline"
        >
          <List className="w-5 h-5" />
        </button>
      </div>

      {/* Floating Section/Environment Outline panel */}
      {showOutline && (
        <div className="absolute bottom-20 right-6 w-72 bg-[#141416]/95 border border-[#26262a] rounded-2xl shadow-3xl overflow-hidden backdrop-blur-md z-40 select-none animate-in fade-in slide-in-from-bottom-5 duration-100">
          <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between bg-zinc-950/45">
            <span className="text-[10px] font-bold text-violet-400 uppercase tracking-widest flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Book Proof Outline
            </span>
            <button
              onClick={() => setShowOutline(false)}
              className="p-1 hover:bg-white/5 rounded-lg text-slate-500 hover:text-white transition cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto p-2 space-y-0.5 max-w-full">
            {documentOutline.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  scrollToBlockInEditor(item.id);
                  setShowOutline(false);
                }}
                className={`w-full text-left px-3 py-2 text-xs rounded-xl hover:bg-white/5 flex items-center justify-between group transition ${
                  focusedBlockId === item.id ? 'bg-violet-500/10 border border-violet-500/20 text-white' : 'text-slate-350 hover:text-white'
                }`}
              >
                <div className="flex flex-col truncate pr-2">
                  <span className="font-bold truncate capitalize">{item.title}</span>
                  <span className="text-[9px] font-mono text-slate-500 mt-0.5 truncate uppercase">Type: {item.type}</span>
                </div>
                <span className="text-[9px] text-zinc-600 font-mono group-hover:text-blue-400 transition shrink-0">→ Scroll</span>
              </button>
            ))}
            {documentOutline.length === 0 && (
              <div className="py-6 text-center text-[11px] text-zinc-500 font-sans">
                No formulated math cards on page yet.
              </div>
            )}
          </div>
        </div>
      )}

      {/* SPOTLIGHT Command palette Dial */}
      {showSearch && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-start justify-center pt-20 animate-fade-in pl-12 pr-12">
          <div className="w-full max-w-xl bg-[#141416]/95 border border-white/10 rounded-2xl shadow-3xl overflow-hidden animate-zoom-in">
            <div className="p-4 border-b border-white/5 flex items-center justify-between bg-zinc-950/20">
              <span className="text-[10px] font-bold text-violet-400 uppercase tracking-widest flex items-center gap-1.5 leading-none">
                <Search className="w-3.5 h-3.5" /> Search page elements
              </span>
              <button 
                onClick={() => setShowSearch(false)}
                className="p-1 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-3">
              <input
                type="text"
                placeholder="Type query to find mathematician statements, labels, or math LaTeX symbols..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
                className="w-full bg-[#1b1b1d] border border-white/10 focus:border-violet-500 rounded-xl p-3 text-slate-100 text-xs focus:outline-none focus:ring-1 focus:ring-violet-500 placeholder-slate-500"
              />
            </div>

            <div className="max-h-72 overflow-y-auto px-3 pb-3 space-y-1">
              {filteredSearchResults.map((item: any) => (
                <div
                  key={item.id}
                  onClick={() => {
                    setShowSearch(false);
                    scrollToBlockInEditor(item.id);
                  }}
                  className="group flex flex-col p-3 rounded-xl border border-transparent hover:border-violet-500/20 hover:bg-violet-600/5 cursor-pointer transition select-none text-left"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-200 text-xs group-hover:text-white transition capitalize">
                      {item.title}
                    </span>
                    <span className="text-[8px] font-bold uppercase tracking-wider bg-violet-500/10 text-violet-400 border border-violet-500/20 px-2 py-0.5 rounded-lg select-none">
                      {item.type}
                    </span>
                  </div>
                  {item.snippet && (
                    <span className="text-[10px] text-zinc-500 font-mono mt-1 group-hover:text-slate-400 line-clamp-1">
                      {item.snippet}
                    </span>
                  )}
                </div>
              ))}
              {filteredSearchResults.length === 0 && (
                <div className="py-8 text-center text-zinc-500 text-xs font-sans">
                  No math cards or labels match your current filter query.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
