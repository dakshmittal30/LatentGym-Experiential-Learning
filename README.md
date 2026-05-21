# Cross-Task Adaptation — project website

Static site for **"Probing Cross-Task Adaptation in LLM Agents through Controllable Latents."**
Plain HTML/CSS/JS — no build step, no framework. Pages:

| Page | File |
|------|------|
| Home (incl. main results at a glance) | `index.html` |
| Framework / approach | `framework.html` |
| Environments (7 cards) | `environments.html` |
| Findings (Tables 4–8 + figures + leaderboard) | `findings.html` |
| Trajectory Explorer (animated playback + before/after) | `explorer.html` |
| Metrics & glossary (interactive explore/exploit explainer) | `metrics.html` |
| Resources / code & data | `resources.html` |

## 1. Data is included — just clone and serve

The full trajectory data (`data/trajectories/`, ~186 MB), `data/index.json`, and the figures
are committed, so a fresh clone runs as-is — no regeneration needed.

To rebuild the data from the source benchmark (only if it changes):

```bash
python3 scripts/build_data.py      # -> data/index.json + data/trajectories/**.json (~186 MB)
python3 scripts/export_figures.py  # -> assets/img/*.png
```

`build_data.py` ingests:
- frontier-model trajectories from `…/results/all_envs/trajectories/`
- Qwen3-8B base / single-task-RL / cross-task-RL from the `…/reports/` explorer HTMLs.

Edit the `BENCH` path at the top of each script if the benchmark repo moves.

## 2. Preview locally

`fetch()` needs HTTP (not `file://`), so serve the folder:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## 3. Configure links

Set the paper / blog / code URLs in one place: `LINKS` at the top of `assets/js/site.js`.

## 4. Deploy

It's fully static — upload the folder anywhere:
- **S3 + CloudFront:** `aws s3 sync . s3://<bucket> --exclude ".git/*"` (enable static hosting; gzip is recommended for `data/index.json` and the JSON files).
- **nginx / any host:** copy the folder to the web root.

The whole site, including `data/` (~186 MB), is in the repo, so deploying is just copying
the folder. (`git clone` then upload, or `aws s3 sync . s3://<bucket> --exclude ".git/*"`.)
