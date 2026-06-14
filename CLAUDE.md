# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

The **public project website** for the paper **"LatentGym: A Testbed for Cross-Task
Experiential Learning with Controllable Latent Structure"** (Columbia University · Oumi).
It is a single-page static site — plain HTML/CSS/JS, **no framework and no build step** —
whose job is to explain the LatentGym framework, showcase its environments, and let
visitors browse recorded agent trajectories.

This is **not** the framework code itself. The LatentGym benchmark/framework lives upstream
at **https://github.com/namkoong-lab/LatentGym** (see "The framework" below). This repo only
consumes data exported from it. When writing or editing site copy, the paper and that repo
are the source of truth for terminology, results, and claims.

## The research, in brief

LatentGym studies **cross-task experiential learning**: an agent faces a sequence of `N`
related tasks that share a hidden **latent** — a rule, preference, mapping, constraint,
target set, or temporal pattern. The agent never observes the latent; it must infer it from
interaction and **adapt in-context** (weights fixed across the sequence, history carried
forward, no gradient updates). Because the experimenter controls the latent, a failure to
adapt can be diagnosed rather than just observed.

Running example (the animated Fig. 1 on the home page): a number-guessing stream where each
task asks for a hidden integer in `[1, 1000]`, but targets are secretly drawn from a small
set like `{137, 793}`. A good agent stops re-running binary search and starts guessing the
recurring values.

The framework has three parts:

1. **Controllable environments.** Every environment is the product of five independently
   registered, freely composable axes:
   `FullyDefinedEnv = core-env × latent × prompt × feedback × N`.
   - **core-env** — the within-task game (e.g. number guessing).
   - **latent** — the ground-truth structure shared across the sequence (sets the difficulty
     of inference).
   - **prompt** — how much of the latent is revealed: `no_info`, a vague hint, or `full_info`.
   - **feedback** — what the agent sees after each task: `standard` (binary success/failure)
     or `information` (ground-truth outcome revealed regardless of success).
   - **N** — the horizon (number of tasks in the sequence).
   Changing one axis leaves the others untouched, so a difficulty sweep is a handful of
   configs, not new code.
2. **Diagnostics.** Per-task rewards `r_1..r_N` summarized as cumulative `R = Σ r_i`, final
   `r_N`, and gain `(r_N − r_1)/r_1`. Crucially, it separates **exploration efficiency**
   (do the agent's actions gather information about the latent?) from **exploitation
   efficiency** (does it act on what it gathered?) via a counterfactual hand-off: agent A
   plays tasks `1..K` (explores), agent B inherits the history and plays `K+1..N`
   (exploits); comparing tail rewards while holding one role fixed isolates each capability.
3. **Integrated RL pipeline.** The same environment object serves both evaluation and
   training (a mode switch, not a different env). Training is **Cross-Task RL**: fine-tune
   on full `N`-task sequences so the reward depends on the whole sequence, rewarding the
   policy for inferring the latent early and exploiting it later.

**Seven environments** instantiate the suite: Number Guessing, Bandits, Secretary,
Mastermind, Word Ladder, Wordle, Hangman (hundreds of latents across them).

**Three findings** the site presents (the "Findings" content):
- **Frontier models fail to adapt**, in three interpretable modes — *adaptation neglect*
  (restart from scratch each task), *adaptation breakdown* (notice the pattern but don't act
  on it reliably), *adaptation miscalibration* (more/explicit information can make it worse).
- **Cross-Task RL is necessary** (beats single-task RL and the base model) and the learned
  strategy **generalizes** to held-out latents (OOD-1) and held-out environments (OOD-2);
  multi-environment training beats single-environment.
- **Where the lift comes from** (exploration vs exploitation) and how design choices like
  training feedback/prompt shape transfer.

**Models** evaluated map directly to the site's filters: frontier = `gpt-4o`,
`claude-sonnet-4-6`, `gemini-2.5-flash` (plus `gpt-5-mini`); RL = `qwen3-8b` as base,
single-task RL, and cross-task RL `variant`s, fine-tuned with GRPO.

## The framework (upstream, for accurate "how to use" copy)

When describing how to *use* LatentGym on the site, base it on the upstream repo
**https://github.com/namkoong-lab/LatentGym** (MIT, Python 3.12), not on guesses:

- **Layout** — `latentgym/{eval, training, envs}`, with vendored deps `TextArena`,
  `skyrl-gym`, `skyrl-train`. Onboarding via `docs/getting_started.md`, `setup.sh`,
  `project_config.sh`, `.env.example`. Subsystem docs: `latentgym/eval/README.md`,
  `latentgym/training/README.md`, `latentgym/envs/README.md`.
- **Evaluate** — single- or double-agent runs against OpenRouter or local models; produces
  reports and an inspection dashboard (per-task reward curves + full trajectories).
- **Train** — built on **SkyRL v0.2.0**, which provides PPO/GRPO/SFT and runs the
  distributed rollouts and policy optimization. LatentGym contributes only new advantage
  estimators plus a thin environment adapter, and exposes per-task rewards so advantages can
  be defined over the whole sequence.
- **Add an environment** — implement the single-task core dynamics against the
  `latentgym.core-env` interface (write from scratch or wrap a TextArena game), then
  register components on import and compose them:
  ```python
  register_env("number_guessing", NumberGuessingSingleEpisodeEnv,
               min_range=1, max_range=1000, max_turns_per_episode=30)

  FullyDefinedEnv("number_guessing",  # core dynamics
                  "set_of_3",         # latent
                  "no_info",          # prompt
                  "standard",         # feedback
                  num_episodes=10)    # horizon N
  ```

## Running this site locally

`fetch()` is used to load data, so the site must be served over HTTP — opening
`index.html` via `file://` will silently fail to load trajectory data.

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

There is no lint/test/build tooling. Edit the source files and reload the browser.

## Architecture

Everything renders inside `index.html`, which holds every section as a `.panel` div.
Only one panel is `.active` at a time; navigation is client-side (no routing library).
Only two scripts are loaded — `script.js` and `explorer.js`.

- **`assets/js/script.js`** — owns panel switching (`showPanel`), the `#side-list`
  sidebar, theme toggle (persisted in `localStorage` as `cta-theme`), hero/Fig-1
  animations, the interactive metrics simulator, and the static result tables/env cards.
  Cross-panel navigation uses `data-jump` / `data-anchor` / `data-prefill` attributes on
  elements; jumping into the explorer dispatches an `explorer:prefill` event that
  `explorer.js` listens for.
- **`assets/js/explorer.js`** — the Trajectory Explorer. Cascading dropdown filters over
  the 8 levels `["variant","model","env","latent","prompt","feedback","horizon","seed"]`,
  animated turn-by-turn playback, and a before/after compare mode (`cmp` flag, set only in
  the RL-variants tab). Loads `data/index.json` **once**, then `fetch`es a single compact
  trajectory JSON on demand. `fmtGT`/`gtOf` format per-environment ground truth — each env
  has a different shape, so extend the `if` ladder in `fmtGT` when adding environments.
- **`assets/js/leaderboard.js`** — a standalone client-side aggregator (rows = `(variant,
  model)`). It is **not currently loaded** by `index.html` (no leaderboard panel ships); it
  remains in the tree as a reusable module.

### Data model

- **`data/index.json`** — lightweight catalog. Top-level holds the label maps
  (`variant_labels`, `model_labels`, `env_labels`), the filter value lists
  (`variants`, `models`, `environments`→latents, `prompts`, `feedbacks`, `horizons`),
  and `trajectories`: one summary row per trajectory (no conversation), each with the 8
  filter keys plus `cumulative_reward`, `init_reward`, `final_reward`, `gain_pct`, and a
  `file` path relative to `data/`.
- **`data/trajectories/<variant>/<env>/<latent>/<prompt>__<feedback>__<horizon>/<model>__s<seed>.json`**
  — one compact trajectory per file (the full conversation), fetched on demand. ~186 MB
  total, **committed** so a fresh clone runs as-is.

### Regenerating data (rarely needed)

`scripts/build_data.py` and `scripts/export_figures.py` regenerate `data/` and
`assets/img/` from the source benchmark. The source path (`BENCH`) is **hardcoded to an
absolute path** in `build_data.py` and points at the upstream benchmark checkout — these
scripts only run in that environment, not from a plain clone of this repo.

## Configuration

- Paper / code / blog URLs live in the `LINKS` object at the top of
  `assets/js/script.js`; the BibTeX is the `BIBTEX` constant just below it. These are the
  single source of truth wired into all link/citation elements by id.

## Deployment

`.github/workflows/static.yml` deploys the **entire repo** to GitHub Pages on every push
to `master` (or manual dispatch). No build runs in CI — what's committed is what ships.

## Conventions

- Keep comments to one line, and only where they earn their place (a non-obvious
  invariant, a magic number, a cross-platform gotcha). Don't add multi-line comment
  blocks; prefer self-explanatory code over narration.
