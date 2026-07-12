import type { LayoutNode } from './types'

/** Monotonic id factory — stable within a page load, no RNG needed. */
let _seq = 0
export const uid = (prefix: string): string => `${prefix}-${++_seq}`

/** All pane ids referenced by a subtree, in visual (left→right, top→bottom) order. */
export function leafPaneIds(node: LayoutNode): string[] {
  if (node.type === 'leaf') return [node.paneId]
  return [...leafPaneIds(node.a), ...leafPaneIds(node.b)]
}

export function countLeaves(node: LayoutNode): number {
  return node.type === 'leaf' ? 1 : countLeaves(node.a) + countLeaves(node.b)
}

/** Replace the leaf for `paneId` with a split holding the old + a new leaf. */
export function splitLeaf(
  node: LayoutNode,
  paneId: string,
  dir: 'row' | 'col',
  newPaneId: string,
  before = false
): LayoutNode {
  if (node.type === 'leaf') {
    if (node.paneId !== paneId) return node
    const fresh: LayoutNode = { id: uid('leaf'), type: 'leaf', paneId: newPaneId }
    return {
      id: uid('split'),
      type: 'split',
      dir,
      ratio: 0.5,
      a: before ? fresh : node,
      b: before ? node : fresh
    }
  }
  return { ...node, a: splitLeaf(node.a, paneId, dir, newPaneId, before), b: splitLeaf(node.b, paneId, dir, newPaneId, before) }
}

/**
 * Remove the leaf for `paneId`, collapsing its parent split into the sibling.
 * Returns `null` if the whole tree would disappear (caller keeps the last pane).
 */
export function removeLeaf(node: LayoutNode, paneId: string): LayoutNode | null {
  if (node.type === 'leaf') return node.paneId === paneId ? null : node
  const a = removeLeaf(node.a, paneId)
  const b = removeLeaf(node.b, paneId)
  if (a === null) return b
  if (b === null) return a
  return { ...node, a, b }
}

/** Immutably set a split node's ratio (clamped). */
export function setRatio(node: LayoutNode, nodeId: string, ratio: number): LayoutNode {
  if (node.type === 'leaf') return node
  if (node.id === nodeId) return { ...node, ratio: Math.min(0.85, Math.max(0.15, ratio)) }
  return { ...node, a: setRatio(node.a, nodeId, ratio), b: setRatio(node.b, nodeId, ratio) }
}

/** Find which leaf a pane lives in (for "is this pane still in the tree?"). */
export function hasPane(node: LayoutNode, paneId: string): boolean {
  if (node.type === 'leaf') return node.paneId === paneId
  return hasPane(node.a, paneId) || hasPane(node.b, paneId)
}

/** Build a balanced tree of `n` leaves from the given pane ids (1–8). */
export function balancedTree(paneIds: string[]): LayoutNode {
  if (paneIds.length === 1) return { id: uid('leaf'), type: 'leaf', paneId: paneIds[0] }
  const mid = Math.ceil(paneIds.length / 2)
  const left = paneIds.slice(0, mid)
  const right = paneIds.slice(mid)
  // Top-level splits go horizontal; deeper ones alternate for a grid-ish feel.
  const dir: 'row' | 'col' = paneIds.length > 2 ? 'row' : 'row'
  return {
    id: uid('split'),
    type: 'split',
    dir,
    ratio: 0.5,
    a: balancedTree(left),
    b: balancedTree(right)
  }
}

/** A simple grid tree (rows × cols) for the new-deck template picker. */
export function gridTree(paneIds: string[], rows: number, cols: number): LayoutNode {
  // Build columns of stacked panes, then join columns left→right.
  const columns: LayoutNode[] = []
  let idx = 0
  for (let c = 0; c < cols; c++) {
    const cellIds: string[] = []
    for (let r = 0; r < rows; r++) {
      if (idx < paneIds.length) cellIds.push(paneIds[idx++])
    }
    if (cellIds.length === 0) continue
    columns.push(stack(cellIds, 'col'))
  }
  return stack(columns.length ? columns : [{ id: uid('leaf'), type: 'leaf', paneId: paneIds[0] }], 'row')
}

function stack(items: (LayoutNode | string)[], dir: 'row' | 'col'): LayoutNode {
  const nodes: LayoutNode[] = items.map((it) =>
    typeof it === 'string' ? { id: uid('leaf'), type: 'leaf', paneId: it } : it
  )
  return nodes.reduce((acc, n) => ({
    id: uid('split'),
    type: 'split',
    dir,
    ratio: 0.5,
    a: acc,
    b: n
  }))
}
