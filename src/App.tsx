import React, { useState, useEffect } from 'react';
// @ts-ignore
import d from 'datascript';
import { getConn, initDatabase, subscribeToDb } from './db/init';
import { PageSidebar } from './components/PageSidebar';
import { PageEditor } from './components/PageEditor';
import { PageCanvas } from './components/PageCanvas';
import { Sigma, Menu } from 'lucide-react';

export default function App() {
  const [isDbLoaded, setIsDbLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'page' | 'canvas'>('page');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Initialize the persistent local-first in-memory DataScript database on start
  useEffect(() => {
    let active = true;
    async function setup() {
      try {
        await initDatabase();
        if (active) {
          const conn = getConn();
          const currentDb = d.db(conn);

          // Find first page to set as active
          const results = d.q('[:find ?id ?title :where [?e "block/type" "page"] [?e "block/id" ?id] [?e "block/title" ?title]]', currentDb);
          let firstPageId: string | null = null;
          if (results.length > 0) {
            const sorted = results.map(([id, title]: any) => ({ id, title })).sort((a: any, b: any) => a.title.localeCompare(b.title));
            firstPageId = sorted[0].id;
            setActivePageId(firstPageId);
          }

          // Dynamic migration/backward-compatibility: any blocks that have no parent, assign them to the Home/First Page
          if (firstPageId) {
            const firstPageEidRes = d.q(`[:find ?e :where [?e "block/id" "${firstPageId}"]]`, currentDb);
            if (firstPageEidRes.length > 0) {
              const pageEid = firstPageEidRes[0][0];
              const orphanedBlocks = d.q('[:find ?e :where [?e "block/id" ?id] [?e "block/type" ?type] [(not= ?type "page")] (not [?e "block/parent"])]', currentDb);
              
              if (orphanedBlocks.length > 0) {
                console.log(`Migrating ${orphanedBlocks.length} orphan blocks to page ${firstPageId}`);
                const txs = orphanedBlocks.map(([eid]: any) => ({
                  ':db/id': eid,
                  'block/parent': pageEid,
                }));
                d.transact(conn, txs);
              }
            }
          }

          setIsDbLoaded(true);
        }
      } catch (err) {
        console.error('Failed to boot DataScript engine', err);
        if (active) {
          setLoadError(String(err));
        }
      }
    }
    setup();
    return () => {
      active = false;
    };
  }, []);

  // Monitor pages list and fallback if current page disappears (deleted)
  useEffect(() => {
    if (!isDbLoaded) return;
    try {
      const handlePagesSync = (currentDb: any) => {
        const results = d.q('[:find ?id :where [?e "block/type" "page"] [?e "block/id" ?id]]', currentDb);
        const ids = results.map(([id]: any) => id);

        if (ids.length > 0) {
          if (!activePageId || !ids.includes(activePageId)) {
            setActivePageId(ids[0]);
          }
        } else {
          setActivePageId(null);
        }
      };

      handlePagesSync(d.db(getConn()));
      const unsub = subscribeToDb((newDb) => {
        handlePagesSync(newDb);
      });
      return unsub;
    } catch (err) {
      console.error(err);
    }
  }, [isDbLoaded, activePageId]);

  // Support bidirectional reference link jumping across all page modes
  useEffect(() => {
    if (!isDbLoaded) return;

    const handleNavigationEvent = (e: any) => {
      const targetBlockId = e.detail?.blockId;
      if (!targetBlockId) return;

      try {
        const conn = getConn();
        const currentDb = d.db(conn);

        // Find parent page ID of target block
        const parentRes = d.q(
          `[:find ?pageId :where [?b "block/id" "${targetBlockId}"] [?b "block/parent" ?pageEid] [?pageEid "block/id" ?pageId]]`,
          currentDb
        );

        if (parentRes.length > 0) {
          const targetPageId = parentRes[0][0];
          
          if (targetPageId !== activePageId) {
            setActivePageId(targetPageId);
          }

          // If in Page Mode, wait for render and scroll directly to block
          if (viewMode === 'page') {
            setTimeout(() => {
              const targetElement = document.getElementById(`block-container-${targetBlockId}`);
              if (targetElement) {
                targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Briefly blink/highlight target block
                targetElement.classList.add('ring-2', 'ring-blue-500/50');
                setTimeout(() => {
                  targetElement.classList.remove('ring-2', 'ring-blue-500/50');
                }, 1000);
              }
            }, 100);
          }
        }
      } catch (err) {
        console.error('Failed reference link navigation jump', err);
      }
    };

    window.addEventListener('navigate-to-block', handleNavigationEvent);
    return () => {
      window.removeEventListener('navigate-to-block', handleNavigationEvent);
    };
  }, [isDbLoaded, activePageId, viewMode]);

  if (loadError) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-stone-50 p-6 font-sans select-none">
        <div className="w-full max-w-md bg-white border border-red-200 shadow-xl rounded-2xl p-6 flex flex-col items-center text-center">
          <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center text-red-600 mb-4 font-mono font-bold">!</div>
          <h2 className="text-zinc-800 font-bold text-base mb-1">Boot sequence failure</h2>
          <p className="text-zinc-500 text-xs leading-relaxed mb-4">
            An error occurred while compiling or loading the in-memory DataScript database schema:
          </p>
          <code className="w-full bg-red-50 text-red-800/90 text-[11px] font-mono p-3 rounded-lg border border-red-100 overflow-x-auto text-left whitespace-pre">
            {loadError}
          </code>
        </div>
      </div>
    );
  }

  if (!isDbLoaded) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-[#fbfbf9] font-sans select-none animate-pulse">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-16 h-16 bg-white border border-zinc-200/80 shadow-md rounded-2xl flex items-center justify-center text-violet-700">
            <Sigma className="w-7 h-7" />
          </div>
          <div className="flex flex-col items-center space-y-1">
            <span className="text-zinc-800 text-xs font-bold uppercase tracking-widest font-sans">MathSpace</span>
            <span className="text-zinc-400 text-[10px] font-mono">Synthesizing local DataScript core...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen flex bg-[#0c0c0e] text-zinc-100 overflow-hidden font-sans">
      
      {/* Page Sidebar Drawer component */}
      <PageSidebar
        activePageId={activePageId}
        onSelectPage={setActivePageId}
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
      />

      {/* Main Work Area Viewports */}
      <div className="flex-1 flex flex-col h-full relative overflow-hidden">
        
        {/* Toggle Hamburger Button (Only visible if Sidebar is closed) */}
        {!isSidebarOpen && (
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="absolute top-4 left-4 z-40 p-2.5 bg-[#171719]/90 hover:bg-[#212124] border border-white/5 rounded-xl shadow-2xl text-slate-300 transition-all cursor-pointer"
            title="Open math pages sidebar"
          >
            <Menu className="w-4 h-4" />
          </button>
        )}

        {activePageId ? (
          viewMode === 'page' ? (
            <PageEditor
              pageId={activePageId}
              onSwitchMode={setViewMode}
            />
          ) : (
            <PageCanvas
              pageId={activePageId}
              onSwitchMode={setViewMode}
            />
          )
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-[#111112]">
            <span className="text-slate-500 font-mono text-xs">No active pages selected.</span>
          </div>
        )}
      </div>
    </div>
  );
}
