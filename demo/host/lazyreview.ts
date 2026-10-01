/**
 * The "Review" deck's editor, added the first time the visitor opens that deck.
 *
 * The renderer keeps every deck mounted, so an editor pane seeded into Review
 * would pull in Monaco and its TypeScript worker (about 2.6 MB gzipped) on
 * every page load, for a deck most visitors never open. The seed ships Review
 * with its terminal only; this puts the editor back, exactly as seeded, when
 * the deck is first shown. After that it's an ordinary pane in the saved session.
 */
import type { DemoStorage, LayoutNode, TdStores } from '../backend/contracts'
import { DECK, PANE, REVIEW_FILES, REVIEW_LAYOUT } from '../scenario/session'

const DONE_KEY = 'review-editor-added'

export function deferReviewEditor(stores: TdStores, storage: DemoStorage): () => void {
  const ws = stores.workspace.useWorkspace

  const maybeAdd = (): void => {
    if (storage.get<boolean>(DONE_KEY)) return
    const s = ws.getState()
    if (s.activeTabId !== DECK.review) return
    storage.set(DONE_KEY, true)
    const tab = s.tabs.find((t) => t.id === DECK.review)
    // Already there (a restored session), or the visitor rearranged the deck: leave it alone.
    if (!tab || s.panes[PANE.editor] || !(tab.layout.type === 'pane' && tab.layout.paneId === PANE.reviewShell)) return
    ws.setState((prev) => ({
      panes: { ...prev.panes, [PANE.editor]: { id: PANE.editor, kind: 'editor', name: 'Editor 1' } },
      tabs: prev.tabs.map((t) => (t.id === DECK.review ? { ...t, layout: REVIEW_LAYOUT as LayoutNode, activePaneId: PANE.editor } : t))
    }))
    stores.editor.useEditorStore.setState((prev) => ({
      filesByPane: { ...prev.filesByPane, [PANE.editor]: [...REVIEW_FILES] },
      activeByPane: { ...prev.activeByPane, [PANE.editor]: REVIEW_FILES[0] }
    }))
  }

  maybeAdd()
  return ws.subscribe(maybeAdd)
}
