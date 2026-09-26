# Gridlock Intelligence

A hackathon prototype for identifying coordination opportunities between
electric-utility construction plans. The product centers on a simple,
Power-BI-style dashboard with an interactive map, ranked project overlaps,
plain-language filters, and evidence-backed AI summaries.

## Project resources

- [Requirements and architecture](docs/project-requirements-architecture.md)
- [Google Stitch UI exploration brief](docs/google-stitch-ui-brief.md)
- [Original Sperry Tech challenge data](data/Sperry-Tech-Challenge.zip)

The source ZIP is preserved unchanged so the team can trace derived data and
demo results back to the supplied challenge materials.

## Run the prototype

The dashboard is built with React, TypeScript, and Vite:

```bash
npm install
npm run dev
```

Filters, map markers, ranked opportunities, the briefing notification, and the
opportunity detail drawer are interactive.
