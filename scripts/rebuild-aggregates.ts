/**
 * Rebuilds every aggregate in `public/data/aggregates` from the published pages, run with Node's
 * type stripping from the repository root after a change to the aggregate format:
 *
 *   node scripts/rebuild-aggregates.ts
 */

import { rebuildAggregates } from '../src/lib/submissionAction.ts'
import { dataFiles } from './files.ts'

const written = rebuildAggregates(dataFiles(process.cwd()))
console.log(`Rebuilt ${String(written)} aggregates`)
