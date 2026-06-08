# Cross-Task Adaptation — project website

Single-page static site for **"Probing Cross-Task Adaptation in LLM Agents through Controllable Latents."**
Plain HTML/CSS/JS — no framework, no build step. Sticky left-sidebar nav with panel switching, light/dark
theme toggle, interactive trajectory explorer, and animated metrics explainer.

## File layout

```
index.html              # the whole site (every section is a panel)
assets/
  css/style.css         # design system (blue accent, light + dark)
  js/script.js          # panel switching, theme, hero/metrics animations, static tables, env cards
  js/explorer.js        # trajectory player (animated playback + before/after compare)
  js/leaderboard.js     # sortable, filterable agent leaderboard
  img/                  # exported figure PNGs (committed)
data/
  index.json            # lightweight catalog driving filters + leaderboard
  trajectories/         # one compact JSON per recorded trajectory (committed; ~186 MB)
scripts/
  build_data.py         # regenerate data/ from the benchmark source
  export_figures.py     # copy curated figures into assets/img/
```

## 1. Data is included — just clone and serve

The full trajectory data (`data/trajectories/`, ~186 MB), `data/index.json`, and the figures
are committed, so a fresh clone runs as-is — no regeneration needed.

To rebuild the data from the source benchmark (only if it changes):

```bash
python3 scripts/build_data.py      # -> data/index.json + data/trajectories/**.json
python3 scripts/export_figures.py  # -> assets/img/*.png
```

## 2. Preview locally

`fetch()` needs HTTP (not `file://`), so serve the folder:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## 3. Configure links

Set the paper / blog / code URLs in one place: the `LINKS` object at the top of
[`assets/js/script.js`](assets/js/script.js).

## 4. Deploy

It's fully static — upload the folder anywhere:
- **S3 + CloudFront:** `aws s3 sync . s3://<bucket> --exclude ".git/*"`
- **nginx / any host:** copy the folder to the web root.

Sections (each is a sidebar item):

| Sidebar item | What it shows |
|---|---|
| Home | Hero, animated Fig. 1 task strip, headline stats, three contribution cards |
| How it works | Meta-RL formalism, the 5 design axes, prompt/feedback conditions, difficulty table |
| Metrics & glossary | Formal definitions + interactive explore/exploit efficiency explainer (Table 8 wired) |
| All 7 environments | Env cards with latent families + per-latent deep-links into the explorer |
| Frontier failure modes | Figure 2/3, neglect/breakdown/miscalibration callouts with real transcripts |
| Cross-Task RL | Tables 4–7 as live HTML, before/after explorer button |
| Explore vs exploit | Table 8, Figure 4, link to the animated explainer |
| Design choices | Figure 5, the sparser-feedback-transfers-better result |
| Trajectory explorer | Cascading filters + animated turn-by-turn playback + before/after compare |
| Leaderboard | Sortable, filterable agent leaderboard (aggregated client-side) |
| Code & citation | GitHub link, framework guide, BibTeX |
