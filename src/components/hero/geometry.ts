/**
 * The hero stage is one drawing in a 1280-wide coordinate space: the page's content width.
 * The product plate spans the full width at y PLATE.y, so the demo inside it runs at its true
 * 1280 × 800 CSS px (scale 1 at desktop widths, scaled down with the container below that).
 * The tab strip and three callouts share one line above the window (A, B, C), two hang below it (D, E); every leader lands
 * on a real part of the demo's seeded first screen (measured on public/demo at 1280 × 800, embed mode).
 */
export const APP = { w: 1280, h: 800 } as const
/** Where the horizontal runs of the top leaders sit (callout text stands on this line). */
export const TOP_RUN = 62
export const PLATE = { x: 0, y: 84, w: 1280 } as const
/** The Live demo | Film tab strip stands on the same line as the top callouts, left of the first one. */
export const TABS_W = 212
export const SCALE = PLATE.w / APP.w
export const PLATE_BOTTOM = PLATE.y + APP.h * SCALE
/** Under the window: D and E hang from this line as inverted flags. */
export const BOTTOM_RUN = Math.round(PLATE_BOTTOM + 22)
/** Room under the bottom run for two lines of callout text. */
export const STAGE = { w: 1280, h: BOTTOM_RUN + 64 } as const

/** Demo pixel → stage unit. */
export const at = (x: number, y: number): [number, number] => [
  Math.round((PLATE.x + x * SCALE) * 10) / 10,
  Math.round((PLATE.y + y * SCALE) * 10) / 10
]

/** Stage units → CSS percentages of the stage box. */
export const px = (x: number): string => `${((x / STAGE.w) * 100).toFixed(3)}%`
export const py = (y: number): string => `${((y / STAGE.h) * 100).toFixed(3)}%`
/** Distance from the stage's bottom edge, as a percentage (for callouts that sit above their line). */
export const pyFromBottom = (y: number): string => `${(((STAGE.h - y) / STAGE.h) * 100).toFixed(3)}%`

export interface Part {
  key: 'A' | 'B' | 'C' | 'D' | 'E'
  /** Draw order (the Notch first: it is the moment everything else follows). */
  i: number
  /** Leader path in stage units; the last point is the landing. A second M starts the drop from the run. */
  d: string
  end: 'arrow' | 'dot'
  casing?: boolean
  /** Pane-level parts move once the visitor rearranges panes; those leaders retire after interaction. */
  paneLevel?: boolean
  /** Callout placement on the stage (desktop). `bottom` = stands on a line; `top` = hangs from one. */
  box: { left: number; width: number; bottom?: number; top?: number }
  /** Lettered marker on the plate (below 1100 px), as % of the demo. */
  marker: { x: number; y: number; /** Extra offset in screen px (to stand just clear of a part). */ dy?: number }
}

const [tabX, tabY] = at(242, 5) // the Review deck tab's top edge (the page's tab strip sits left of it)
const [notchX] = at(640, 0) // the notch hangs from the top edge, centred
const [msgX, msgY] = at(1034, 9) // the Messages button's top edge
const [paneX] = at(316, 436) // under "npm run dev · web", a header the pane wrote itself
const [promptX] = at(1012, 468) // under the PowerShell pane
/** D and E land just inside the window's bottom edge, in their pane: short drops that never cross app content. */
const EDGE_Y = PLATE_BOTTOM - 8

/* Callout boxes: the flag line runs under (or over) the whole text; the leader drops from it. */
const A_BOX = { left: tabX, right: 600 }
const B_BOX = { left: notchX, right: 952 }
const C_BOX = { left: 986, right: STAGE.w }
// Bottom callouts start at their own leader, so each note sits beside the thing it labels.
const D_BOX = { left: paneX, right: paneX + 420 }
const E_BOX = { left: promptX, right: STAGE.w }

export const PARTS: Part[] = [
  {
    key: 'A',
    i: 1,
    d: `M${A_BOX.right} ${TOP_RUN} H${tabX} V${tabY}`,
    end: 'arrow',
    box: { left: A_BOX.left, width: A_BOX.right - A_BOX.left - 24, bottom: TOP_RUN },
    marker: { x: (196 / APP.w) * 100, y: (17 / APP.h) * 100 }
  },
  {
    key: 'B',
    i: 0,
    d: `M${B_BOX.right} ${TOP_RUN} H${notchX} V${PLATE.y}`,
    end: 'arrow',
    box: { left: B_BOX.left, width: B_BOX.right - B_BOX.left - 12, bottom: TOP_RUN },
    // Just under the alert pill (34 px tall, centred), so the marker never covers its text.
    marker: { x: (640 / APP.w) * 100, y: (34 / APP.h) * 100, dy: 12 }
  },
  {
    key: 'C',
    i: 2,
    d: `M${C_BOX.left} ${TOP_RUN} H${C_BOX.right} M${msgX} ${TOP_RUN} V${msgY}`,
    end: 'arrow',
    box: { left: C_BOX.left, width: C_BOX.right - C_BOX.left, bottom: TOP_RUN },
    marker: { x: (1010 / APP.w) * 100, y: (17 / APP.h) * 100 }
  },
  {
    key: 'D',
    i: 3,
    // An inverted flag under the window: a short drop to the bottom edge of the pane it names.
    d: `M${D_BOX.right} ${BOTTOM_RUN} H${paneX} V${EDGE_Y}`,
    end: 'dot',
    casing: true,
    paneLevel: true,
    box: { left: D_BOX.left, width: D_BOX.right - D_BOX.left, top: BOTTOM_RUN },
    marker: { x: (298 / APP.w) * 100, y: (436 / APP.h) * 100 }
  },
  {
    key: 'E',
    i: 4,
    // A short drop to the bottom edge of the PowerShell pane.
    d: `M${E_BOX.right} ${BOTTOM_RUN} H${promptX} V${EDGE_Y}`,
    end: 'dot',
    casing: true,
    paneLevel: true,
    box: { left: E_BOX.left, width: E_BOX.right - E_BOX.left, top: BOTTOM_RUN },
    marker: { x: (1024 / APP.w) * 100, y: (468 / APP.h) * 100 }
  }
]
