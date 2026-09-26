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

const directory = path.dirname(fileURLToPath(import.meta.url))
const dist = path.join(directory, 'dist')
app.use(express.static(dist))
app.use((_request, response) => response.sendFile(path.join(dist, 'index.html')))

app.listen(port, '0.0.0.0', () => console.log(`Gridlock Intelligence listening on ${port}`))
