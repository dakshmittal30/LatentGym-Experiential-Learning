/* =============================================================================
   leaderboard.js — aggregate data/index.json into a sortable agent leaderboard.
   Rows = (variant, model). Columns = avg cumulative reward, avg gain%, avg final.
   Filters: prompt / feedback / horizon / environment. Pure client-side.
   ============================================================================= */
(function () {
  const elTable = document.getElementById("lb-table");
  if (!elTable) return;

  const VARIANT_ORDER = ["frontier", "qwen-base", "qwen-single-rl", "qwen-cross-rl"];
  const VARIANT_LABEL = {
    "frontier": "", "qwen-base": "Qwen3-8B · base",
    "qwen-single-rl": "Qwen3-8B · single-task RL", "qwen-cross-rl": "Qwen3-8B · cross-task RL",
  };
  let ROWS = [];
  let sortKey = "cum", sortDir = -1;

  function agentName(r) {
    if (r.variant === "frontier") return r.model;
    return VARIANT_LABEL[r.variant] || r.variant;
  }
  function agentKind(r) {
    if (r.variant === "frontier") return "frontier";
    return r.variant;
  }

  function opt(sel, vals, labels) {
    const s = document.getElementById(sel);
    s.innerHTML = `<option value="all">All</option>` +
      vals.map(v => `<option value="${v}">${labels ? labels(v) : v}</option>`).join("");
  }

  function aggregate(rows) {
    const fb = val("lb-feedback"), pr = val("lb-prompt"), hz = val("lb-horizon"), ev = val("lb-env");
    const groups = {};
    for (const r of rows) {
      if (fb !== "all" && r.feedback !== fb) continue;
      if (pr !== "all" && r.prompt !== pr) continue;
      if (hz !== "all" && r.horizon !== hz) continue;
      if (ev !== "all" && r.env !== ev) continue;
      if (r.cumulative_reward == null) continue;
      const key = r.variant + "|" + r.model;
      const g = groups[key] || (groups[key] = {
        variant: r.variant, model: r.model, n: 0, cum: 0, init: 0, fin: 0, ninit: 0, nfin: 0,
      });
      g.n++; g.cum += r.cumulative_reward;
      if (r.init_reward != null) { g.init += r.init_reward; g.ninit++; }
      if (r.final_reward != null) { g.fin += r.final_reward; g.nfin++; }
    }
    return Object.values(groups).map(g => {
      const init = g.ninit ? g.init / g.ninit : null;
      const fin = g.nfin ? g.fin / g.nfin : null;
      const gain = (init && fin != null) ? (fin - init) / init * 100 : null;
      return {
        variant: g.variant, model: g.model, n: g.n,
        cum: g.cum / g.n, fin: fin, gain: gain,
      };
    });
  }

  function val(id) { const e = document.getElementById(id); return e ? e.value : "all"; }

  function fmtGain(v) {
    if (v == null) return '<span class="muted">—</span>';
    const cls = v >= 0 ? "pos" : "neg";
    return `<span class="${cls}">${v >= 0 ? "+" : ""}${v.toFixed(0)}%</span>`;
  }

  function render() {
    const rows = aggregate(ROWS).sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (av == null) return 1; if (bv == null) return -1;
      if (typeof av === "string") return sortDir * av.localeCompare(bv);
      return sortDir * (av - bv);
    });
    // keep frontier models then qwen variants visually grouped when sorting by name
    const head = `<thead><tr>
      <th data-k="model" style="text-align:left">Agent</th>
      <th data-k="n">Configs</th>
      <th data-k="cum">Avg cumulative reward</th>
      <th data-k="gain">Avg gain</th>
      <th data-k="fin">Avg final reward</th>
    </tr></thead>`;
    const maxCum = Math.max(...rows.map(r => r.cum || 0));
    const body = rows.map(r => {
      const best = (r.cum === maxCum) ? " class=\"best\"" : "";
      return `<tr>
        <td style="text-align:left"><b>${agentName(r)}</b></td>
        <td>${r.n}</td>
        <td${best}>${r.cum != null ? r.cum.toFixed(2) : "—"}</td>
        <td>${fmtGain(r.gain)}</td>
        <td>${r.fin != null ? r.fin.toFixed(2) : "—"}</td>
      </tr>`;
    }).join("");
    elTable.innerHTML = head + "<tbody>" + body + "</tbody>";
    elTable.querySelectorAll("thead th").forEach(th => {
      const k = th.getAttribute("data-k");
      th.classList.toggle("sort-asc", k === sortKey && sortDir === 1);
      th.classList.toggle("sort-desc", k === sortKey && sortDir === -1);
      th.onclick = () => {
        if (sortKey === k) sortDir *= -1; else { sortKey = k; sortDir = -1; }
        render();
      };
    });
  }

  fetch("data/index.json").then(r => r.json()).then(idx => {
    ROWS = idx.trajectories;
    opt("lb-prompt", idx.prompts);
    opt("lb-feedback", idx.feedbacks);
    opt("lb-horizon", idx.horizons);
    opt("lb-env", Object.keys(idx.environments), v => idx.environments[v].label);
    // sensible default: compare full 10-task sequences
    const hz = document.getElementById("lb-horizon");
    if ([...hz.options].some(o => o.value === "ep10")) hz.value = "ep10";
    ["lb-prompt", "lb-feedback", "lb-horizon", "lb-env"].forEach(id =>
      document.getElementById(id).addEventListener("change", render));
    render();
  }).catch(e => { elTable.innerHTML = `<tbody><tr><td>Could not load data/index.json — run a local server (see README). ${e}</td></tr></tbody>`; });
})();
