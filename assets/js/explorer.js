/* =============================================================================
   explorer.js — cascading trajectory picker + animated turn-by-turn playback,
   plus a before/after (base vs cross-task RL) comparison mode.
   Loads data/index.json once; fetches one compact trajectory JSON on demand.
   ============================================================================= */
(function () {
  const LEVELS = ["variant", "model", "env", "latent", "prompt", "feedback", "horizon", "seed"];
  const sel = {}; LEVELS.forEach(l => sel[l] = document.getElementById("f-" + l));
  const cmp = document.getElementById("f-compare");
  const statusEl = document.getElementById("status");
  let IDX = null, ROWS = [], LABELS = {};
  const state = {};

  const esc = s => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // index.json stores file paths relative to data/; resolve from the site root.
  const trajURL = row => "data/" + row.file;

  // ---------------------------------------------------------------- labels
  function label(level, v) {
    if (level === "variant") return (LABELS.variant_labels && LABELS.variant_labels[v]) || v;
    if (level === "env") return (LABELS.env_labels && LABELS.env_labels[v]) || v;
    if (level === "seed") return "seed " + v;
    return v;
  }

  // ---------------------------------------------------------------- ground truth fmt
  function fmtGT(gt) {
    if (!gt || typeof gt !== "object") return "—";
    if (gt.ground_truth && typeof gt.ground_truth === "object") {
      const e = Object.entries(gt.ground_truth);
      if (e.length && typeof e[0][1] === "number") {
        const best = e.reduce((a, b) => b[1] > a[1] ? b : a);
        return "best: " + best[0] + " (" + e.map(([k, v]) => k + " " + (+v).toFixed(2)).join(", ") + ")";
      }
    }
    if ("target_number" in gt) return "target = " + gt.target_number;
    if ("secret_code" in gt) return "code = [" + gt.secret_code.join(", ") + "]";
    if ("start_word" in gt && "target_word" in gt) {
      const p = gt.optimal_path ? "  (optimal: " + gt.optimal_path.join(" → ") + ")" : "";
      return gt.start_word + " → " + gt.target_word + p;
    }
    if ("target_word" in gt) return "word = " + gt.target_word;
    if ("draws" in gt && Array.isArray(gt.draws)) {
      const mx = Math.max(...gt.draws), pos = gt.draws.indexOf(mx);
      return "max " + mx.toFixed(2) + " at position " + (pos + 1) + " of " + gt.draws.length;
    }
    const keys = Object.keys(gt).filter(k => !/max_turns|num_|length|duplicates|word_length/.test(k));
    return keys.slice(0, 4).map(k => k + "=" + JSON.stringify(gt[k])).join(", ") || "—";
  }
  const gtOf = (t, i) => {
    const c = t.episode_configs || [], o = t.episode_outcomes || [];
    if (c[i] && Object.keys(c[i]).length) return c[i];
    if (o[i] && o[i].ground_truth) return o[i].ground_truth;
    return null;
  };

  // ---------------------------------------------------------------- build render units
  function unitMsg(role, content, ep) {
    const tag = ep ? ` <span class="muted" style="font-weight:400">(ep ${ep})</span>` : "";
    return `<div class="msg ${role}"><div class="role">${role.toUpperCase()}${tag}</div><pre>${esc(content)}</pre></div>`;
  }
  function unitReason(text) {
    return `<details class="msg reasoning"><summary class="role">🧠 REASONING <span class="muted" style="font-weight:400">(internal — not shown to env)</span></summary><pre>${esc(text)}</pre></details>`;
  }
  function unitBanner(ep, last) {
    return last
      ? `<div class="ep-banner done">Episode ${ep} ended — trajectory complete</div>`
      : `<div class="ep-banner">Episode ${ep} ended → Episode ${ep + 1}</div>`;
  }
  function unitTransition(content, ep) {
    return `<div class="msg" style="background:#fff8e1;border-left-color:#f9a825">
      <div class="role" style="color:#f57f17">TRANSITION → NEW EPISODE <span class="muted" style="font-weight:400">(ep ${ep})</span></div><pre>${esc(content)}</pre></div>`;
  }

  function buildUnits(t) {
    const conv = t.conversation || [], reasoning = t.reasoning_trace || [], et = t.episode_turns || [];
    const epB = []; let c = 0; for (const x of et) { c += x; epB.push(c); }
    const units = []; let aIdx = 0, ep = 0;
    for (const m of conv) {
      const role = (m.role || "").toLowerCase(), content = m.content || "";
      if (role === "assistant") {
        if (aIdx < reasoning.length && reasoning[aIdx]) units.push({ html: unitReason(reasoning[aIdx]), ep });
        aIdx++;
        const boundary = ep < epB.length && aIdx === epB[ep];
        units.push({ html: unitMsg("assistant", content, ep + 1), ep });
        if (boundary) { const last = ep === epB.length - 1; units.push({ html: unitBanner(ep + 1, last), ep, isBoundary: true }); ep++; }
      } else if (role === "system") {
        units.push({ html: unitMsg("system", content), ep });
      } else {
        const transition = ep > 0 && aIdx === epB[ep - 1];
        units.push({ html: transition ? unitTransition(content, ep + 1) : unitMsg("user", content, ep + 1), ep });
      }
    }
    return units;
  }

  // ---------------------------------------------------------------- header + summary
  function headerHTML(t) {
    const er = t.episode_rewards || [];
    const total = er.reduce((a, b) => a + b, 0);
    const impr = er.length >= 2 ? er[er.length - 1] - er[0] : 0;
    return `<div class="exp-head">
      <h3>${esc(t.benchmark_id || (t.env + "/" + t.latent))}</h3>
      <div class="sub">${esc(label("variant", t.variant))} · ${esc(t.model)} · prompt ${esc(t.prompt)} · feedback ${esc(t.feedback)} · seed ${esc(t.seed)}</div>
      <div class="exp-metrics">
        <div class="exp-metric"><div class="v">${total.toFixed(2)}</div><div class="l">total reward</div></div>
        <div class="exp-metric"><div class="v">${(impr >= 0 ? "+" : "") + impr.toFixed(2)}</div><div class="l">gain (G<sub>N</sub>−G<sub>1</sub>)</div></div>
        <div class="exp-metric"><div class="v">${er.length}</div><div class="l">episodes</div></div>
      </div></div>`;
  }
  function summaryHTML(t) {
    const er = t.episode_rewards || [], et = t.episode_turns || [], o = t.episode_outcomes || [];
    let rows = "";
    for (let i = 0; i < er.length; i++) {
      const win = o[i] && (o[i].outcome_type === "win" || o[i].success);
      const gt = gtOf(t, i);
      rows += `<tr class="${win ? "" : ""}">
        <td style="text-align:left">${i + 1}</td>
        <td>${(er[i] || 0).toFixed(2)}</td>
        <td>${et[i] != null ? et[i] : "—"}</td>
        <td style="text-align:left"><span class="tag ${win ? "good" : "bad"}">${win ? "win" : "loss"}</span></td>
        <td style="text-align:left" class="small"><code>${esc(fmtGT(gt))}</code></td></tr>`;
    }
    return `<div class="table-scroll" style="margin:12px 0">
      <table class="data gt-table"><thead><tr>
        <th style="text-align:left">Ep</th><th>Reward</th><th>Turns</th>
        <th style="text-align:left">Outcome</th><th style="text-align:left">Latent / ground truth</th>
      </tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  // ---------------------------------------------------------------- single playback
  const view = document.getElementById("single-view");
  const compareRoot = document.getElementById("compare-root");
  const controls = document.getElementById("controls");
  const body = document.getElementById("exp-body");
  const scrub = document.getElementById("scrub");
  const ctr = document.getElementById("ctr");
  const btnPlay = document.getElementById("btn-play");
  let UNITS = [], cursor = 0, rendered = 0, timer = null;

  function setCursor(n, animate) {
    n = Math.max(0, Math.min(UNITS.length, n));
    if (n > rendered) {
      let html = "";
      for (let i = rendered; i < n; i++) html += UNITS[i].html;
      body.insertAdjacentHTML("beforeend", html);
      const kids = body.children;
      if (animate && kids.length) kids[kids.length - 1].scrollIntoView({ behavior: "smooth", block: "nearest" });
    } else if (n < rendered) {
      let html = "";
      for (let i = 0; i < n; i++) html += UNITS[i].html;
      body.innerHTML = html;
    }
    rendered = n; cursor = n;
    scrub.value = n; ctr.textContent = n + " / " + UNITS.length;
  }
  function play() {
    if (timer) return pause();
    if (cursor >= UNITS.length) setCursor(0, false);
    btnPlay.innerHTML = "⏸ Pause";
    const step = () => {
      if (cursor >= UNITS.length) { pause(); return; }
      setCursor(cursor + 1, true);
      const ms = +document.getElementById("speed").value;
      // linger a bit longer on episode banners
      const extra = UNITS[cursor - 1] && UNITS[cursor - 1].isBoundary ? 1.6 : 1;
      timer = setTimeout(step, ms * extra);
    };
    step();
  }
  function pause() { if (timer) clearTimeout(timer); timer = null; btnPlay.innerHTML = "▶ Play"; }

  function loadSingle(row) {
    pause();
    statusEl.textContent = "Loading trajectory…";
    fetch(trajURL(row)).then(r => r.json()).then(t => {
      statusEl.textContent = "";
      document.getElementById("exp-head").innerHTML = headerHTML(t);
      document.getElementById("exp-summary").innerHTML = summaryHTML(t);
      UNITS = buildUnits(t);
      body.innerHTML = ""; rendered = 0; cursor = 0;
      scrub.max = UNITS.length; controls.style.display = "flex";
      setCursor(0, false);
    }).catch(e => { statusEl.textContent = "Failed to load: " + e + " — are you running a local server?"; });
  }

  // ---------------------------------------------------------------- compare mode
  function compareColumn(t, tagText, tagCls) {
    const er = t.episode_rewards || [], total = er.reduce((a, b) => a + b, 0);
    const impr = er.length >= 2 ? er[er.length - 1] - er[0] : 0;
    const turns = (t.episode_turns || []);
    const maxT = Math.max(1, ...turns);
    const bars = turns.map((tt, i) => {
      const win = (t.episode_outcomes || [])[i] && ((t.episode_outcomes[i].outcome_type === "win") || t.episode_outcomes[i].success);
      return `<div title="ep ${i + 1}: ${tt} turns, reward ${(er[i] || 0).toFixed(2)}"
        style="flex:1;display:flex;flex-direction:column;justify-content:end;align-items:center;gap:2px">
        <div style="width:80%;height:${Math.round(tt / maxT * 60)}px;border-radius:3px 3px 0 0;background:${win ? "var(--good)" : "var(--bad)"}"></div>
        <div style="font-size:.6rem;color:var(--faint)">${i + 1}</div></div>`;
    }).join("");
    const transcript = buildUnits(t).map(u => u.html).join("");
    return `<div class="card" style="padding:0;overflow:hidden">
      <div class="exp-head" style="margin:0;border-radius:0">
        <div class="sub"><span class="tag ${tagCls}">${tagText}</span></div>
        <h3 style="font-size:.92rem;margin-top:6px">${esc(t.benchmark_id || "")}</h3>
        <div class="exp-metrics">
          <div class="exp-metric"><div class="v">${total.toFixed(2)}</div><div class="l">total</div></div>
          <div class="exp-metric"><div class="v">${(impr >= 0 ? "+" : "") + impr.toFixed(2)}</div><div class="l">gain</div></div>
          <div class="exp-metric"><div class="v">${(t.episode_turns || []).reduce((a, b) => a + b, 0)}</div><div class="l">turns</div></div>
        </div>
      </div>
      <div style="padding:12px 14px 4px"><div class="small muted" style="margin-bottom:4px">Turns per episode (shorter = faster)</div>
        <div style="display:flex;align-items:end;gap:3px;height:72px">${bars}</div></div>
      <details style="padding:8px 14px 14px"><summary class="small muted">Full transcript</summary>
        <div style="max-height:460px;overflow:auto;margin-top:8px">${transcript}</div></details>
    </div>`;
  }

  function loadCompare() {
    pause();
    const find = (variant) => ROWS.find(r => r.variant === variant && r.env === state.env &&
      r.latent === state.latent && r.prompt === state.prompt && r.feedback === state.feedback &&
      r.horizon === state.horizon && String(r.seed) === String(state.seed));
    const base = find("qwen-base"), cross = find("qwen-cross-rl");
    if (!base && !cross) { compareRoot.innerHTML = `<div class="notice">No Qwen before/after pair for this selection. Try Number Guessing / set_of_3.</div>`; return; }
    compareRoot.innerHTML = `<p class="small muted">Same task, same seed — Qwen3-8B before vs. after Cross-Task RL.
      Notice how the trained agent solves later episodes in fewer turns.</p>
      <div class="compare-grid" id="cmp-grid"></div>`;
    const grid = document.getElementById("cmp-grid");
    statusEl.textContent = "Loading before/after…";
    const want = [["qwen-base", base, "before — base", "gray"], ["qwen-cross-rl", cross, "after — cross-task RL", "good"]];
    Promise.all(want.map(([, row]) => row ? fetch(trajURL(row)).then(r => r.json()) : Promise.resolve(null)))
      .then(ts => {
        statusEl.textContent = "";
        grid.innerHTML = ts.map((t, i) => t ? compareColumn(t, want[i][2], want[i][3])
          : `<div class="notice">Missing ${want[i][2]} for this selection.</div>`).join("");
      }).catch(e => { statusEl.textContent = "Failed: " + e; });
  }

  // ---------------------------------------------------------------- cascade
  // In compare mode we only consider full 10-task sequences (ep10) from the Qwen
  // variants — the before/after story is about a sequence, not a single episode.
  function baseRows() {
    if (cmp.checked) return ROWS.filter(r => r.horizon === "ep10" && /^qwen/.test(r.variant));
    return ROWS;
  }
  function rowsMatch(uptoIdx) {
    return baseRows().filter(r => {
      for (let i = 0; i < uptoIdx; i++) if (String(r[LEVELS[i]]) !== String(state[LEVELS[i]])) return false;
      return true;
    });
  }
  function distinct(level, pool) {
    const seen = []; const s = new Set();
    for (const r of pool) { const v = String(r[level]); if (!s.has(v)) { s.add(v); seen.push(r[level]); } }
    return seen;
  }
  function repopulate(fromIdx) {
    for (let i = fromIdx; i < LEVELS.length; i++) {
      const level = LEVELS[i];
      const pool = rowsMatch(i);
      let opts = distinct(level, pool);
      if (level === "variant") opts = opts.sort((a, b) =>
        (IDX.variants.indexOf(a)) - (IDX.variants.indexOf(b)));
      if (level === "seed") opts = opts.slice().sort((a, b) => a - b);
      const cur = state[level];
      const valid = opts.map(String).includes(String(cur)) ? cur : opts[0];
      state[level] = valid;
      sel[level].innerHTML = opts.map(o =>
        `<option value="${esc(o)}" ${String(o) === String(valid) ? "selected" : ""}>${esc(label(level, o))}</option>`).join("");
    }
  }
  function currentRow() {
    const pool = rowsMatch(LEVELS.length);
    return pool[0] || null;
  }
  function refresh() {
    const compare = cmp.checked;
    view.style.display = compare ? "none" : "";
    compareRoot.style.display = compare ? "" : "none";
    // lock variant/model in compare mode (pairing is base vs cross)
    sel.variant.disabled = compare; sel.model.disabled = compare;
    if (compare) loadCompare();
    else { const row = currentRow(); if (row) loadSingle(row); }
  }

  function onChange(level) {
    return () => {
      state[level] = sel[level].value;
      repopulate(LEVELS.indexOf(level) + 1);
      refresh();
    };
  }

  // ---------------------------------------------------------------- init
  function applyURL() {
    const q = new URLSearchParams(location.search);
    ["env", "latent", "model", "prompt", "feedback", "horizon", "seed", "variant"].forEach(k => {
      if (q.get(k)) state[k] = q.get(k);
    });
    if (q.get("compare") === "1") { cmp.checked = true; state.variant = "qwen-cross-rl"; }
  }

  fetch("data/index.json").then(r => r.json()).then(idx => {
    IDX = idx; ROWS = idx.trajectories; LABELS = idx;
    // defaults
    state.variant = "frontier"; state.horizon = "ep10";
    applyURL();
    // seed cascade from the top, honoring any URL hints by trying to keep them valid
    // We repopulate, but allow URL-provided values to win where possible:
    const hinted = { ...state };
    repopulate(0);
    // re-apply hints if they exist among options (walk levels)
    LEVELS.forEach((lvl, i) => {
      if (hinted[lvl] != null) {
        const pool = rowsMatch(i);
        if (distinct(lvl, pool).map(String).includes(String(hinted[lvl]))) {
          state[lvl] = hinted[lvl]; repopulate(i);
        }
      }
    });
    // wire events
    LEVELS.forEach(l => sel[l].addEventListener("change", onChange(l)));
    cmp.addEventListener("change", () => {
      if (cmp.checked) { state.variant = "qwen-cross-rl"; state.horizon = "ep10"; repopulate(0); }
      else { state.variant = "frontier"; repopulate(0); }
      refresh();
    });
    // playback controls
    document.getElementById("btn-play").addEventListener("click", play);
    document.getElementById("btn-next").addEventListener("click", () => { pause(); setCursor(cursor + 1, true); });
    document.getElementById("btn-prev").addEventListener("click", () => { pause(); setCursor(cursor - 1, false); });
    document.getElementById("btn-restart").addEventListener("click", () => { pause(); setCursor(0, false); });
    document.getElementById("btn-all").addEventListener("click", () => { pause(); setCursor(UNITS.length, false); });
    scrub.addEventListener("input", () => { pause(); setCursor(+scrub.value, false); });

    refresh();
  }).catch(e => { statusEl.textContent = "Could not load data/index.json — run a local server (see README). " + e; });
})();
