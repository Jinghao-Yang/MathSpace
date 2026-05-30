import React, { useState, useEffect, useMemo } from 'react';
// @ts-ignore
import d from 'datascript';
import { getConn, subscribeToDb } from '../db/init';
import { 
  Plus, 
  ChevronLeft, 
  ChevronRight, 
  BookOpen, 
  Trash2,
  List,
  Edit2
} from 'lucide-react';

interface PageSidebarProps {
  activePageId: string | null;
  onSelectPage: (id: string) => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

export const PageSidebar: React.FC<PageSidebarProps> = ({
  activePageId,
  onSelectPage,
  isOpen,
  setIsOpen,
}) => {
  const [db, setDb] = useState<any>(null);
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [editTitleValue, setEditTitleValue] = useState('');

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

  // Query all pages (blocks with type 'page')
  const pagesList = useMemo(() => {
    if (!db) return [];
    try {
      const results = d.q(
        '[:find ?id ?title :where [?e "block/type" "page"] [?e "block/id" ?id] [?e "block/title" ?title]]',
        db
      );
      return results.map(([id, title]: any) => ({
        id,
        title: title || 'Untitled Page',
      })).sort((a: any, b: any) => a.title.localeCompare(b.title));
    } catch (err) {
      console.error('Failed to query pages', err);
      return [];
    }
  }, [db]);

  const handleCreateNewPage = () => {
    try {
      const conn = getConn();
      const newPageId = `block-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
      d.transact(conn, [
        {
          'block/id': newPageId,
          'block/type': 'page',
          'block/title': 'Untitled Page',
          'block/content': '',
          'block/order': pagesList.length,
        }
      ]);
      onSelectPage(newPageId);
    } catch (err) {
      console.error('Failed to create page', err);
    }
  };

  const handleDeletePage = (e: React.MouseEvent, pageId: string) => {
    e.stopPropagation();
    
    // Prevent deleting the last remaining page
    if (pagesList.length <= 1) {
      alert("Cannot delete the last remaining page.");
      return;
    }

    if (confirm("Are you sure you want to delete this page and all of its canvas elements?")) {
      try {
        const conn = getConn();
        const currentDb = d.db(conn);

        // Find parent and child entities to retract
        const pageEidRes = d.q(`[:find ?e :where [?e "block/id" "${pageId}"]]`, currentDb);
        const txs: any[] = [];
        
        if (pageEidRes.length > 0) {
          const pageEid = pageEidRes[0][0];
          
          // Retract all block items belonging to this page
          const childBlocksRes = d.q(
            `[:find ?child :where [?child "block/parent" ${pageEid}]]`,
            currentDb
          );
          childBlocksRes.forEach(([childEid]: any) => {
            txs.push([':db.fn/retractEntity', childEid]);
          });

          // Retract page entity itself
          txs.push([':db.fn/retractEntity', pageEid]);
          d.transact(conn, txs);

          // If the active page was deleted, switch to the first remaining page
          if (activePageId === pageId) {
            const remaining = pagesList.filter(p => p.id !== pageId);
            if (remaining.length > 0) {
              onSelectPage(remaining[0].id);
            }
          }
        }
      } catch (err) {
        console.error('Failed to delete page', err);
      }
    }
  };

  const startRename = (pageId: string, currentTitle: string) => {
    setEditingPageId(pageId);
    setEditTitleValue(currentTitle);
  };

  const handleRenameSubmit = (pageId: string) => {
    if (!editTitleValue.trim()) return;
    try {
      const conn = getConn();
      d.transact(conn, [
        {
          'block/id': pageId,
          'block/title': editTitleValue.trim(),
        }
      ]);
      setEditingPageId(null);
    } catch (err) {
      console.error('Failed to rename page', err);
    }
  };

  return (
    <div 
      className={`relative h-full transition-all duration-300 flex flex-col bg-[#111112] border-r border-[#262629] ${
        isOpen ? 'w-[250px]' : 'w-0 border-r-0 overflow-hidden'
      }`}
    >
      {isOpen && (
        <div className="flex-1 flex flex-col h-full select-none">
          {/* Sidebar Header */}
          <div className="h-14 px-4 border-b border-[#262629] flex items-center justify-between">
            <span className="text-stone-300 font-bold tracking-tight text-xs uppercase flex items-center gap-1.5 font-sans">
              <BookOpen className="w-4 h-4 text-blue-400" /> Math Pages
            </span>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 text-slate-400 hover:bg-white/5 rounded-lg transition"
              title="Collapse Sidebar"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Add Page */}
          <div className="px-3 py-2">
            <button
              onClick={handleCreateNewPage}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-zinc-800 hover:bg-zinc-750 border border-white/5 text-slate-200 font-semibold text-xs rounded-xl hover:text-white transition active:scale-98 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> New Document page
            </button>
          </div>

          {/* Page list scrolling viewport */}
          <div className="flex-1 overflow-y-auto px-2 space-y-0.5 py-1">
            {pagesList.map((page) => {
              const isActive = page.id === activePageId;
              const isEditing = page.id === editingPageId;

              return (
                <div
                  key={page.id}
                  onClick={() => onSelectPage(page.id)}
                  className={`group relative flex items-center justify-between py-2 px-3 rounded-lg cursor-pointer select-none transition ${
                    isActive 
                      ? 'bg-white/5 text-slate-100 border border-white/10 shadow-sm' 
                      : 'text-slate-400 hover:bg-white/3 text-slate-300 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0 pr-6">
                    <List className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-violet-400' : 'text-slate-500'}`} />
                    {isEditing ? (
                      <input
                        type="text"
                        value={editTitleValue}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setEditTitleValue(e.target.value)}
                        onBlur={() => handleRenameSubmit(page.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleRenameSubmit(page.id);
                          } else if (e.key === 'Escape') {
                            setEditingPageId(null);
                          }
                        }}
                        autoFocus
                        className="w-full bg-[#18181b] border border-violet-500 rounded px-1.5 py-0.5 text-xs font-semibold text-white focus:outline-none"
                      />
                    ) : (
                      <span className="font-semibold text-xs leading-none truncate select-none">
                        {page.title}
                      </span>
                    )}
                  </div>

                  {/* Actions (Only show when block is hovered or active) */}
                  {!isEditing && (
                    <div className="absolute right-2 opacity-0 group-hover:opacity-100 flex items-center gap-1 transition">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          startRename(page.id, page.title);
                        }}
                        className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white transition cursor-pointer"
                        title="Rename page"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => handleDeletePage(e, page.id)}
                        className="p-1 hover:bg-red-500/20 rounded text-slate-400 hover:text-red-400 transition cursor-pointer"
                        title="Delete page"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="p-3 border-t border-[#262629] text-[10px] text-zinc-500 font-mono text-center">
            Mathematician Workspace
          </div>
        </div>
      )}
    </div>
  );
};
