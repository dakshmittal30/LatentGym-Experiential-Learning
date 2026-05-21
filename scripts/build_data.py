#!/usr/bin/env python3
"""
build_data.py — Preprocess recorded agent trajectories into the compact, web-friendly
form consumed by the Trajectory Explorer and Leaderboard.

Sources
-------
1. Frontier models: individual JSON files under
     <BENCH>/results/all_envs/trajectories/openrouter__<model>/<config>/traj_*.json
2. Qwen3-8B RL variants (base / single-task-RL / cross-task-RL): the `const ALL_TRAJS = [...]`
   array embedded in the generated trajectory_explorer.html reports under <BENCH>/reports/...

Outputs (into ../data relative to this script)
----------------------------------------------
  data/index.json
      Lightweight catalog: every trajectory as a summary row (no conversation).
      Drives the cascading dropdowns and the leaderboard.
  data/trajectories/<variant>/<env>/<latent>/<prompt>__<feedback>__<horizon>/<model>__s<seed>.json
      One compact trajectory per file, fetched on demand by the explorer.

Run:  python3 scripts/build_data.py
"""

import json
import glob
import os
import re
import sys

# ----------------------------------------------------------------------------- paths
HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(HERE)
OUT = os.path.join(SITE, "data")
OUT_TRAJ = os.path.join(OUT, "trajectories")

BENCH = "/shared/share_mala/daksh/meta-rl-new-merged/skyrl-train/benchmark"
FRONTIER_ROOT = os.path.join(BENCH, "results/all_envs/trajectories")

QWEN_SOURCES = {
    "qwen-base": os.path.join(BENCH, "reports/v1_baseline_qwen3_8b/Qwen3-8B_base/pretrained/trajectory_explorer.html"),
    "qwen-single-rl": glob.glob(os.path.join(BENCH, "reports/v1_4envs/Qwen3-8B_v1_4envs_ne=1_*/global_step_*/trajectory_explorer.html")),
    "qwen-cross-rl": glob.glob(os.path.join(BENCH, "reports/v1_4envs/Qwen3-8B_v1_4envs_ne=10_*/global_step_*/trajectory_explorer.html")),
}

# ----------------------------------------------------------------------------- labels
MODEL_LABELS = {
    "openrouter/anthropic:claude-sonnet-4-6": "claude-sonnet-4-6",
    "openrouter/google:gemini-2.5-flash": "gemini-2.5-flash",
    "openrouter/openai:gpt-4o": "gpt-4o",
    "openrouter/openai:gpt-5-mini": "gpt-5-mini",
}
VARIANT_LABELS = {
    "frontier": "Frontier models",
    "qwen-base": "Qwen3-8B (base)",
    "qwen-single-rl": "Qwen3-8B (single-task RL)",
    "qwen-cross-rl": "Qwen3-8B (cross-task RL)",
}
ENV_LABELS = {
    "number_guessing": "Number Guessing",
    "bandits": "Bandits",
    "secretary": "Secretary",
    "mastermind": "Mastermind",
    "wordladder": "Word Ladder",
    "wordle": "Wordle",
    "hangman": "Hangman",
}


def slug(s):
    return re.sub(r"[^A-Za-z0-9._-]+", "_", str(s))


def model_display(raw, variant):
    if variant != "frontier":
        return "qwen3-8b"
    return MODEL_LABELS.get(raw, raw.split("/")[-1].split(":")[-1] if raw else "unknown")


def parse_bid(bid):
    """env/latent/prompt/feedback/epN -> dict (robust to missing pieces)."""
    parts = (bid or "").split("/")
    out = {"env": "", "latent": "", "prompt": "", "feedback": "", "horizon": ""}
    keys = ["env", "latent", "prompt", "feedback", "horizon"]
    for k, v in zip(keys, parts):
        out[k] = v
    return out


def gain_pct(rewards):
    if not rewards or len(rewards) < 2 or not rewards[0]:
        return None
    return round((rewards[-1] - rewards[0]) / rewards[0] * 100.0, 1)


def slim_outcomes(outcomes):
    # keep ground_truth too: some trajectories have empty episode_configs and the
    # per-episode ground truth only survives here (the viewer falls back to it).
    keep = ("reward", "turns", "success", "outcome_type", "turn_efficiency", "ground_truth")
    slim = []
    for o in outcomes or []:
        slim.append({k: o.get(k) for k in keep if k in o})
    return slim


def compact(traj, variant):
    """Reduce a raw trajectory dict to the fields the web viewer needs."""
    bid = traj.get("benchmark_id") or ""
    meta = parse_bid(bid)
    # Prefer explicit ids; fall back to benchmark_id parsing.
    env = meta["env"] or traj.get("env_name") or ""
    latent = traj.get("latent_id") or meta["latent"]
    prompt = traj.get("prompt_id") or meta["prompt"]
    feedback = traj.get("feedback_id") or meta["feedback"]
    horizon = meta["horizon"] or ("ep%d" % len(traj.get("episode_rewards") or []))
    model = model_display(traj.get("model_name"), variant)
    rewards = traj.get("episode_rewards") or []

    rec = {
        "variant": variant,
        "model": model,
        "env": env,
        "latent": latent,
        "prompt": prompt,
        "feedback": feedback,
        "horizon": horizon,
        "seed": traj.get("seed"),
        "benchmark_id": bid,
        "model_name_raw": traj.get("model_name"),
        "reward_type": traj.get("reward_type"),
        "cumulative_reward": traj.get("cumulative_reward"),
        "improvement": traj.get("improvement"),
        "episode_rewards": rewards,
        "episode_turns": traj.get("episode_turns") or [],
        "episode_outcomes": slim_outcomes(traj.get("episode_outcomes")),
        "episode_configs": traj.get("episode_configs") or [],
        "reasoning_trace": traj.get("reasoning_trace") or [],
        "env_params": traj.get("env_params") or {},
        "conversation": traj.get("conversation") or [],
        "agent_assignments": traj.get("agent_assignments") or [],
    }
    summary = {
        "variant": variant,
        "model": model,
        "env": env,
        "latent": latent,
        "prompt": prompt,
        "feedback": feedback,
        "horizon": horizon,
        "seed": traj.get("seed"),
        "n_episodes": len(rewards),
        "cumulative_reward": round(traj.get("cumulative_reward") or sum(rewards), 4),
        "init_reward": round(rewards[0], 4) if rewards else None,
        "final_reward": round(rewards[-1], 4) if rewards else None,
        "gain_pct": gain_pct(rewards),
    }
    return rec, summary


def out_path(s):
    cfg = "%s__%s__%s" % (slug(s["prompt"]), slug(s["feedback"]), slug(s["horizon"]))
    rel = os.path.join(
        "trajectories", slug(s["variant"]), slug(s["env"]), slug(s["latent"]),
        cfg, "%s__s%s.json" % (slug(s["model"]), slug(s["seed"])),
    )
    return rel


def write_traj(rec, summary):
    rel = out_path(summary)
    summary["file"] = rel.replace(os.sep, "/")
    abspath = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(abspath), exist_ok=True)
    with open(abspath, "w", encoding="utf-8") as f:
        json.dump(rec, f, ensure_ascii=False, separators=(",", ":"))


# ----------------------------------------------------------------------------- ingest
def ingest_frontier(rows):
    n = 0
    files = glob.glob(os.path.join(FRONTIER_ROOT, "openrouter__*", "*", "traj_*.json"))
    print("[frontier] %d trajectory files found" % len(files))
    for fp in files:
        try:
            traj = json.load(open(fp, encoding="utf-8"))
        except Exception as e:
            print("  skip (parse error):", fp, e)
            continue
        rec, summary = compact(traj, "frontier")
        if not rec["conversation"]:
            continue
        write_traj(rec, summary)
        rows.append(summary)
        n += 1
        if n % 500 == 0:
            print("  ...wrote %d" % n)
    print("[frontier] wrote %d" % n)


def extract_all_trajs(html_path):
    txt = open(html_path, encoding="utf-8").read()
    key = "const ALL_TRAJS = "
    i = txt.find(key)
    if i < 0:
        raise RuntimeError("ALL_TRAJS not found in %s" % html_path)
    arr, _ = json.JSONDecoder().raw_decode(txt, i + len(key))
    return arr


def ingest_qwen(rows):
    for variant, src in QWEN_SOURCES.items():
        if isinstance(src, list):
            if not src:
                print("[%s] no source html found, skipping" % variant)
                continue
            src = sorted(src)[0]
        if not os.path.exists(src):
            print("[%s] missing: %s" % (variant, src))
            continue
        arr = extract_all_trajs(src)
        print("[%s] %d trajs from %s" % (variant, len(arr), os.path.relpath(src, BENCH)))
        n = 0
        for traj in arr:
            rec, summary = compact(traj, variant)
            if not rec["conversation"]:
                continue
            write_traj(rec, summary)
            rows.append(summary)
            n += 1
        print("[%s] wrote %d" % (variant, n))


# ----------------------------------------------------------------------------- index
def build_index(rows):
    variants = sorted({r["variant"] for r in rows}, key=lambda v: list(VARIANT_LABELS).index(v) if v in VARIANT_LABELS else 99)
    models = sorted({r["model"] for r in rows})
    prompts = sorted({r["prompt"] for r in rows if r["prompt"]})
    feedbacks = sorted({r["feedback"] for r in rows if r["feedback"]})
    horizons = sorted({r["horizon"] for r in rows if r["horizon"]})

    envs = {}
    for r in rows:
        e = r["env"]
        if not e:
            continue
        envs.setdefault(e, set()).add(r["latent"])
    env_block = {e: {"label": ENV_LABELS.get(e, e), "latents": sorted(v)} for e, v in sorted(envs.items())}

    index = {
        "generated_from": os.path.relpath(BENCH),
        "counts": {"trajectories": len(rows)},
        "variant_labels": VARIANT_LABELS,
        "model_labels": {v: v for v in models},
        "env_labels": ENV_LABELS,
        "variants": variants,
        "models": models,
        "environments": env_block,
        "prompts": prompts,
        "feedbacks": feedbacks,
        "horizons": horizons,
        "trajectories": rows,
    }
    with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, separators=(",", ":"))
    print("[index] %d rows -> data/index.json (%d KB)" % (
        len(rows), os.path.getsize(os.path.join(OUT, "index.json")) // 1024))


def main():
    os.makedirs(OUT_TRAJ, exist_ok=True)
    rows = []
    ingest_frontier(rows)
    ingest_qwen(rows)
    if not rows:
        print("No trajectories ingested — check source paths.", file=sys.stderr)
        sys.exit(1)
    build_index(rows)
    print("Done. Total trajectories:", len(rows))


if __name__ == "__main__":
    main()
