#!/usr/bin/env python3
"""
export_figures.py — Copy a curated set of result figures (PNG) from the paper's plot
directory into assets/img/ with stable, descriptive filenames the HTML references.
Also converts a couple of anecdote PDFs to PNG (best-effort, needs pdftoppm/pdftocairo).

Run:  python3 scripts/export_figures.py
Missing sources are warned about and skipped (so it never hard-fails).
"""

import os
import shutil
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(HERE)
IMG = os.path.join(SITE, "assets", "img")

BENCH = "/shared/share_mala/daksh/meta-rl-new-merged/skyrl-train/benchmark"
FIG = os.path.join(BENCH, "neurips_plots", "figures")
ANEC = os.path.join(BENCH, "neurips_plots", "anecdotes")

# src (relative to FIG)  ->  dest filename (in assets/img)
COPY = {
    # hero / grids
    "grouped_combined/no_info_models_grid.png": "grid_no_info_models.png",
    "grouped_combined/full_info_harms_grid.png": "grid_full_info_harms.png",
    # main per-episode curves
    "main/01_envs_reward_per_episode.png": "main_envs_reward.png",
    "main/02_models_reward_per_episode.png": "main_models_reward.png",
    "main/02_models_turns_per_episode.png": "main_models_turns.png",
    "main/03_prompts_reward_per_episode.png": "main_prompts_reward.png",
    "main/04_feedbacks_reward_per_episode.png": "main_feedbacks_reward.png",
    "main/05_prompts_per_env_reward.png": "main_prompts_per_env.png",
    # failure modes
    "targeted/set3_no_info_models.png": "set3_no_info_models.png",
    "targeted/T1_gpt4o_no_some_info_reward.png": "t1_gpt4o_no_some.png",
    "targeted/T2_claude_gemini_no_info_reward.png": "t2_neglect.png",
    "targeted/T3_claude_gemini_some_info_reward.png": "t3_breakdown.png",
    "targeted/T5_grid_env_prompt_models_reward.png": "t5_grid_env_prompt.png",
    "targeted/T6_full_info_harms_reward.png": "t6_full_info_harms.png",
    # full-info-harms detail
    "full_info_harms/together_pingpong_reward.png": "harm_pingpong.png",
    "full_info_harms/together_wordladder_reward.png": "harm_wordladder.png",
    "full_info_harms/single_gpt4o_two_ranges_reward.png": "harm_two_ranges.png",
    # cross-task RL / agent switching / exploration-exploitation
    "double_agent_ng_set_of_3/base__VS__ng_set3_ne10_avg.png": "agentswitch_ng_base_vs_cross.png",
    "double_agent_ng_set_of_3/ng_set3_ne1__VS__ng_set3_ne10_avg.png": "agentswitch_ng_single_vs_cross.png",
    "double_agent_v1_4envs/base__VS__v1_4envs_ne10_avg.png": "agentswitch_4envs.png",
    # OOD / training-curve style
    "v1_loo_comparison/grouped_cumulative.png": "loo_cumulative.png",
    "v1_finetune_bars/grouped_cumulative.png": "finetune_cumulative.png",
    "v1_3lats_comparison/grouped_cumulative.png": "lats_cumulative.png",
    # design choices (prompt/feedback sweep ~ Fig 5)
    "v1_4envs_pf_sweep/v1_4envs_pf_sweep_by_eval.png": "pf_sweep_by_eval.png",
    "v1_4envs_pf_sweep/v1_4envs_pf_sweep_by_env.png": "pf_sweep_by_env.png",
}

# anecdote PDFs to rasterize (best effort) -> dest PNG basename (no extension)
ANEC_PDFS = {
    "section2_T1_two_ranges_standalone.pdf": "anec_neglect",
    "section2_FH6_two_ranges_standalone.pdf": "anec_miscalibration",
}


def copy_pngs():
    os.makedirs(IMG, exist_ok=True)
    ok = miss = 0
    for src, dst in COPY.items():
        s = os.path.join(FIG, src)
        if os.path.exists(s):
            shutil.copyfile(s, os.path.join(IMG, dst))
            ok += 1
        else:
            print("  [skip] missing:", src)
            miss += 1
    print("[png] copied %d, skipped %d" % (ok, miss))


def convert_pdfs():
    tool = None
    for t in ("pdftocairo", "pdftoppm"):
        if shutil.which(t):
            tool = t
            break
    if not tool:
        print("[pdf] no pdftocairo/pdftoppm; skipping anecdote conversion")
        return
    for src, base in ANEC_PDFS.items():
        s = os.path.join(ANEC, src)
        if not os.path.exists(s):
            print("  [skip] missing:", src)
            continue
        out = os.path.join(IMG, base)
        try:
            if tool == "pdftocairo":
                subprocess.run([tool, "-png", "-singlefile", "-r", "150", s, out], check=True)
            else:
                subprocess.run([tool, "-png", "-singlefile", "-r", "150", s, out], check=True)
            print("  [pdf] %s -> %s.png" % (src, base))
        except Exception as e:
            print("  [pdf] failed:", src, e)


if __name__ == "__main__":
    copy_pngs()
    convert_pdfs()
    print("Done -> assets/img")
