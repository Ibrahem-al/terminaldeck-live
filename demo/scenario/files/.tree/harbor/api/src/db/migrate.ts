import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import pg from 'pg'
import { config } from '../config.js'

const dir = join(import.meta.dirname, 'migrations')

const client = new pg.Client({ connectionString: config.databaseUrl })
await client.connect()
await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`)

const done = new Set((await client.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name))
const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()

for (const file of files) {
  if (done.has(file)) continue
  const sql = await readFile(join(dir, file), 'utf8')
  await client.query('BEGIN')
  try {
    await client.query(sql)
    await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file])
    await client.query('COMMIT')
    console.warn(`applied ${file}`)
  } catch (err) {
    await client.query('ROLLBACK')
    console.error(`failed ${file}`)
    throw err
  }
}

await client.end()
