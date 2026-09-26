# Google Stitch UI Exploration Brief

## Project

Design a distinctive desktop web application called **Gridlock Intelligence**. It helps electric utilities discover where separately planned transmission projects are geographically close or scheduled around the same time, so planners can coordinate crews, equipment, staging, permitting, access, and outage work.

This is a 36-hour hackathon prototype, but the interface should look credible enough to become a production analytics tool. The overriding design requirement is **simplicity**: a nontechnical engineer should understand the main finding, change a filter, and inspect an opportunity without training.

Use the interaction model of a well-designed Power BI dashboard: one primary page, obvious slicers, a few meaningful summary metrics, linked visuals, and a simple drill-down. Do not turn the product into a complex multi-screen command center.

## Product outcome

The user should be able to answer four questions within seconds:

1. Where are both utilities' planned projects?
2. Which cross-utility project pairs overlap?
3. Why is a particular pair highly ranked?
4. What should the utilities investigate or coordinate next?

The main experience is a clear interactive dashboard organized around a map, ranked opportunities, and a timeline. It is not a chatbot-first product.

## Simplicity principles

- Use one primary dashboard rather than several separate product areas.
- Keep all essential analysis visible without navigation.
- Use familiar filter controls with plain-language labels.
- Make every chart answer a specific user question.
- Prefer direct labels over legends when practical.
- Show advanced methodology only after the user asks for it.
- Use progressive disclosure: overview first, detail on selection.
- Avoid technical terminology unless it is standard utility language.
- Keep AI features contextual and optional.
- Optimize for scanning, comparing, and explaining—not exploration for its own sake.

## Primary users

- Utility transmission planners
- Construction and field-operations managers
- Engineering and reliability teams
- Permitting and right-of-way teams
- Regional planning coordinators

They are technically sophisticated, time-constrained, and need evidence they can verify.

## Required challenge logic

- Compare projects belonging to at least two electric utilities.
- Geographic overlap is the primary signal.
- Flag cross-utility projects within **40 km / 25 miles**.
- Measure the closest available points between project geometries where possible.
- If only approximate endpoints exist, disclose that uncertainty.
- Timeline overlap is a strong secondary signal.
- Rank the strongest coordination opportunities.
- Make the interface interactive and visually clear.

Use these coordination tiers:

| Distance | Interpretation |
| --- | --- |
| Touching or crossing | Operational coordination is likely required |
| Under 1.6 km | Potential shared right-of-way, land, access roads, or permits |
| Under 8 km | Potential shared staging, deliveries, and site logistics |
| Under 40 km | Potential shared crews, contractors, and equipment |

## Hero opportunity and real demo data

Use this pair as the selected opportunity in mockups:

### Dominion Energy South Carolina

- Project: Jasper-Okatie 230 kV Line No. 2
- Internal ID: DESC_3
- Status: In progress
- Planned in-service: December 31, 2025
- Approximate length: 6.5 miles
- Jasper Substation: 32.359120, -81.124600
- Okatie Substation: 32.333758, -81.032495

### Georgia Power

- Project: SAV: McIntosh-Purrysburg 230 kV Reactors
- Internal ID: GPC_2
- Start date: January 1, 2024
- Need/in-service date: June 1, 2026
- McIntosh coordinate: 32.352116, -81.175112

### Pair metrics

- Supplied overlap ID: OVL_2
- Estimated separation: 5.65 miles / 9.09 km
- Difference between planned in-service dates: 152 days
- Construction activity overlaps
- Both involve 230 kV infrastructure
- Coordination category: crews, equipment, staging, deliveries, and outage-planning review
- Geometry caveat: 9.09 km is currently a center-point estimate from the supplied starter data; exact route-level distance needs verification

Suggested selected-opportunity explanation:

> These 230 kV projects are approximately 9.1 km apart and active during overlapping construction periods. Their voltage class, geography, and timing make shared mobilization, specialized crews, staging, deliveries, and outage-planning discussions worth evaluating.

## Core information architecture

Use one dashboard with three regions:

1. **Filters and summary** — simple controls and headline totals.
2. **Map and ranked opportunities** — the main analytical view.
3. **Timeline and selected opportunity** — supporting context that updates with selection.

Source details, confidence, and methodology should open in a drawer or modal rather than becoming separate navigation destinations. The default landing state should show a meaningful result rather than an empty upload screen.

## Required dashboard and states

### 1. Main dashboard

Include:

- Dominant interactive map
- Ranked opportunity list
- Familiar Power BI-style slicers
- Project and opportunity counts
- Selected hero opportunity
- Collapsible timeline
- Visible data-freshness or confidence indicator

Suggested first-screen state:

- Opportunities mode active
- Both utilities visible
- Top-ranked pair selected
- Map fitted to the selected pair
- 9.1 km and 152-day metrics visible
- Timeline partially expanded

### 2. Selected-opportunity state

Include:

- Both project names and utilities
- Opportunity score with transparent components
- Distance and proximity tier
- Side-by-side project facts
- Shared construction timeline
- Potential coordination actions
- Assumptions and caveats
- Source evidence
- Primary action: **Generate coordination brief**

Separate information into:

- **Observed facts**
- **Potential coordination**
- **Requires verification**

Do not navigate to a new page. Open the selected opportunity in a right-side panel or expandable section while keeping the map visible.

### 3. Source and confidence drawer

Include:

- Source document and page
- Extracted field beside original source excerpt
- Geometry method
- Location confidence
- Schedule confidence
- Missing or contradictory fields
- Accept, correct, or flag-for-review action

This should be an optional drawer or modal, not a permanent dashboard region.

### 4. AI coordination brief

Show a generated but grounded planner-facing artifact containing:

- Match rationale
- Small map
- Timeline
- Potential shared resources
- Questions for both utilities
- Recommended next meeting or action
- Citations to source filings
- Clear labels distinguishing facts from suggestions

## Recommended one-page layout

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Gridlock Intelligence                      Data updated Sep 2026    │
├─────────────────────────────────────────────────────────────────────┤
│ Utility [All ▾]  Year [2024–2033 ▾]  Voltage [All ▾]  View [Pairs] │
├─────────────────────────────────────────────────────────────────────┤
│ 10 Projects       6 Opportunities       2 Timeline Matches          │
├───────────────────────────────────────────┬─────────────────────────┤
│                                           │ Top opportunities       │
│                                           │                         │
│            INTERACTIVE MAP                │ 1 Jasper–Okatie         │
│                                           │   ↔ McIntosh–Purrysburg │
│                                           │   9.1 km · 152 days     │
│                                           │                         │
│                                           │ 2 Okatie–Bluffton ...   │
├───────────────────────────────────────────┴─────────────────────────┤
│ Selected pair timeline and plain-language explanation              │
└─────────────────────────────────────────────────────────────────────┘
```

Keep the top summary row compact. Do not use oversized KPI cards that push the map below the fold.

## Filter design for nontechnical users

Use no more than five visible filters:

- **Utility** — All, Dominion Energy South Carolina, Georgia Power
- **Planned year** — simple range or dropdown
- **Voltage** — All, 115 kV, 230 kV, 500 kV
- **Distance** — Under 1.6 km, under 8 km, under 40 km
- **Show** — All projects or coordination opportunities

Recommended behavior:

- Use human-readable labels instead of database field names.
- Show selected filters as removable chips.
- Include one obvious **Reset filters** action.
- Update every visual together when a filter changes.
- Display the remaining record count.
- Do not expose scoring weights on the main dashboard.
- Place advanced assumptions under **How this is calculated**.

## Map behavior

The map must remain the main workspace.

### Visual encoding

- Dominion Energy South Carolina: electric blue
- Georgia Power: warm magenta
- Selected coordination connection: cyan, white, or a restrained blue-magenta gradient
- Existing infrastructure: muted gray
- Official route: solid line
- Approximate route: dashed line
- Location-only project: point marker
- Selected geometry: brighter stroke or subtle outer glow
- Unselected geometry: reduced opacity

Use shape as well as color:

- Circle: substation
- Line: transmission corridor
- Diamond: generation facility
- Rounded square: storage
- Triangle: staging or construction location

### Selected-pair interaction

When an opportunity is selected:

- Fade unrelated projects.
- Fit the viewport around both projects.
- Emphasize their project geometries.
- Draw the measurement connector.
- Mark the two measurement points.
- Place the distance label directly on or beside the connector.
- Synchronize the right-side detail and bottom timeline.

Use the label **9.1 km center-point estimate** until route-level geometry is available.

### Optional analysis layers

Do not show large buffers for every project by default. Offer optional selected-project layers:

- 1.6 km land/access zone
- 8 km logistics zone
- 40 km crew/equipment zone

## Ranked opportunity table

Prefer a short, sortable table or list over elaborate cards. It should feel familiar to Power BI users.

Recommended columns:

| Rank | Project pair | Distance | Date gap | Voltage | Opportunity |
| ---: | --- | ---: | ---: | --- | --- |
| 1 | Jasper-Okatie / McIntosh-Purrysburg | 9.1 km | 152 days | 230 / 230 kV | High |

Use plain words such as High, Medium, and Review. Explain the exact score only after selection.

## Selected opportunity summary

A selected summary should resemble:

```text
01  HIGH OPPORTUNITY                              86

Jasper-Okatie
McIntosh-Purrysburg

9.1 km          152 days          230 kV / 230 kV
Distance        Date gap          Compatibility

Crews · equipment · staging
Approximate geometry
```

Avoid overcrowding cards with descriptions or source excerpts.

## Explainable scoring

Display an interpretable score, not a mysterious AI judgment.

Example:

| Component | Score |
| --- | ---: |
| Geographic proximity | 42 / 50 |
| Timeline alignment | 23 / 25 |
| Infrastructure compatibility | 13 / 15 |
| Data confidence | 8 / 10 |
| Total | 86 / 100 |

AI may explain the score in plain language, but deterministic spatial and schedule logic should calculate it.

## Charts and analytics

Keep the visual set small:

1. **Map** — Where are the projects and matches?
2. **Ranked table** — Which opportunities deserve attention first?
3. **Timeline** — Are the projects active around the same time?
4. **Distance-tier breakdown** — How many matches fall under 1.6, 8, and 40 km?

Do not add charts simply to fill space. Avoid pie charts, decorative gauges, complex network diagrams, and multiple visuals showing the same metric.

All visuals should cross-filter each other:

- Selecting a row highlights the two projects on the map.
- Selecting a map connection highlights its ranked row.
- Selecting a year filters the map and table.
- Selecting a distance tier filters the opportunity list.

## Plain-language copy

Prefer:

- “Projects close enough to coordinate”
- “Planned completion dates are 152 days apart”
- “Location is approximate”
- “Potential to share crews and equipment”
- “View source”
- “How this was calculated”

Avoid:

- “Geospatial intersection candidate”
- “Temporal delta”
- “Entity-resolution confidence vector”
- “Model inference”
- “RAG output”

Technical details can remain available in secondary views for analysts.

## AI capabilities to represent

AI should feel embedded in a dependable workflow rather than added as a floating chatbot. Most users should benefit from it without needing to understand how it works.

### Document ingestion

- Extract projects from utility planning PDFs.
- Normalize names, voltage, status, dates, costs, and endpoints.
- Attach every extracted field to a page-level source.
- Show confidence and send ambiguous fields to review.

### Entity resolution

- Suggest when names such as McIntosh, Plant McIntosh, and McIntosh Substation refer to the same facility.
- Show evidence and confidence.
- Require human confirmation for uncertain matches.

### Data-quality agent

- Detect missing endpoints.
- Detect impossible coordinates.
- Identify duplicate or conflicting project records.
- Compare workbook values with source filings.
- Flag stale documents and weak geometry.

### Grounded coordination brief

- Generate a concise planning brief using only structured project data and retrieved source passages.
- Cite its evidence.
- Never present speculative savings or land sharing as confirmed.

### Natural-language investigation

Support constrained requests such as:

- Show 230 kV opportunities within 15 km.
- Which matches have uncertain geometry?
- Why is this pair ranked first?
- Show projects active in 2025.

Always display the filters or query interpretation applied by the system.

## Visual personality

The interface should feel like a refined infrastructure intelligence product:

- Near-black or charcoal canvas
- Subtle technical grid
- Large direct typography
- Bright white primary text
- Muted gray secondary text
- Blue, cyan, and magenta accents
- Thin borders and dividers
- Minimal card chrome
- Restrained glow
- Compact monospace treatment for IDs, coordinates, dates, voltage, and distance
- High information clarity with generous spacing
- Calm interaction design rather than constant motion

Avoid copying any existing website literally. Interpret this direction into an original application.

## Desired design explorations

Generate **three simple one-dashboard variations**. Each variation must preserve the same small set of filters and visuals.

### Concept A — Map led

- Map occupies approximately two-thirds of the content area.
- Ranked opportunities sit on the right.
- Timeline spans the bottom.
- Best when location is the primary story.

### Concept B — Balanced analytics

- Map and ranked table have roughly equal emphasis.
- Filters and compact summary metrics stay at the top.
- Timeline appears below the selected row.
- Most similar to a polished Power BI executive dashboard.

### Concept C — Opportunity led

- Ranked table is slightly more prominent.
- Selecting a row updates the adjacent map and detail section.
- Best for users who want an actionable work queue.

Do not create different pages for Explore, Coordinate, and Verify. Those are mental tasks supported by the same dashboard.

## Interaction ideas

- Hovering over an opportunity highlights both projects.
- Hovering over a project highlights all its cross-utility connections.
- Selecting a pair synchronizes map, list, metrics, and timeline.
- Clicking the distance opens the calculation method.
- Clicking a confidence label opens source evidence.
- A year-range control filters both map and opportunity list.
- Switching to Verify mode recolors features by data confidence.
- Generating a brief transitions into an editable review state rather than instantly exporting.

## Accessibility and legibility

- Do not rely on color alone.
- Use marker shapes, line patterns, text, and icons redundantly.
- Maintain strong contrast on the dark map.
- Keep critical presentation text at least 14 to 16 px.
- Provide visible focus states.
- Keep tooltips concise and keyboard reachable.
- Avoid ultra-thin type and tiny muted labels.

## What to avoid

- Generic admin-dashboard appearance
- A large chatbot taking over the interface
- AI sparkle icons on every component
- Giant KPI cards above a cramped map
- Excessive glassmorphism
- Neon cyberpunk styling
- Constant pulsing or moving transmission lines
- Satellite imagery as the default
- Large buffers around every project
- Unexplained scores
- Unsupported cost-savings claims
- Presenting inferred routes as official routes
- Hiding uncertainty in tooltips or fine print
- More than five visible filters
- Deep navigation or multi-step workflows
- Separate pages for every chart or analytical task
- Advanced controls shown before they are needed
- Unfamiliar icons without text labels

## Output requested from Google Stitch

For each concept, produce:

1. Desktop coordination overview at approximately 1440 x 900.
2. Selected-opportunity state using the supplied hero pair.
3. Filtered dashboard state.
4. Source-evidence drawer state.
5. Short explanation of the concept's design thesis.
6. Notes about its map/list/detail interaction.
7. Key reusable components and design tokens.

After generating the three concepts, recommend one direction for a 36-hour implementation and explain why it is easiest for a nontechnical engineer to understand while still presenting the analysis credibly.

## Final design principle

Keep the map quiet until the user selects a finding. Then make the evidence unmistakable.

AI handles messy interpretation and explanation. Transparent geometry, schedule calculations, provenance, and validation support the decision.
