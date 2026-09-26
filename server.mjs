import express from 'express'
import pg from 'pg'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const { Pool } = pg
const app = express()
const port = Number(process.env.PORT) || 3000
const directory = path.dirname(fileURLToPath(import.meta.url))
const publicData = path.join(directory, 'web', 'public', 'data')
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(publicData, name), 'utf8'))
const projects = readJson('projects.json')
const opportunities = readJson('pairs.json')
const quality = readJson('quality.json')
const projectById = new Map(projects.map((project) => [project.id, project]))

app.use(express.json({ limit: '32kb' }))

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')

const databaseUrl = new URL(process.env.DATABASE_URL)
databaseUrl.searchParams.delete('sslmode')
databaseUrl.searchParams.delete('uselibpqcompat')

const pool = new Pool({
  connectionString: databaseUrl.toString(),
  ssl: { rejectUnauthorized: false },
  max: Number(process.env.DATABASE_POOL_SIZE) || 5,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 30_000,
})

pool.on('error', (error) => console.error('Unexpected database pool error', error))

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

app.get('/api/db/projects', query(`
  SELECT project_id, utility, state, project_name, name_a, lat_a, lon_a,
         name_b, lat_b, lon_b, lat_center, lon_center, in_service_date
  FROM projects
  ORDER BY utility, project_id
`))

app.get('/api/db/opportunities', query(`
  WITH calculated_pairs AS (
    SELECT
      a.project_id AS project_a_id,
      b.project_id AS project_b_id,
      ST_Distance(a.location, b.location) AS distance_meters,
      CASE
        WHEN a.in_service_date IS NOT NULL AND b.in_service_date IS NOT NULL
        THEN ABS(a.in_service_date - b.in_service_date)
        ELSE NULL
      END AS time_gap_days,
      a.location AS closest_point_a,
      b.location AS closest_point_b
    FROM projects a
    JOIN projects b
      ON a.utility <> b.utility
     AND a.project_id < b.project_id
     AND a.location IS NOT NULL
     AND b.location IS NOT NULL
     AND ST_DWithin(a.location, b.location, 40000)
  )
  SELECT
    COALESCE(
      supplied.overlap_id,
      'CALC_' || pairs.project_a_id || '_' || pairs.project_b_id
    ) AS overlap_id,
    pairs.project_a_id,
    pairs.project_b_id,
    ROUND((pairs.distance_meters / 1609.344)::numeric, 2) AS distance_miles,
    ROUND((pairs.distance_meters / 1000)::numeric, 2) AS distance_km,
    pairs.time_gap_days,
    ST_Y(pairs.closest_point_a::geometry) AS measurement_lat_a,
    ST_X(pairs.closest_point_a::geometry) AS measurement_lon_a,
    ST_Y(pairs.closest_point_b::geometry) AS measurement_lat_b,
    ST_X(pairs.closest_point_b::geometry) AS measurement_lon_b,
    'center_point' AS geometry_method,
    'approximate' AS geometry_confidence,
    NOW() AS calculated_at
  FROM calculated_pairs pairs
  LEFT JOIN project_overlaps supplied
    ON supplied.project_a_id = pairs.project_a_id
   AND supplied.project_b_id = pairs.project_b_id
  ORDER BY pairs.distance_meters, pairs.time_gap_days NULLS LAST
`))

const datasetFiles = new Set(['projects.json', 'pairs.json', 'clusters.json', 'meta.json', 'quality.json', 'grid.json', 'states.json'])
app.get('/api/dataset/:file', (request, response) => {
  if (!datasetFiles.has(request.params.file)) return response.status(404).json({ message: 'Dataset not found' })
  response.sendFile(path.join(publicData, request.params.file))
})

app.get('/api/projects', (request, response) => {
  const { utility, year_from: yearFrom, year_to: yearTo, voltage } = request.query
  response.json(projects.filter((project) => {
    const year = project.in_service ? Number(project.in_service.slice(0, 4)) : null
    return (!utility || project.utility === utility)
      && (!voltage || project.kv.includes(Number(voltage)))
      && (!yearFrom || year == null || year >= Number(yearFrom))
      && (!yearTo || year == null || year <= Number(yearTo))
  }))
})

app.get('/api/projects/:id', (request, response) => {
  const project = projectById.get(request.params.id)
  if (!project) return response.status(404).json({ message: 'Project not found' })
  response.json(project)
})

app.get('/api/opportunities', (request, response) => {
  const maxKm = Math.min(Number(request.query.max_km ?? 40), 40)
  const minConfidence = Number(request.query.min_confidence ?? 0)
  const utility = request.query.utility
  const voltage = request.query.voltage ? Number(request.query.voltage) : null
  response.json(opportunities.filter((pair) => {
    const a = projectById.get(pair.a), b = projectById.get(pair.b)
    return pair.tier && pair.km <= maxKm && pair.confidence >= minConfidence
      && (!utility || pair.b_utility === utility)
      && (!voltage || a?.kv.includes(voltage) || b?.kv.includes(voltage))
  }))
})

const findOpportunity = (request, response) => {
  const pair = opportunities.find((candidate) => candidate.id === request.params.id)
  if (!pair) response.status(404).json({ message: 'Opportunity not found' })
  return pair
}

app.get('/api/opportunities/:id', (request, response) => {
  const pair = findOpportunity(request, response)
  if (pair) response.json(pair)
})

app.get('/api/opportunities/:id/evidence', (request, response) => {
  const pair = findOpportunity(request, response)
  if (!pair) return
  response.json([pair.a, pair.b].map((id) => {
    const project = projectById.get(id)
    return { project_id: id, source_document: project.source_doc, source_page: project.source_page, excerpt: project.source_text ?? '' }
  }))
})

app.post('/api/opportunities/:id/brief', (request, response) => {
  const pair = findOpportunity(request, response)
  if (!pair) return
  const a = projectById.get(pair.a), b = projectById.get(pair.b)
  response.json({
    opportunity_id: pair.id,
    facts: [
      { text: `${a.name} is planned in service ${a.in_service ?? 'on an unstated date'}.`, source: `${a.source_doc}, p.${a.source_page}` },
      { text: `${b.name} is planned in service ${b.in_service ?? 'on an unstated date'}.`, source: `${b.source_doc}, p.${b.source_page}` },
      { text: `Closest-point distance is ${pair.km.toFixed(1)} km.`, source: 'GridLock spatial calculation' },
    ],
    suggestions: ['Confirm route geometry and schedules.', 'Hold a joint planning and constructability review.'],
    requires_human_review: true,
    reviewed_by: request.body?.reviewer ?? null,
    limitations: [...new Set([...(a.limitations ?? []), ...(b.limitations ?? [])])],
  })
})

app.post('/api/query/filters', (request, response) => {
  const text = String(request.body?.text ?? '').slice(0, 300).toLowerCase()
  const filters = {}
  const distance = text.match(/(?:within|under|less than|<)\s*(\d+(?:\.\d+)?)\s*(km|mi|miles?)/)
  if (distance) filters.range = Math.min(40, Number(distance[1]) * (distance[2].startsWith('mi') ? 1.609344 : 1))
  const voltage = text.match(/\b(46|69|115|230|500)\s*-?\s*kv\b/)
  if (voltage) filters.voltage = Number(voltage[1]) < 100 ? 'low' : voltage[1]
  const year = text.match(/\b(202[3-9]|203[0-4])\b/)
  if (year) filters.year = year[1]
  if (/dominion|desc|south carolina/.test(text) && !/georgia/.test(text)) filters.utility = 'DESC'
  else if (/georgia power|gpc/.test(text) && !/dominion/.test(text)) filters.utility = 'GPC'
  response.json({ filters, region: text.includes('savannah') ? 'Savannah' : text.includes('augusta') ? 'Augusta' : undefined, timing: /same time|concurrent|overlapping/.test(text) ? 'concurrent' : undefined })
})

app.get('/api/data-quality', (_request, response) => response.json(quality))

app.use('/api', (_request, response) => {
  response.status(404).json({ status: 'error', message: 'API route not found' })
})

const dist = path.join(directory, 'web', 'dist')
app.use(express.static(dist))
app.use((_request, response) => response.sendFile(path.join(dist, 'index.html')))

const server = app.listen(port, '0.0.0.0', () => console.log(`Gridlock Intelligence listening on ${port}`))

const shutdown = (signal) => {
  console.log(`${signal} received; shutting down`)
  server.close(async () => {
    await pool.end()
    process.exit(0)
  })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
