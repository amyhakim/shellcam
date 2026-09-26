import express from 'express'
import pg from 'pg'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const { Pool } = pg
const app = express()
const port = Number(process.env.PORT) || 3000

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')

const databaseUrl = new URL(process.env.DATABASE_URL)
databaseUrl.searchParams.delete('sslmode')
databaseUrl.searchParams.delete('uselibpqcompat')

const pool = new Pool({
  connectionString: databaseUrl.toString(),
  ssl: { rejectUnauthorized: false },
})

const query = (sql) => async (_request, response) => {
  try {
    response.json((await pool.query(sql)).rows)
  } catch (error) {
    console.error(error)
    response.status(500).json({ message: 'Database query failed' })
  }
}

app.get('/api/health', async (_request, response) => {
  try {
    const result = await pool.query('SELECT NOW() AS database_time')
    response.json({ status: 'ok', databaseTime: result.rows[0].database_time })
  } catch (error) {
    console.error(error)
    response.status(503).json({ status: 'error', message: 'Database unavailable' })
  }
})

app.get('/api/projects', query(`
  SELECT project_id, utility, state, project_name, name_a, lat_a, lon_a,
         name_b, lat_b, lon_b, lat_center, lon_center, in_service_date
  FROM projects
  ORDER BY utility, project_id
`))

app.get('/api/opportunities', query(`
  SELECT overlap_id, project_a_id, project_b_id, distance_miles, time_gap_days
  FROM project_overlaps
  ORDER BY distance_miles, time_gap_days
`))

const directory = path.dirname(fileURLToPath(import.meta.url))
const dist = path.join(directory, 'dist')
app.use(express.static(dist))
app.use((_request, response) => response.sendFile(path.join(dist, 'index.html')))

app.listen(port, '0.0.0.0', () => console.log(`Gridlock Intelligence listening on ${port}`))
