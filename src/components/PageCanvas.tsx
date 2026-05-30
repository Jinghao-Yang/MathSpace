import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Tldraw } from 'tldraw';
import 'tldraw/tldraw.css';
// @ts-ignore
import d from 'datascript';
import { CustomBlockUtil, setEditingBlockId } from '../tldraw/CustomBlockUtil';
import { getConn, subscribeToDb, undo, redo } from '../db/init';
import { 
  Search, 
  ChevronRight, 
  X, 
  ArrowUpRight, 
  RotateCcw, 
  RotateCw, 
  MousePointer2, 
  Cable, 
  Hand, 
  Eraser, 
  Plus, 
  ZoomIn, 
  ZoomOut, 
  Maximize, 
  Trash2, 
  Download, 
  Sigma,
  BookOpen
} from 'lucide-react';

const SHAPE_UTILS = [CustomBlockUtil];

interface PageCanvasProps {
  pageId: string;
  onSwitchMode: (mode: 'page' | 'canvas') => void;
}

export const PageCanvas: React.FC<PageCanvasProps> = ({
  pageId,
  onSwitchMode,
}) => {
  const [editor, setEditor] = useState<any>(null);
  const [db, setDb] = useState<any>(null);
  const isSyncingRef = useRef(false);

  // Search Command Palette
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Selected details
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [selectedArrow, setSelectedArrow] = useState<any | null>(null);
  const [arrowTooltipPos, setArrowTooltipPos] = useState<{ x: number, y: number } | null>(null);

  // Custom tool track state and camera magnification representation
  const [currentTool, setCurrentTool] = useState('select');
  const [zoomPercent, setZoomPercent] = useState(100);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => {
    try {
      const conn = getConn();
      setDb(d.db(conn));
      const unsubscribe = subscribeToDb((newDb) => {
        setDb(newDb);
      });
      return unsubscribe;
    } catch (e) {
      console.error(e);
    }
  }, []);

  // Sync zoom percentage and active tool choice
  useEffect(() => {
    if (!editor) return;

    const interval = setInterval(() => {
      try {
        if (editor.getCurrentToolId() !== currentTool) {
          setCurrentTool(editor.getCurrentToolId());
        }
      } catch (_) {}
    }, 150);

    const updateCanvasStates = () => {
      try {
        setZoomPercent(Math.round(editor.getZoomLevel() * 100));
        setCurrentTool(editor.getCurrentToolId());
      } catch (_) {}
    };

    editor.on('change', updateCanvasStates);
    updateCanvasStates();

    return () => {
      clearInterval(interval);
      editor.off('change', updateCanvasStates);
    };
  }, [editor, currentTool]);

  // Monitor selection edits to determine focused block or arrow
  useEffect(() => {
    if (!editor) return;

    const handleSelection = () => {
      const selected = editor.getSelectedShapeIds();
      if (selected.length === 1) {
        const shape = editor.getShape(selected[0]);
        if (shape) {
          if (shape.type === 'block') {
            setSelectedBlockId(shape.props.blockId);
            setSelectedArrow(null);
            setArrowTooltipPos(null);
            return;
          } else if (shape.type === 'arrow') {
            setSelectedArrow(shape);
            setSelectedBlockId(null);
            const bounds = editor.getShapePageBounds(shape.id);
            if (bounds) {
              const centerPage = {
                x: bounds.x + bounds.w / 2,
                y: bounds.y + bounds.h / 2,
              };
              const viewportPoint = editor.pageToViewport(centerPage);
              setArrowTooltipPos(viewportPoint);
            }
            return;
          }
        }
      }
      setSelectedBlockId(null);
      setSelectedArrow(null);
      setArrowTooltipPos(null);
    };

    editor.on('change', handleSelection);
    return () => {
      editor.off('change', handleSelection);
    };
  }, [editor]);

  // Support jumping to blocks globally (e.g. from Tiptap reference links)
  useEffect(() => {
    const handleNavigationEvent = (e: any) => {
      const targetBlockId = e.detail?.blockId;
      if (targetBlockId) {
        handleFocusBlock(targetBlockId);
      }
    };
    window.addEventListener('navigate-to-block', handleNavigationEvent);
    return () => {
      window.removeEventListener('navigate-to-block', handleNavigationEvent);
    };
  }, [editor, db]);

  const connectedBlocks = useMemo(() => {
    if (!db || !selectedArrow) return null;
    const startBind = selectedArrow.props?.start?.boundShapeId;
    const endBind = selectedArrow.props?.end?.boundShapeId;
    if (!startBind || !endBind) return null;

    const srcId = startBind.replace('shape:', '');
    const destId = endBind.replace('shape:', '');

    let srcTitle = 'Untitled Block';
    let destTitle = 'Untitled Block';

    try {
      const qSrc = d.q(`[:find ?title :where [?e "block/id" "${srcId}"] [?e "block/title" ?title]]`, db);
      const qDest = d.q(`[:find ?title :where [?e "block/id" "${destId}"] [?e "block/title" ?title]]`, db);
      if (qSrc.length > 0) srcTitle = qSrc[0][0];
      if (qDest.length > 0) destTitle = qDest[0][0];
      return { srcTitle, destTitle };
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [db, selectedArrow]);

  // Trace selected block's page path
  const breadcrumbs = useMemo(() => {
    if (!db || !selectedBlockId) return [];
    try {
      const trail: { id: string; title: string }[] = [];
      const visited = new Set<string>();

      const traverse = (blockUuid: string) => {
        if (visited.has(blockUuid)) return;
        visited.add(blockUuid);

        const res = d.q(`[:find ?e :where [?e "block/id" "${blockUuid}"]]`, db);
        if (res.length === 0) return;
        const eId = res[0][0];
        const entity = d.pull(db, '[*]', eId);
        const title = entity['block/title'] || 'Untitled Block';
        trail.unshift({ id: blockUuid, title });

        const parentRes = d.q(
          `[:find ?parentId :where [?parent "link/from" ${eId}] [?parent "block/id" ?parentId]]`,
          db
        );
        if (parentRes.length > 0) {
          traverse(parentRes[0][0]);
        }
      };

      traverse(selectedBlockId);
      return trail;
    } catch (err) {
      console.error('Failed to construct breadcrumbs', err);
      return [];
    }
  }, [db, selectedBlockId]);

  // Pan to a specific block on the Canvas
  const handleFocusBlock = (targetId: string) => {
    if (!editor) return;
    const shapeId = `shape:${targetId}`;
    try {
      editor.select(shapeId);
      editor.zoomToSelection();
      setShowSearch(false);
    } catch (e) {
      console.error('Shape not found on canvas to zoomTo', e);
    }
  };

  // Query parent entity for matching id
  const pageEntity = useMemo(() => {
    if (!db) return null;
    try {
      const results = d.q(`[:find ?e :where [?e "block/id" "${pageId}"]]`, db);
      if (results.length > 0) {
        return d.pull(db, ['*'], results[0][0]);
      }
      return null;
    } catch (_) {
      return null;
    }
  }, [db, pageId]);

  // List of page's blocks for search
  const pageBlocksList = useMemo(() => {
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
  }, [db, pageEntity]);

  const filteredSearchItems = useMemo(() => {
    if (!searchQuery) return pageBlocksList;
    const q = searchQuery.toLowerCase();
    return pageBlocksList.filter(
      (item: any) =>
        item.title.toLowerCase().includes(q) ||
        item.snippet.toLowerCase().includes(q)
    );
  }, [pageBlocksList, searchQuery]);

  // Helper action to programmatically add and center new math box on the screen
  const handleAddBlockInCenter = () => {
    if (!editor || !pageEntity) return;
    try {
      const conn = getConn();
      const bounds = editor.getViewportPageBounds();
      const spawnWidth = 320;
      const spawnHeight = 160;
      const x = bounds.x + bounds.w / 2 - spawnWidth / 2;
      const y = bounds.y + bounds.h / 2 - spawnHeight / 2;

      const uuid = `block-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
      const pageEid = pageEntity[':db/id'];

      d.transact(conn, [
        {
          'block/id': uuid,
          'block/type': 'general',
          'block/content': '',
          'block/title': 'New block',
          'block/parent': pageEid,
          'block/order': pageBlocksList.length,
          'block/x': x,
          'block/y': y,
          'block/w': spawnWidth,
          'block/h': spawnHeight,
        }
      ]);

      editor.select(`shape:${uuid}` as any);
      requestAnimationFrame(() => {
        setEditingBlockId(uuid);
      });
    } catch (err) {
      console.error('Failed generating block in view center:', err);
    }
  };

  const handleClearBoardActual = () => {
    if (!editor || !pageEntity) return;
    try {
      const conn = getConn();
      const pageEid = pageEntity[':db/id'];
      const currentDb = d.db(conn);
      
      const results = d.q(`[:find ?e :where [?e "block/parent" ${pageEid}]]`, currentDb);
      const shapesOnCanvas = editor.getCurrentPageShapes();

      if (results.length > 0) {
        const retractAll = results.map(([entId]: any) => ([':db.fn/retractEntity', entId]));
        d.transact(conn, retractAll);
      }

      const shapesToDelete = shapesOnCanvas.map((s: any) => s.id);
      if (shapesToDelete.length > 0) {
        editor.deleteShapes(shapesToDelete);
      }
    } catch (err) {
      console.error('Failed clearing page blocks', err);
    }
  };

  // Synchronize loaded DataScript blocks with tldraw reactively (handles adds, updates, deletes, and history movements like undo/redo)
  useEffect(() => {
    if (!editor || !pageEntity) return;

    interface BlockInfo {
      x: number;
      y: number;
      w: number;
      h: number;
    }

    interface BlockShape {
      id: string;
      type: string;
      x: number;
      y: number;
      props: {
        blockId?: string;
        w?: number;
        h?: number;
        [key: string]: any;
      };
    }

    const syncCanvasWithDb = (currentDb: any) => {
      if (!currentDb) return;
      if (isSyncingRef.current) return;
      
      isSyncingRef.current = true;
      try {
        const pageEid = pageEntity[':db/id'];
        
        // Query only this page's child blocks
        const results = d.q(
          `[:find ?id ?x ?y ?w ?h :where [?e "block/parent" ${pageEid}] [?e "block/id" ?id] [?e "block/x" ?x] [?e "block/y" ?y] [?e "block/w" ?w] [?e "block/h" ?h]]`,
          currentDb
        );

        const dbBlocks = new Map<string, BlockInfo>();
        results.forEach(([id, x, y, w, h]: [string, number, number, number, number]) => {
          dbBlocks.set(id, { x, y, w, h });
        });

        const shapesOnCanvas = editor.getCurrentPageShapes().filter((s: any): s is BlockShape => s.type === 'block');
        
        // Create Map of canvas shapes for O(1) lookups
        const canvasShapesMap = new Map<string, BlockShape>();
        const shapesToDelete: string[] = [];

        shapesOnCanvas.forEach((shape) => {
          const blockId = shape.props?.blockId;
          if (blockId) {
            if (dbBlocks.has(blockId)) {
              canvasShapesMap.set(blockId, shape);
            } else {
              shapesToDelete.push(shape.id);
            }
          }
        });

        // Delete shapes on canvas that no longer exist in page's blocks
        if (shapesToDelete.length > 0) {
          editor.deleteShapes(shapesToDelete);
        }

        // Add or update shapes matching parent page alignment
        const shapesToCreate: any[] = [];
        const shapesToUpdate: any[] = [];

        dbBlocks.forEach((info, id) => {
          const shapeId = `shape:${id}`;
          const existingShape = canvasShapesMap.get(id);

          if (!existingShape) {
            shapesToCreate.push({
              id: shapeId,
              type: 'block',
              x: info.x,
              y: info.y,
              props: {
                blockId: id,
                w: info.w,
                h: info.h,
              },
            });
          } else {
            const diffX = Math.abs(existingShape.x - info.x) > 0.1;
            const diffY = Math.abs(existingShape.y - info.y) > 0.1;
            const diffW = Math.abs((existingShape.props.w || 0) - info.w) > 0.1;
            const diffH = Math.abs((existingShape.props.h || 0) - info.h) > 0.1;

            if (diffX || diffY || diffW || diffH) {
              shapesToUpdate.push({
                id: shapeId,
                x: info.x,
                y: info.y,
                props: {
                  ...existingShape.props,
                  w: info.w,
                  h: info.h,
                },
              });
            }
          }
        });

        // Batch operations for better performance
        if (shapesToCreate.length > 0) {
          editor.createShapes(shapesToCreate);
        }
        if (shapesToUpdate.length > 0) {
          editor.updateShapes(shapesToUpdate);
        }
      } catch (err) {
        console.error('PageCanvas relative alignment sync failed', err);
      } finally {
        isSyncingRef.current = false;
      }
    };

    try {
      const conn = getConn();
      syncCanvasWithDb(d.db(conn));
    } catch (e) {
      console.error(e);
    }

    const unsubscribeDb = subscribeToDb((newDb) => {
      syncCanvasWithDb(newDb);
    });

    // Double click to create on empty canvas
    const handleEvent = (event: any) => {
      if (event.name === 'double_click' && event.target === 'canvas') {
        const point = editor.inputs.currentPagePoint;
        const uuid = `block-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
        
        const spawnWidth = 320;
        const spawnHeight = 160;
        const x = point.x - spawnWidth / 2;
        const y = point.y - spawnHeight / 2;

        try {
          const conn = getConn();
          const pageEid = pageEntity[':db/id'];
          d.transact(conn, [
            {
              'block/id': uuid,
              'block/type': 'general',
              'block/content': '',
              'block/title': 'New block',
              'block/parent': pageEid,
              'block/order': pageBlocksList.length,
              'block/x': x,
              'block/y': y,
              'block/w': spawnWidth,
              'block/h': spawnHeight,
            }
          ]);

          editor.select(`shape:${uuid}` as any);
          requestAnimationFrame(() => {
            setEditingBlockId(uuid);
          });
        } catch (err) {
          console.error('Failed to transactionally spawn block:', err);
        }
      }
    };

    editor.on('event', handleEvent);
    const unsubscribeEvent = () => {
      editor.off('event', handleEvent);
    };

    const handleStoreChange = (event: any) => {
      if (isSyncingRef.current) return;
      if (event.source !== 'user') return;

      const conn = getConn();
      const currentDb = d.db(conn);

      if (event.changes && event.changes.updated) {
        const updates: any[] = [];
        Object.values(event.changes.updated).forEach(([prev, curr]: any) => {
          if (curr.type === 'block') {
            const blockId = curr.props.blockId;
            updates.push({
              'block/id': blockId,
              'block/x': curr.x,
              'block/y': curr.y,
              'block/w': curr.props.w,
              'block/h': curr.props.h,
            });
          }

          if (curr.type === 'arrow') {
            const startBind = curr.props?.start?.boundShapeId;
            const endBind = curr.props?.end?.boundShapeId;
            if (startBind && endBind && curr.props?.start?.type === 'binding' && curr.props?.end?.type === 'binding') {
              const srcId = startBind.replace('shape:', '');
              const destId = endBind.replace('shape:', '');
              try {
                const hasStart = d.q(`[:find ?e :where [?e "block/id" "${srcId}"]]`, currentDb).length > 0;
                const hasEnd = d.q(`[:find ?e :where [?e "block/id" "${destId}"]]`, currentDb).length > 0;
                if (hasStart && hasEnd) {
                  const alreadyLinked = d.q(`[:find ?e :where [?e "block/id" "${srcId}"] [?e "link/from" ?target] [?target "block/id" "${destId}"]]`, currentDb).length > 0;
                  if (!alreadyLinked) {
                    d.transact(conn, [
                      { 'block/id': srcId, 'link/from': ['block/id', destId] },
                      { 'block/id': destId, 'link/to': ['block/id', srcId] }
                    ]);
                  }
                }
              } catch (err) {
                console.error(err);
              }
            }
          }
        });

        if (updates.length > 0) {
          try {
            d.transact(conn, updates);
          } catch (txErr) {
            console.error(txErr);
          }
        }
      }

      if (event.changes && event.changes.added) {
        Object.values(event.changes.added).forEach((shape: any) => {
          if (shape.type === 'arrow') {
            const startBind = shape.props?.start?.boundShapeId;
            const endBind = shape.props?.end?.boundShapeId;
            if (startBind && endBind && shape.props?.start?.type === 'binding' && shape.props?.end?.type === 'binding') {
              const srcId = startBind.replace('shape:', '');
              const destId = endBind.replace('shape:', '');
              try {
                const hasStart = d.q(`[:find ?e :where [?e "block/id" "${srcId}"]]`, currentDb).length > 0;
                const hasEnd = d.q(`[:find ?e :where [?e "block/id" "${destId}"]]`, currentDb).length > 0;
                if (hasStart && hasEnd) {
                  const alreadyLinked = d.q(`[:find ?e :where [?e "block/id" "${srcId}"] [?e "link/from" ?target] [?target "block/id" "${destId}"]]`, currentDb).length > 0;
                  if (!alreadyLinked) {
                    d.transact(conn, [
                      { 'block/id': srcId, 'link/from': ['block/id', destId] },
                      { 'block/id': destId, 'link/to': ['block/id', srcId] }
                    ]);
                  }
                }
              } catch (err) {
                console.error(err);
              }
            }
          }
        });
      }
    };

    const unsubscribeStore = editor.store.listen(handleStoreChange, { scope: 'all' });

    return () => {
      unsubscribeDb();
      unsubscribeEvent();
      unsubscribeStore();
    };
  }, [editor, pageEntity, pageBlocksList]);

  // Command handlers
  const handleUndo = () => undo();
  const handleRedo = () => redo();

  const handleToolSelect = (toolId: string) => {
    if (!editor) return;
    try {
      editor.setCurrentTool(toolId);
    } catch (_) {}
  };

  const handleZoomIn = () => {
    if (!editor) return;
    try {
      editor.zoomIn();
    } catch (_) {}
  };

  const handleZoomOut = () => {
    if (!editor) return;
    try {
      editor.zoomOut();
    } catch (_) {}
  };

  const handleZoomReset = () => {
    if (!editor) return;
    try {
      editor.zoomToFit();
    } catch (_) {}
  };

  return (
    <div className="flex-1 h-full flex flex-col relative bg-[#141416] select-none text-white overflow-hidden">
      
      {/* Canvas Header/Breadcrumbs */}
      <div className="absolute top-4 left-4 z-40 flex items-center gap-2 max-w-[calc(100%-350px)]">
        <div className="flex items-center gap-1.5 px-4 py-2.5 bg-[#171719]/90 border border-white/5 shadow-2xl rounded-2xl backdrop-blur-md">
          <BookOpen className="w-4 h-4 text-violet-400 shrink-0" />
          <span className="text-[11px] font-bold text-slate-100 uppercase tracking-widest leading-none">
            {pageEntity?.['block/title'] || 'Untitled Page'}
          </span>
          {breadcrumbs.length > 0 && <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />}
          {breadcrumbs.map((crumb, index) => (
            <React.Fragment key={crumb.id}>
              {index > 0 && <ChevronRight className="w-3 h-3 text-slate-600 shrink-0" />}
              <span 
                onClick={() => handleFocusBlock(crumb.id)}
                className="text-[11px] font-semibold text-slate-400 hover:text-white cursor-pointer transition capitalize truncate max-w-32 leading-none"
              >
                {crumb.title}
              </span>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Floating Canvas/Document Switch Button */}
      <div className="absolute top-4 right-4 z-40 flex items-center gap-2">
        <button
          onClick={() => onSwitchMode('page')}
          className="flex items-center gap-1.5 py-2.5 px-4 rounded-xl text-xs font-semibold bg-[#1c1c1e] hover:bg-[#252528] text-violet-400 border border-violet-500/10 hover:border-violet-500/20 shadow-2xl active:scale-95 transition"
        >
          <BookOpen className="w-4 h-4" /> Page Mode
        </button>

        <button
          onClick={() => setShowSearch(true)}
          className="p-3 bg-[#171719]/90 hover:bg-[#202022] border border-white/5 hover:border-white/10 rounded-2xl text-slate-300 shadow-2xl transition"
          title="Search elements on board"
        >
          <Search className="w-4 h-4" />
        </button>
      </div>

      {/* Whiteboard Workspace Drawing Canvas Layout */}
      <div className="flex-1 w-full h-full relative z-0">
        {/* Empty Page Guide */}
        {pageBlocksList.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div className="text-center pointer-events-auto">
              <h3 className="text-sm font-semibold text-white mb-2">This math board is empty</h3>
              <p className="text-xs text-zinc-500 mb-4 max-w-xs">
                Click the &quot;Math Card&quot; button below, or double-click anywhere on the canvas to add a block.
              </p>
            </div>
          </div>
        )}
        
        <Tldraw
          shapeUtils={SHAPE_UTILS}
          hideUi
          onMount={(editorOnMount: any) => {
            setEditor(editorOnMount);
            try {
              editorOnMount.setCurrentTool('select');
              editorOnMount.setColorMode('dark');
              editorOnMount.zoomToFit();
            } catch (_) {}
          }}
        />
      </div>

      {/* Dynamic Floating Quick-Bar Controls */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center shadow-3xl border border-white/5 rounded-2xl overflow-hidden bg-[#171719]/95 backdrop-blur-md px-1.5 py-1.5 space-x-1.5">
        <button
          onClick={() => handleToolSelect('select')}
          style={{ height: '36px' }}
          className={`flex items-center justify-center px-3.5 rounded-xl transition ${
            currentTool === 'select'
              ? 'bg-violet-600/20 text-violet-400 border border-violet-500/25'
              : 'text-slate-400 hover:bg-white/5 border border-transparent'
          }`}
          title="Selection tool (V)"
        >
          <MousePointer2 className="w-4 h-4 mr-1.5" />
          <span className="text-[11px] font-bold uppercase tracking-wider font-sans">Select</span>
        </button>

        <button
          onClick={() => handleToolSelect('arrow')}
          style={{ height: '36px' }}
          className={`flex items-center justify-center px-3.5 rounded-xl transition ${
            currentTool === 'arrow'
              ? 'bg-violet-600/20 text-violet-400 border border-violet-500/25'
              : 'text-slate-400 hover:bg-white/5 border border-transparent'
          }`}
          title="Arrow line linkage tool (L)"
        >
          <Cable className="w-4 h-4 mr-1.5" />
          <span className="text-[11px] font-bold uppercase tracking-wider font-sans">Link</span>
        </button>

        <button
          onClick={() => handleToolSelect('hand')}
          style={{ height: '36px' }}
          className={`flex items-center justify-center px-3.5 rounded-xl transition ${
            currentTool === 'hand'
              ? 'bg-violet-600/20 text-violet-400 border border-violet-500/25'
              : 'text-slate-400 hover:bg-white/5 border border-transparent'
          }`}
          title="Pan board space hand (H)"
        >
          <Hand className="w-4 h-4 mr-1.5" />
          <span className="text-[11px] font-bold uppercase tracking-wider font-sans">Pan</span>
        </button>

        <div className="w-px h-6 bg-white/10" />

        <button
          onClick={handleAddBlockInCenter}
          style={{ height: '36px' }}
          className="flex items-center px-3.5 rounded-xl text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300 border border-transparent hover:border-emerald-500/20 transition active:scale-95"
          title="Spawn mathematical card block"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          <span className="text-[11px] font-bold uppercase tracking-wider font-sans">Math Card</span>
        </button>
      </div>

      {/* Bottom Side Tools Panel */}
      <div className="absolute bottom-6 right-6 z-40 flex flex-col items-end gap-2 text-slate-350 select-none">
        
        {/* Connection Tooltip */}
        {connectedBlocks && arrowTooltipPos && (
          <div 
            className="absolute p-3 rounded-2xl bg-[#141416]/95 border border-violet-500/10 shadow-2xl text-[11px] font-semibold text-slate-300 flex items-center gap-2 transform -translate-y-24 shrink-0 transition"
            style={{ top: `${arrowTooltipPos.y}px`, left: `${arrowTooltipPos.x - 120}px` }}
          >
            <span className="text-violet-400">{connectedBlocks.srcTitle}</span>
            <span className="text-slate-600">→</span>
            <span className="text-emerald-400">{connectedBlocks.destTitle}</span>
          </div>
        )}

        <div className="flex bg-[#171719]/90 border border-white/5 shadow-2xl rounded-2xl backdrop-blur-md p-1 items-center gap-1">
          <button 
            onClick={handleUndo} 
            className="p-2 hover:bg-white/5 rounded-xl transition" 
            title="Undo (Ctrl+Z)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button 
            onClick={handleRedo} 
            className="p-2 hover:bg-white/5 rounded-xl transition" 
            title="Redo (Ctrl+Shift+Z)"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
          
          <div className="w-px h-4 bg-white/10 mx-1" />

          <button 
            onClick={handleZoomOut} 
            className="p-2 hover:bg-white/5 rounded-xl transition" 
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span 
            onClick={handleZoomReset}
            className="text-[10px] font-mono hover:text-white cursor-pointer px-1.5 select-none leading-none"
            title="Click to zoom fit entire layout"
          >
            {zoomPercent}%
          </span>
          <button 
            onClick={handleZoomIn} 
            className="p-2 hover:bg-white/5 rounded-xl transition" 
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-4 bg-white/10 mx-1" />

          <button 
            onClick={() => setShowClearConfirm(true)} 
            className="p-2 hover:bg-red-500/15 hover:text-red-400 rounded-xl transition" 
            title="Wipe canvas elements"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Search Palette Dialog Modal */}
      {showSearch && (
        <div className="absolute inset-0 bg-[#0c0c0e]/80 backdrop-blur-sm z-50 flex items-start justify-center pt-24 pl-24 animate-fade-in">
          <div className="w-full max-w-xl bg-[#141416]/95 border border-white/10 rounded-2xl shadow-3xl overflow-hidden animate-zoom-in">
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
              <span className="text-[11px] font-bold text-violet-400 uppercase tracking-widest flex items-center gap-1.5">
                <Search className="w-3.5 h-3.5" /> Search page formulas
              </span>
              <button 
                onClick={() => setShowSearch(false)}
                className="p-1 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-3">
              <input
                type="text"
                placeholder="Type formula text or environment reference block title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
                className="w-full bg-[#1b1b1d] border border-white/10 focus:border-violet-500 rounded-xl p-3 text-slate-100 text-xs focus:outline-none focus:ring-1 focus:ring-violet-500 placeholder-slate-500"
              />
            </div>

            <div className="max-h-72 overflow-y-auto px-3 pb-3 space-y-1">
              {filteredSearchItems.map((item: any) => (
                <div
                  key={item.id}
                  onClick={() => handleFocusBlock(item.id)}
                  className="group flex flex-col p-3 rounded-xl border border-transparent hover:border-violet-500/20 hover:bg-violet-600/5 cursor-pointer transition select-none text-left"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-200 text-xs group-hover:text-white transition">
                      {item.title}
                    </span>
                    <span className="text-[8px] font-bold uppercase tracking-wider bg-violet-500/10 text-violet-400 border border-violet-500/20 px-2 py-0.5 rounded-lg">
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
              {filteredSearchItems.length === 0 && (
                <div className="py-8 text-center text-zinc-500 text-xs">
                  No formula cards match your current command query.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Clear Confirmation Dialog */}
      {showClearConfirm && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#161618] border border-zinc-800 rounded-2xl p-5 shadow-3xl text-center select-none">
            <h3 className="font-bold text-white text-sm mb-1.5">Wipe current canvas?</h3>
            <p className="text-zinc-400 text-xs leading-relaxed mb-4">
              This action will delete all mathematician board cards belonging to this page. You can undo this action. Are you sure?
            </p>
            <div className="flex items-center gap-2 justify-center">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="py-2 px-4 rounded-xl text-xs font-semibold bg-[#212124] hover:bg-zinc-850 text-slate-300 border border-[#2d2d31] transition"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleClearBoardActual();
                  setShowClearConfirm(false);
                }}
                className="py-2 px-4 rounded-xl text-xs font-semibold bg-red-650 hover:bg-red-550 text-white shadow-md shadow-red-500/10 transition"
              >
                Confirm wipe
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
