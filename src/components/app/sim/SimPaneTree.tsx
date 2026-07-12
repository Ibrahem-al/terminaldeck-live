import { useRef } from 'react'
import type { LayoutNode } from './types'
import { useSim } from './store'
import { SimPane } from './SimPane'

interface TreeProps {
  node: LayoutNode
  activePaneId: string
  canClose: boolean
}

export function SimPaneTree({ node, activePaneId, canClose }: TreeProps): React.JSX.Element | null {
  const { state } = useSim()

  if (node.type === 'leaf') {
    const pane = state.panes[node.paneId]
    if (!pane) return null
    return <SimPane pane={pane} active={pane.id === activePaneId} canClose={canClose} />
  }

  return <Split node={node} activePaneId={activePaneId} canClose={canClose} />
}

function Split({ node, activePaneId, canClose }: TreeProps): React.JSX.Element {
  const { dispatch } = useSim()
  const ref = useRef<HTMLDivElement>(null)
  if (node.type !== 'split') return <></>
  const row = node.dir === 'row'

  const onDown = (e: React.MouseEvent): void => {
    e.preventDefault()
    dispatch({ type: 'markTouched' })
    const move = (ev: MouseEvent): void => {
      const el = ref.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const ratio = row ? (ev.clientX - rect.left) / rect.width : (ev.clientY - rect.top) / rect.height
      dispatch({ type: 'setRatio', nodeId: node.id, ratio })
    }
    const up = (): void => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    document.body.style.userSelect = 'none'
    document.body.style.cursor = row ? 'col-resize' : 'row-resize'
  }

  return (
    <div ref={ref} className="flex h-full w-full min-h-0 min-w-0" style={{ flexDirection: row ? 'row' : 'column' }}>
      <div className="min-h-0 min-w-0" style={{ flexGrow: node.ratio, flexBasis: 0 }}>
        <SimPaneTree node={node.a} activePaneId={activePaneId} canClose={canClose} />
      </div>

      <div
        role="separator"
        aria-orientation={row ? 'vertical' : 'horizontal'}
        aria-label="Resize panes"
        onMouseDown={onDown}
        className={
          row
            ? 'group/divider flex w-2 shrink-0 cursor-col-resize items-stretch justify-center'
            : 'group/divider flex h-2 shrink-0 cursor-row-resize items-center justify-center'
        }
      >
        <span
          className={
            row
              ? 'w-px self-stretch bg-edge-2 transition-colors group-hover/divider:bg-accent/60'
              : 'h-px w-full bg-edge-2 transition-colors group-hover/divider:bg-accent/60'
          }
        />
      </div>

      <div className="min-h-0 min-w-0" style={{ flexGrow: 1 - node.ratio, flexBasis: 0 }}>
        <SimPaneTree node={node.b} activePaneId={activePaneId} canClose={canClose} />
      </div>
    </div>
  )
}
