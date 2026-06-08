/* =============================================================================
   explorer.js : cascading trajectory picker + animated turn-by-turn playback,
   plus a before/after (base vs cross-task RL) comparison mode.
   Loads data/index.json once; fetches one compact trajectory JSON on demand.
   ============================================================================= */
(function () {
  const LEVELS = ["variant", "model", "env", "latent", "prompt", "feedback", "horizon", "seed"];
  const sel = {}; LEVELS.forEach(l => sel[l] = document.getElementById("f-" + l));
  // cmp is a derived flag: true iff we are in the RL-variants tab (the only mode that uses
  // the side-by-side compare layout). Set programmatically by setMode(); no UI toggle.
  const cmp = { checked: false };
  const statusEl = document.getElementById("status");
  // Forward refs: setMode/renderCurated/CURATED are defined inside the data-fetch closure
  // but reapply() (which fires from external explorer:prefill events) needs to call them.
  let _setMode = null, _renderCurated = null, _CURATED = null;
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
    if (!gt || typeof gt !== "object") return "·";
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
    return keys.slice(0, 4).map(k => k + "=" + JSON.stringify(gt[k])).join(", ") || "n/a";
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
    return `<details class="msg reasoning"><summary class="role">🧠 REASONING <span class="muted" style="font-weight:400">(internal, not shown to env)</span></summary><pre>${esc(text)}</pre></details>`;
  }
  function unitBanner(ep, last) {
    return last
      ? `<div class="ep-banner done">Task ${ep} ended. Trajectory complete.</div>`
      : `<div class="ep-banner">Task ${ep} ended → Task ${ep + 1}</div>`;
  }
  function unitTransition(content, ep) {
    return `<div class="msg" style="background:#fff8e1;border-left-color:#f9a825">
      <div class="role" style="color:#f57f17">TRANSITION → NEW TASK <span class="muted" style="font-weight:400">(task ${ep})</span></div><pre>${esc(content)}</pre></div>`;
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
        <div class="exp-metric"><div class="v">${(impr >= 0 ? "+" : "") + impr.toFixed(2)}</div><div class="l">gain (r<sub>N</sub>−r<sub>1</sub>)</div></div>
        <div class="exp-metric"><div class="v">${er.length}</div><div class="l">tasks</div></div>
      </div></div>`;
  }
  function epBarChart(values, color, valueFmt, title) {
    const N = values.length;
    if (!N) return "";
    const W = 360, H = 170;
    const padL = 34, padR = 10, padT = 12, padB = 26;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    const maxV = Math.max(1, ...values);
    const slot = innerW / N;
    const bw = Math.min(28, slot - 6);
    let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" width="100%" font-family="Inter, system-ui, sans-serif">`;
    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
      const y = padT + innerH * (1 - i / ticks);
      const v = (maxV * i / ticks).toFixed(maxV >= 5 ? 0 : 1);
      svg += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="#ececec" stroke-width="1"/>`;
      svg += `<text x="${padL - 5}" y="${y + 3}" text-anchor="end" font-size="9" fill="#888">${v}</text>`;
    }
    values.forEach((v, i) => {
      const x = padL + i * slot + (slot - bw) / 2;
      const bh = innerH * (v / maxV);
      const y = padT + innerH - bh;
      svg += `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" fill="${color}" rx="2"/>`;
      svg += `<text x="${x + bw / 2}" y="${y - 2}" text-anchor="middle" font-size="9" fill="#444" font-weight="600">${valueFmt(v)}</text>`;
      svg += `<text x="${x + bw / 2}" y="${padT + innerH + 12}" text-anchor="middle" font-size="9" fill="#666">${i + 1}</text>`;
    });
    svg += `</svg>`;
    return `<div class="exp-chart">
      <div class="exp-chart-title">${title}</div>
      ${svg}
    </div>`;
  }

  function summaryHTML(t) {
    const er = t.episode_rewards || [], et = t.episode_turns || [], o = t.episode_outcomes || [];
    const charts = `<details class="exp-charts-details">
      <summary>Rewards and turns per task</summary>
      <div class="exp-charts">
        ${epBarChart(er, "var(--accent)", v => v.toFixed(2), "Reward per task")}
        ${epBarChart(et, "#888888",       v => String(v),    "Turns per task")}
      </div>
    </details>`;
    let rows = "";
    for (let i = 0; i < er.length; i++) {
      const win = o[i] && (o[i].outcome_type === "win" || o[i].success);
      const gt = gtOf(t, i);
      rows += `<tr class="${win ? "" : ""}">
        <td style="text-align:left">${i + 1}</td>
        <td>${(er[i] || 0).toFixed(2)}</td>
        <td>${et[i] != null ? et[i] : "·"}</td>
        <td style="text-align:left"><span class="tag ${win ? "good" : "bad"}">${win ? "win" : "loss"}</span></td>
        <td style="text-align:left" class="small"><code>${esc(fmtGT(gt))}</code></td></tr>`;
    }
    const table = `<details class="exp-episode-details">
      <summary>Task sequence details (per-task reward, turns, outcome, ground truth)</summary>
      <div class="table-scroll" style="margin:8px 0 0">
        <table class="data gt-table"><thead><tr>
          <th style="text-align:left">Task</th><th>Reward</th><th>Turns</th>
          <th style="text-align:left">Outcome</th><th style="text-align:left">Latent / ground truth</th>
        </tr></thead><tbody>${rows}</tbody></table>
      </div>
    </details>`;
    return charts + table;
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
    }).catch(e => { statusEl.textContent = "Failed to load: " + e + ". Are you running a local server?"; });
  }

  // ---------------------------------------------------------------- compare mode
  // Renders the per-column header (metrics + collapsible per-episode reward/turn charts).
  function compareHeader(t, tagText, tagCls) {
    const er = t.episode_rewards || [], total = er.reduce((a, b) => a + b, 0);
    const impr = er.length >= 2 ? er[er.length - 1] - er[0] : 0;
    const et = t.episode_turns || [];
    const totalT = et.reduce((a, b) => a + b, 0);
    return `<div class="exp-head" style="margin:0;border-radius:0;border:none;border-bottom:1px solid var(--line)">
        <div class="sub"><span class="tag ${tagCls}">${tagText}</span></div>
        <h3 style="font-size:.92rem;margin-top:6px">${esc(t.benchmark_id || "")}</h3>
        <div class="exp-metrics">
          <div class="exp-metric"><div class="v">${total.toFixed(2)}</div><div class="l">total</div></div>
          <div class="exp-metric"><div class="v">${(impr >= 0 ? "+" : "") + impr.toFixed(2)}</div><div class="l">gain</div></div>
          <div class="exp-metric"><div class="v">${totalT}</div><div class="l">turns</div></div>
        </div>
      </div>
      <details class="exp-charts-details" style="margin:10px 12px 8px">
        <summary>Rewards and turns per task</summary>
        <div class="exp-charts">
          ${epBarChart(er, "var(--accent)", v => v.toFixed(2), "Reward per task")}
          ${epBarChart(et, "#888888",       v => String(v),    "Turns per task")}
        </div>
      </details>`;
  }

  // Module-scoped state for synchronized compare playback
  let CMP = { unitsA: [], unitsB: [], cursor: 0, max: 0, timer: null, speed: 700 };

  function cmpPause() {
    if (CMP.timer) { clearInterval(CMP.timer); CMP.timer = null; }
    const btn = document.getElementById("cmp-play");
    if (btn) btn.textContent = "▶ Play both";
  }
  function cmpSetCursor(c, animate) {
    CMP.cursor = Math.max(0, Math.min(CMP.max, c));
    const scrub = document.getElementById("cmp-scrub");
    const ctr = document.getElementById("cmp-ctr");
    if (scrub) scrub.value = CMP.cursor;
    if (ctr) ctr.textContent = CMP.cursor + " / " + CMP.max;
    ["A", "B"].forEach(side => {
      const wrap = document.getElementById("cmp-units-" + side);
      const total = side === "A" ? CMP.unitsA.length : CMP.unitsB.length;
      if (!wrap) return;
      const reveal = Math.min(CMP.cursor, total);
      const kids = wrap.children;
      let lastVisible = null;
      for (let i = 0; i < kids.length; i++) {
        const visible = i < reveal;
        kids[i].style.display = visible ? "" : "none";
        if (visible) lastVisible = kids[i];
      }
      if (animate && lastVisible) {
        wrap.scrollTop = lastVisible.offsetTop + lastVisible.offsetHeight - wrap.clientHeight;
      }
    });
  }
  function cmpPlay() {
    cmpPause();
    const btn = document.getElementById("cmp-play");
    if (btn) btn.textContent = "❚❚ Pause";
    CMP.timer = setInterval(() => {
      if (CMP.cursor >= CMP.max) { cmpPause(); return; }
      cmpSetCursor(CMP.cursor + 1, true);
    }, CMP.speed);
  }

  function loadCompare() {
    pause(); cmpPause();
    const rlA = document.getElementById("rl-A");
    const rlB = document.getElementById("rl-B");
    const variantA = (rlA && rlA.value) || "qwen-base";
    const variantB = (rlB && rlB.value) || "qwen-cross-rl";
    const labelOf = v => v === "qwen-base" ? "Base" : v === "qwen-single-rl" ? "Single-task RL" : "Cross-task RL";
    const tagOf   = v => v === "qwen-cross-rl" ? "good" : v === "qwen-single-rl" ? "warn" : "gray";
    const find = (variant) => ROWS.find(r => r.variant === variant && r.env === state.env &&
      r.latent === state.latent && r.prompt === state.prompt && r.feedback === state.feedback &&
      r.horizon === state.horizon && String(r.seed) === String(state.seed));
    const ra = find(variantA), rb = find(variantB);
    if (!ra && !rb) { compareRoot.innerHTML = `<div class="notice">No Qwen pair for this selection. Try Number Guessing / set_of_3.</div>`; return; }

    // Skeleton: heads + bodies side-by-side, with the shared player bar below the grid.
    compareRoot.innerHTML = `
      <div class="compare-grid" id="cmp-grid">
        <div class="card cmp-card">
          <div id="cmp-head-A"></div>
          <div class="compare-body" id="cmp-units-A"></div>
        </div>
        <div class="card cmp-card">
          <div id="cmp-head-B"></div>
          <div class="compare-body" id="cmp-units-B"></div>
        </div>
      </div>
      <div class="player-controls compare-player">
        <button class="btn" id="cmp-restart" title="Restart">⏮</button>
        <button class="btn primary" id="cmp-play" title="Play / pause">▶ Play both</button>
        <input type="range" class="scrub" id="cmp-scrub" min="0" max="0" value="0">
        <span class="ctr" id="cmp-ctr">0 / 0</span>
        <select id="cmp-speed" title="Playback speed">
          <option value="1400">0.5× (speed)</option>
          <option value="700" selected>1× (speed)</option>
          <option value="350">2× (speed)</option>
          <option value="150">4× (speed)</option>
        </select>
        <button class="btn" id="cmp-all" title="Reveal everything">Show full trajectory</button>
      </div>`;

    const want = [[variantA, ra, labelOf(variantA), tagOf(variantA)], [variantB, rb, labelOf(variantB), tagOf(variantB)]];
    statusEl.textContent = "Loading both panels…";
    Promise.all(want.map(([, row]) => row ? fetch(trajURL(row)).then(r => r.json()) : Promise.resolve(null)))
      .then(ts => {
        statusEl.textContent = "";
        ["A", "B"].forEach((side, i) => {
          const t = ts[i];
          const headEl = document.getElementById("cmp-head-" + side);
          const unitsEl = document.getElementById("cmp-units-" + side);
          if (!t) {
            if (headEl) headEl.innerHTML = `<div class="notice">Missing ${want[i][2]} for this selection.</div>`;
            (side === "A" ? CMP : CMP).unitsA = side === "A" ? [] : CMP.unitsA;
            return;
          }
          if (headEl) headEl.innerHTML = compareHeader(t, want[i][2], want[i][3]);
          const units = buildUnits(t);
          unitsEl.innerHTML = units.map(u => u.html).join("");
          if (side === "A") CMP.unitsA = units; else CMP.unitsB = units;
        });
        CMP.max = Math.max(CMP.unitsA.length, CMP.unitsB.length);
        CMP.cursor = 0;
        const scrub = document.getElementById("cmp-scrub");
        if (scrub) scrub.max = CMP.max;
        cmpSetCursor(0);

        // Wire the player bar
        const playBtn = document.getElementById("cmp-play");
        const speedEl = document.getElementById("cmp-speed");
        if (playBtn) playBtn.addEventListener("click", () => CMP.timer ? cmpPause() : cmpPlay());
        if (speedEl) speedEl.addEventListener("change", () => { CMP.speed = +speedEl.value; if (CMP.timer) cmpPlay(); });
        const restartBtn = document.getElementById("cmp-restart");
        if (restartBtn) restartBtn.addEventListener("click", () => { cmpPause(); cmpSetCursor(0); });
        const allBtn = document.getElementById("cmp-all");
        if (allBtn) allBtn.addEventListener("click", () => { cmpPause(); cmpSetCursor(CMP.max); });
        if (scrub) scrub.addEventListener("input", () => { cmpPause(); cmpSetCursor(+scrub.value); });
      }).catch(e => { statusEl.textContent = "Failed: " + e; });
  }

  // ---------------------------------------------------------------- cascade
  // In compare mode we only consider full 10-task sequences (ep10) from the Qwen
  // variants : the before/after story is about a sequence, not a single episode.
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
  function applyParams(params) {
    if (params.compare === "1" || params.compare === true) {
      cmp.checked = true;
      state.variant = "qwen-cross-rl";
      state.horizon = "ep10";
    } else if (params.compare === "0") {
      cmp.checked = false;
    }
    ["variant", "model", "env", "latent", "prompt", "feedback", "horizon", "seed"].forEach(k => {
      if (params[k] != null) state[k] = params[k];
    });
  }
  function applyURL() {
    const q = new URLSearchParams(location.search);
    const o = {}; for (const [k, v] of q) o[k] = v;
    applyParams(o);
  }
  // Called from any page button via:  document.dispatchEvent(new CustomEvent("explorer:prefill",{detail:{...}}))
  // Supported params:
  //   mode      = "frontier" | "failure-modes" | "rl-variants"
  //   fm        = "neglect" | "breakdown" | "miscalibration"  (failure-modes mode)
  //   idx       = index into CURATED[fm]                       (failure-modes mode)
  //   variantA  = "qwen-base" | "qwen-single-rl" | "qwen-cross-rl"  (rl-variants mode)
  //   variantB  = same                                              (rl-variants mode)
  //   env / latent / prompt / feedback / horizon / seed / model — cascade filters
  function reapply(params) {
    params = params || {};
    if (params.mode && _setMode) _setMode(params.mode);
    // failure-modes: pick a curated trajectory's prefill (override raw params if idx supplied)
    if (params.mode === "failure-modes" && params.fm && _CURATED) {
      const tiles = document.getElementById("exp-failure-tiles");
      if (tiles) {
        tiles.querySelectorAll(".exp-failure-tile").forEach(t =>
          t.classList.toggle("active", t.dataset.fm === params.fm));
      }
      if (_renderCurated) _renderCurated(params.fm);
      const list = _CURATED[params.fm] || [];
      const item = list[params.idx != null ? +params.idx : 0];
      if (item) Object.assign(params, item.prefill);
      // highlight the curated row matching idx
      const curated = document.getElementById("exp-failure-curated");
      if (curated) {
        curated.querySelectorAll(".curated-traj").forEach((b, i) =>
          b.classList.toggle("active", i === (params.idx != null ? +params.idx : 0)));
      }
    }
    // rl-variants: drive the two-side variant pickers
    if (params.mode === "rl-variants") {
      if (params.variantA) {
        const elA = document.getElementById("rl-A");
        if (elA) elA.value = params.variantA;
      }
      if (params.variantB) {
        const elB = document.getElementById("rl-B");
        if (elB) elB.value = params.variantB;
      }
    }
    applyParams(params);
    repopulate(0);
    // Re-apply hints in cascade order so the URL/event takes precedence over auto-picked values.
    LEVELS.forEach((lvl, i) => {
      if (params[lvl] != null) {
        const pool = rowsMatch(i);
        if (distinct(lvl, pool).map(String).includes(String(params[lvl]))) {
          state[lvl] = params[lvl]; repopulate(i);
        }
      }
    });
    refresh();
  }
  document.addEventListener("explorer:prefill", e => reapply(e.detail || {}));

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
    // playback controls
    document.getElementById("btn-play").addEventListener("click", play);
    document.getElementById("btn-next").addEventListener("click", () => { pause(); setCursor(cursor + 1, true); });
    document.getElementById("btn-prev").addEventListener("click", () => { pause(); setCursor(cursor - 1, false); });
    document.getElementById("btn-restart").addEventListener("click", () => { pause(); setCursor(0, false); });
    document.getElementById("btn-all").addEventListener("click", () => { pause(); setCursor(UNITS.length, false); });
    scrub.addEventListener("input", () => { pause(); setCursor(+scrub.value, false); });

    // ----- Mode tabs (Frontier / Failure modes / RL variants) -----
    const modeBar = document.getElementById("exp-modes");
    const failTiles = document.getElementById("exp-failure-tiles");
    const failCurated = document.getElementById("exp-failure-curated");
    const rlPickers = document.getElementById("exp-rl-pickers");
    const filterRow = document.querySelector(".exp-filters");

    // Which filter fields are relevant per mode. Variant is always hidden
    // (locked programmatically). Compare layout is driven by mode (no UI toggle).
    // failure-modes: filter row hidden entirely; only the curated trajectories are picker-able.
    const MODE_FIELDS = {
      "frontier":      ["model", "env", "latent", "prompt", "feedback", "horizon", "seed"],
      "failure-modes": [],
      "rl-variants":   ["env", "latent", "prompt", "feedback", "seed"],
    };
    const ALL_FIELDS = ["model", "env", "latent", "prompt", "feedback", "horizon", "seed"];

    // Curated trajectories per failure mode. Add more entries here over time.
    const CURATED = {
      neglect: [
        { label: "Claude Sonnet 4.6 · Number Guessing (set_of_3)",
          prefill: { variant: "frontier", model: "claude-sonnet-4-6", env: "number_guessing", latent: "set_of_3", prompt: "no_info" } },
        { label: "GPT-4o · Number Guessing (set_of_3)",
          prefill: { variant: "frontier", model: "gpt-4o", env: "number_guessing", latent: "set_of_3", prompt: "no_info" } },
        { label: "Gemini 2.5 Flash · Secretary (threshold_06)",
          prefill: { variant: "frontier", model: "gemini-2.5-flash", env: "secretary", latent: "threshold_06", prompt: "no_info" } },
      ],
      breakdown: [
        { label: "Gemini 2.5 Flash · Number Guessing (dynamic_range)",
          prefill: { variant: "frontier", model: "gemini-2.5-flash", env: "number_guessing", latent: "dynamic_range", prompt: "some_info" } },
        { label: "Claude Sonnet 4.6 · Number Guessing (two_ranges)",
          prefill: { variant: "frontier", model: "claude-sonnet-4-6", env: "number_guessing", latent: "two_ranges", prompt: "some_info" } },
        { label: "GPT-4o · Mastermind (consecutive)",
          prefill: { variant: "frontier", model: "gpt-4o", env: "mastermind", latent: "consecutive", prompt: "some_info" } },
      ],
      miscalibration: [
        { label: "Claude Sonnet 4.6 · Bandits (ping_pong)",
          prefill: { variant: "frontier", model: "claude-sonnet-4-6", env: "bandits", latent: "ping_pong", prompt: "full_info" } },
        { label: "GPT-4o · Word Ladder (hub_word_3letter)",
          prefill: { variant: "frontier", model: "gpt-4o", env: "wordladder", latent: "hub_word_3letter", prompt: "full_info" } },
        { label: "Gemini 2.5 Flash · Number Guessing (set_of_2)",
          prefill: { variant: "frontier", model: "gemini-2.5-flash", env: "number_guessing", latent: "set_of_2", prompt: "full_info" } },
      ],
    };

    function applyFieldVisibility(mode) {
      const shown = new Set(MODE_FIELDS[mode] || ALL_FIELDS);
      ALL_FIELDS.forEach(k => {
        const el = document.getElementById("fld-" + k);
        if (el) el.style.display = shown.has(k) ? "" : "none";
      });
      const fv = document.getElementById("fld-variant");
      if (fv) fv.style.display = "none";
      // Hide the entire filter row in failure-modes mode (picker = curated list only)
      if (filterRow) filterRow.style.display = (mode === "failure-modes") ? "none" : "";
    }

    function renderCurated(fm) {
      if (!failCurated) return;
      const list = CURATED[fm] || [];
      failCurated.innerHTML = list.map((item, i) => `
        <button class="curated-traj" data-idx="${i}" data-fm="${fm}">
          <span class="curated-traj-idx">${i + 1}</span>
          <span class="curated-traj-label">${item.label}</span>
        </button>`).join("");
      failCurated.hidden = list.length === 0;
    }

    function setMode(mode) {
      if (!modeBar) return;
      modeBar.querySelectorAll(".exp-mode-btn").forEach(b =>
        b.classList.toggle("active", b.dataset.mode === mode));
      failTiles.hidden  = (mode !== "failure-modes");
      rlPickers.hidden  = (mode !== "rl-variants");
      // Reset curated list (and tile selection) when leaving failure-modes.
      if (mode !== "failure-modes") {
        if (failCurated) { failCurated.innerHTML = ""; failCurated.hidden = true; }
        failTiles.querySelectorAll(".exp-failure-tile.active").forEach(t => t.classList.remove("active"));
      }
      applyFieldVisibility(mode);
      if (mode === "frontier") {
        cmp.checked = false;
        state.variant = "frontier";
        repopulate(0);
        refresh();
      } else if (mode === "rl-variants") {
        cmp.checked = true;
        state.variant = "qwen-cross-rl"; state.horizon = "ep10";
        repopulate(0);
        refresh();
      } else if (mode === "failure-modes") {
        cmp.checked = false;
        state.variant = "frontier";
        repopulate(0);
        refresh();
      }
    }
    if (modeBar) {
      modeBar.addEventListener("click", e => {
        const btn = e.target.closest(".exp-mode-btn");
        if (btn) setMode(btn.dataset.mode);
      });
    }
    // Failure-mode tile click → render that mode's curated trajectory list + auto-load first.
    if (failTiles) {
      failTiles.addEventListener("click", e => {
        const tile = e.target.closest(".exp-failure-tile");
        if (!tile) return;
        failTiles.querySelectorAll(".exp-failure-tile").forEach(t =>
          t.classList.toggle("active", t === tile));
        const fm = tile.dataset.fm;
        renderCurated(fm);
        const first = (CURATED[fm] || [])[0];
        if (first) reapply(first.prefill);
      });
    }
    // Curated trajectory click (inside the failure-modes mode list)
    if (failCurated) {
      failCurated.addEventListener("click", e => {
        const btn = e.target.closest(".curated-traj");
        if (!btn) return;
        failCurated.querySelectorAll(".curated-traj").forEach(b =>
          b.classList.toggle("active", b === btn));
        const fm = btn.dataset.fm, idx = +btn.dataset.idx;
        const item = (CURATED[fm] || [])[idx];
        if (item) reapply(item.prefill);
      });
    }
    // RL picker changes (Mode 2): re-load the compare view with the new variant pair.
    ["rl-A", "rl-B"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("change", () => { if (cmp.checked) loadCompare(); });
    });
    // Expose for reapply() (called from external explorer:prefill events).
    _setMode = setMode;
    _renderCurated = renderCurated;
    _CURATED = CURATED;
    // Initial mode: honor URL ?mode=... or legacy ?compare=1, else default to Frontier.
    const urlQ = new URLSearchParams(location.search);
    let initMode = urlQ.get("mode");
    if (!initMode && urlQ.get("compare") === "1") initMode = "rl-variants";
    if (!initMode) initMode = "frontier";
    if (initMode !== "frontier" || urlQ.get("fm") || urlQ.get("variantA") || urlQ.get("variantB")) {
      const o = {}; urlQ.forEach((v, k) => o[k] = v); o.mode = initMode;
      reapply(o);
    } else {
      setMode("frontier");
    }

    refresh();
  }).catch(e => { statusEl.textContent = "Could not load data/index.json. Run a local server (see README). " + e; });
})();
