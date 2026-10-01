/** notch.html: the notch overlay window (label `notch`, role `notch`). */
import { NOTCH_LABEL } from '../backend/contracts'
import { bootFrame } from './frame'

await bootFrame(NOTCH_LABEL, 'notch')
await import('@renderer/notch/main')
