/* ============================================================
   Cross-Task Adaptation : single-page interactions
   (panel switching, theme toggle, hero animation, metrics
   simulator, static result tables, environment cards).
   ============================================================ */

(function () {
  "use strict";

  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  // --------------------------------------------------------------- LINKS
  const LINKS = {
    paper: "#",                                              // arXiv / PDF : fill in
    code:  "https://github.com/dakshmittal30/Adaptation-website",
    blog:  "#",
  };
  ["paper-link", "paper-link-2", "paper-link-3", "paper-link-4", "paper-link-hero"].forEach(id => {
    const el = document.getElementById(id); if (el) el.href = LINKS.paper;
  });
  const codeLink = document.getElementById("code-link"); if (codeLink) codeLink.href = LINKS.code;

  // --------------------------------------------------------------- BIBTEX
  const BIBTEX = `@inproceedings{mittal2026latentgym,
  title     = {LatentGym: A Testbed for Cross-Task Experiential Learning with Controllable Latent Structure},
  author    = {Mittal, Daksh and Castellani, Tommaso and Yen, Thomson and Ye, Naimeng
               and Wu, Fangyu and Chen, Minghui and Cai, Tiffany and Koukoumidis, Emmanouil
               and Zeng, William and Namkoong, Hongseok},
  year      = {2026},
}`;
  const citeBox = document.getElementById("cite-box");
  if (citeBox) citeBox.textContent = BIBTEX;

  async function copyBibtex() {
    try { await navigator.clipboard.writeText(BIBTEX); }
    catch {
      const ta = document.createElement("textarea");
      ta.value = BIBTEX; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch {}
      document.body.removeChild(ta);
    }
  }
  function wireCopyBib(btnId, labelId) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.addEventListener("click", async () => {
      await copyBibtex();
      btn.classList.add("copied");
      const lbl = labelId && document.getElementById(labelId);
      const prev = lbl && lbl.textContent;
      if (lbl) lbl.textContent = "Copied";
      setTimeout(() => { btn.classList.remove("copied"); if (lbl) lbl.textContent = prev; }, 1400);
    });
  }
  wireCopyBib("copy-bib", "copy-bib-label");        // legacy bottom card, if present
  wireCopyBib("cite-link-hero", "cite-link-hero-label");

  // --------------------------------------------------------------- THEME
  const themeBtn = document.getElementById("theme-toggle");
  if (localStorage.getItem("cta-theme") === "dark") document.documentElement.setAttribute("data-theme", "dark");
  themeBtn && themeBtn.addEventListener("click", () => {
    const dark = document.documentElement.getAttribute("data-theme") === "dark";
    if (dark) { document.documentElement.removeAttribute("data-theme"); localStorage.setItem("cta-theme", "light"); }
    else      { document.documentElement.setAttribute("data-theme", "dark"); localStorage.setItem("cta-theme", "dark"); }
  });

  // --------------------------------------------------------------- PANELS
  const topNav = document.getElementById("top-nav");
  const panels   = $$(".panel");

  function showPanel(id, anchorId) {
    panels.forEach(p => p.classList.toggle("active", p.id === id));
    $$("#top-nav .top-nav-item").forEach(el => el.classList.toggle("active", el.dataset.target === id));
    requestAnimationFrame(() => {
      if (anchorId) {
        const el = document.getElementById(anchorId);
        if (el) { el.scrollIntoView({ behavior: "smooth", block: "start" }); el.classList.add("anchor-flash");
          setTimeout(() => el.classList.remove("anchor-flash"), 1600); return; }
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    if (location.hash !== "#" + id) history.replaceState(null, "", "#" + id);
  }

  topNav && topNav.addEventListener("click", e => {
    const item = e.target.closest("[data-target]");
    if (item) { showPanel(item.dataset.target, item.dataset.anchor); setDrawer(false); }
  });

  // Mobile: hidden left drawer toggled by the hamburger.
  const navToggle = document.getElementById("nav-toggle");
  const navBackdrop = document.getElementById("nav-backdrop");
  function setDrawer(open) {
    if (!topNav) return;
    topNav.classList.toggle("open", open);
    if (navBackdrop) navBackdrop.classList.toggle("show", open);
    if (navToggle) navToggle.setAttribute("aria-expanded", open ? "true" : "false");
  }
  navToggle && navToggle.addEventListener("click", () => setDrawer(!topNav.classList.contains("open")));
  navBackdrop && navBackdrop.addEventListener("click", () => setDrawer(false));
  document.addEventListener("keydown", e => { if (e.key === "Escape") setDrawer(false); });

  // Scale the figure so its whole containing box fits the viewport height (dynamic; never upscales).
  const figFit = document.getElementById("fig1-anim");
  const figCard = figFit && figFit.closest(".setup-card");
  if (figFit && figCard) {
    const fitFig = () => {
      figFit.style.zoom = "1";
      const figH = figFit.offsetHeight;
      const extra = figCard.offsetHeight - figH;       // box chrome that does not scale (thesis, padding)
      const target = (window.innerHeight - 80) - extra; // height left for the figure inside the box
      figFit.style.zoom = (figH > target && target > 0) ? (target / figH).toFixed(3) : "1";
    };
    window.addEventListener("resize", fitFig);
    window.addEventListener("load", fitFig);
    requestAnimationFrame(fitFig);
  }

  // data-jump: cards, buttons, callout actions. Optional data-anchor + data-prefill (for explorer).
  $$("[data-jump]").forEach(el => {
    el.addEventListener("click", e => {
      e.preventDefault();
      const target = el.dataset.jump, anchor = el.dataset.anchor, prefill = el.dataset.prefill;
      showPanel(target, anchor);
      if (target === "explorer" && prefill) {
        const params = Object.fromEntries(new URLSearchParams(prefill));
        // Dispatch after the panel becomes visible so the explorer can react.
        requestAnimationFrame(() =>
          document.dispatchEvent(new CustomEvent("explorer:prefill", { detail: params })));
      }
    });
  });

  // Open via hash on load.
  if (location.hash) {
    const id = location.hash.slice(1);
    if (document.getElementById(id)) requestAnimationFrame(() => showPanel(id));
  }

  // --------------------------------------------------------------- ENTRANCE MOTION
  // Fade-in + small upward slide on home cards as they enter the viewport.
  // Honours prefers-reduced-motion via the CSS .fade-in rule.
  const motionTargets = document.querySelectorAll("#overview .card, #overview .exp-card");
  if (motionTargets.length && "IntersectionObserver" in window) {
    motionTargets.forEach((el, i) => {
      el.classList.add("fade-in");
      el.style.transitionDelay = Math.min(i * 0.04, 0.32) + "s";
    });
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add("in-view"); obs.unobserve(e.target); }
      });
    }, { threshold: 0.08, rootMargin: "0px 0px -40px 0px" });
    motionTargets.forEach(el => io.observe(el));
  }

  // --------------------------------------------------------------- ANIMATED FIG.1
  // Sequenced reveal: setting → prompt → Task 1 turn-by-turn → Task 2 → ... → Task 10
  // → "Learning across tasks" footer → Environment Design panel → Eval & Training panel
  // → "Our Contributions" caption. Autoplay once on first viewport entry; Replay
  // button restarts the sequence. Honors prefers-reduced-motion via CSS.
  const figAnim = document.getElementById("fig1-anim");
  if (figAnim) {
    const steps = figAnim.querySelectorAll(".step");
    // Per-step delay (ms). Length must match the number of .step elements (34).
    const gaps = [
      200, // 1  setting (orange)
      600, // 2  prompt (slate)
      400, // 3  major arrow ↓
      350, // 4  Task 1 label
      250, // 5  Task 1 lemon block
      400, // 6  Task 1 Task: bubble
      450, // 7  Task 1 Agent: 500
      400, // 8  Task 1 Env: less than
      400, // 9  Task 1 Agent: 250
      350, // 10 Task 1 dots
      250, // 11 Task 1 mini arrow ↓
      450, // 12 Task 1 feedback (9 Turns)
      550, // 13 curved arrow → Task 2
      350, // 14 Task 2 label
      250, // 15 Task 2 block
      350, // 16 Task 2 Task: bubble
      350, // 17 Task 2 Agent: 500
      300, // 18 Task 2 Env: higher
      300, // 19 Task 2 Agent: 750
      300, // 20 Task 2 dots
      200, // 21 Task 2 mini arrow ↓
      400, // 22 Task 2 feedback (8 Turns)
      650, // 23 dotted gap + curved arrow → Task 10
      450, // 24 Task 10 label
      300, // 25 Task 10 block
      400, // 26 Task 10 Task: bubble
      800, // 27 Task 10 Agent (reasoning + 137) — punchline
      400, // 28 Task 10 Env: Correct!
      250, // 29 Task 10 mini arrow ↓
      550, // 30 Task 10 feedback (1 Turn highlighted)
      750, // 31 Learning Across Tasks footer
      700, // 32 Our Contributions header
      500, // 33 Environment Design panel
      500, // 34 Evaluation and Training panel
    ];
    const timers = [];
    function reset() {
      timers.forEach(t => clearTimeout(t));
      timers.length = 0;
      steps.forEach(s => s.classList.remove("show"));
    }
    function play() {
      reset();
      let acc = 0;
      steps.forEach((el, i) => {
        acc += gaps[i] || 400;
        timers.push(setTimeout(() => el.classList.add("show"), acc));
      });
    }
    // Replay + Skip buttons
    const replay = document.getElementById("fig1-replay");
    if (replay) replay.addEventListener("click", () => play());
    const skip = document.getElementById("fig1-skip");
    if (skip) skip.addEventListener("click", () => {
      timers.forEach(t => clearTimeout(t));
      timers.length = 0;
      steps.forEach(s => s.classList.add("show"));
    });
    // Autoplay on first viewport entry; honour prefers-reduced-motion
    const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Small screens: reveal the final state at once; the timed reveal leaves a big empty gap when stacked.
    const smallScreen = window.matchMedia && window.matchMedia("(max-width: 760px)").matches;
    if (reduced || smallScreen) {
      steps.forEach(s => s.classList.add("show"));
    } else if ("IntersectionObserver" in window) {
      // threshold 0 (and a generous bottom rootMargin) so the figure autoplays even on
      // mobile, where the stacked layout makes the block taller than the viewport and
      // a percentage-based threshold (e.g. 0.25) would never be met.
      const obs = new IntersectionObserver((entries, o) => {
        entries.forEach(e => { if (e.isIntersecting) { play(); o.disconnect(); } });
      }, { threshold: 0, rootMargin: "0px 0px -10% 0px" });
      obs.observe(figAnim);
    } else {
      play();
    }
  }

  // --------------------------------------------------------------- HAND-OFF ANIMATION (Metrics page)
  // 3-step sequenced reveal:
  //   1) 10-task setup with an interactive K slider (K ∈ {2,4,6,8})
  //   2) Three generic agents (A / B / C) with robot icons
  //   3) Two parallel blocks (exploration efficiency | exploitation efficiency),
  //      each containing two mini-scenarios + a side-by-side formula.
  // The K slider redraws all 4 mini-scenario task rows and updates the tail
  // reward / efficiency numbers from Table 8 (Cross-task reference column).
  const hoAnim = document.getElementById("ho-anim");
  if (hoAnim) {
    const HO_KVALS = [2, 4, 6, 8];

    function hoRenderRow(id, explorerCls, exploiterCls, K) {
      const c = document.getElementById(id); if (!c) return;
      let h = "";
      for (let i = 1; i <= 10; i++) {
        const cls = i <= K ? explorerCls : exploiterCls;
        h += `<div class="ho-tile${cls ? " " + cls : ""}" style="--i:${i - 1}">r<sub>${i}</sub></div>`;
        if (i === K) h += `<div class="ho-divider" aria-hidden="true"></div>`;
      }
      c.innerHTML = h;
    }
    function hoTailFormula(K) {
      // "r_(K+1) + r_(K+2) + ... + r_10" — short list if few terms, ellipsis otherwise.
      const N = 10;
      const terms = [];
      for (let i = K + 1; i <= N; i++) terms.push(`r<sub>${i}</sub>`);
      if (terms.length <= 4) return terms.join(" + ");
      return terms[0] + " + " + terms[1] + " + &hellip; + " + terms[terms.length - 1];
    }
    function hoUpdate(K) {
      const Kel = document.getElementById("ho-K"); if (Kel) Kel.textContent = K;
      hoRenderRow("ho-setup-tasks", "", "", K);
      hoRenderRow("ho-tasks-AC", "ho-A", "ho-C", K);
      hoRenderRow("ho-tasks-BC", "ho-B", "ho-C", K);
      hoRenderRow("ho-tasks-CA", "ho-C", "ho-A", K);
      hoRenderRow("ho-tasks-CB", "ho-C", "ho-B", K);
      const setHTML = (id, v) => { const x = document.getElementById(id); if (x) x.innerHTML = v; };
      const formula = hoTailFormula(K);
      setHTML("ho-tailf-AC", formula);
      setHTML("ho-tailf-BC", formula);
      setHTML("ho-tailf-CA", formula);
      setHTML("ho-tailf-CB", formula);
    }
    const hoSlider = document.getElementById("ho-K-slider");
    if (hoSlider) hoSlider.addEventListener("input", () => hoUpdate(HO_KVALS[+hoSlider.value]));
    hoUpdate(HO_KVALS[hoSlider ? +hoSlider.value : 1]); // initial render

    // Sequencer
    const hoSteps = hoAnim.querySelectorAll(".step");
    const hoGaps = [
      300,   // 1  setup row reveal (10 tiles pop ~900 ms)
      1300,  // 2  three agents
      1100,  // 3  parallel exploration / exploitation blocks
    ];
    const hoTimers = [];
    function hoReset() {
      hoTimers.forEach(t => clearTimeout(t));
      hoTimers.length = 0;
      hoSteps.forEach(s => s.classList.remove("show"));
    }
    function hoPlay() {
      hoReset();
      let acc = 0;
      hoSteps.forEach((el, i) => {
        acc += hoGaps[i] || 1000;
        hoTimers.push(setTimeout(() => el.classList.add("show"), acc));
      });
    }
    const hoReplay = document.getElementById("ho-replay");
    if (hoReplay) hoReplay.addEventListener("click", () => hoPlay());
    const hoSkip = document.getElementById("ho-skip");
    if (hoSkip) hoSkip.addEventListener("click", () => {
      hoTimers.forEach(t => clearTimeout(t));
      hoTimers.length = 0;
      hoSteps.forEach(s => s.classList.add("show"));
    });
    const hoReduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (hoReduced) {
      hoSteps.forEach(s => s.classList.add("show"));
    } else if ("IntersectionObserver" in window) {
      const hoObs = new IntersectionObserver((entries, o) => {
        entries.forEach(e => { if (e.isIntersecting) { hoPlay(); o.disconnect(); } });
      }, { threshold: 0, rootMargin: "0px 0px -10% 0px" });
      hoObs.observe(hoAnim);
    } else {
      hoPlay();
    }
  }

  // --------------------------------------------------------------- FIG.1 task strip
  const TASKS = [
    {t:1, turns:9, target:137, note:"binary search"},
    {t:2, turns:8, target:793, note:"binary search"},
    {t:3, turns:8, target:137, note:"“have I seen this?”"},
    {t:4, turns:6, target:793, note:"testing 137 / 793"},
    {t:5, turns:5, target:137, note:"testing 137 / 793"},
    {t:6, turns:4, target:793, note:"hypothesis forming"},
    {t:7, turns:3, target:137, note:"recall latent"},
    {t:8, turns:2, target:793, note:"recall latent"},
    {t:9, turns:1, target:137, note:"guess 137 ✓"},
    {t:10,turns:1, target:793, note:"guess 793 ✓"},
  ];
  const strip = document.getElementById("fig1-strip");
  if (strip) {
    strip.innerHTML = TASKS.map((d, i) => {
      const cls = i < 3 ? "" : (i < 6 ? "mid" : "late");
      return `<div class="tcell ${cls}">
        <div class="tbar-wrap"><div class="tbar" data-h="${Math.round(d.turns/9*100)}"></div></div>
        <div class="tturns">${d.turns} ${d.turns===1?"turn":"turns"}</div>
        <div class="tlabel">Task ${d.t} · ${d.target}</div>
        <div class="tmeta">${d.note}</div>
      </div>`;
    }).join("");
    requestAnimationFrame(() => setTimeout(() => {
      strip.querySelectorAll(".tbar").forEach(b => b.style.height = b.dataset.h + "%");
    }, 120));
  }

  // --------------------------------------------------------------- METRICS sim
  const KVALS = [2, 4, 6, 8], N = 10;
  const TABLE8 = {
    "Cross-task": { 2:[0.7,25.3], 4:[2.5,16.4], 6:[2.9,13.0], 8:[11.6,16.3] },
    "Single-task":{ 2:[4.4,30.1], 4:[14.2,29.5], 6:[16.9,28.5], 8:[17.4,22.7] },
  };
  const simTrack = document.getElementById("sim-track");
  const simSlider = document.getElementById("sim-slider");
  const simRef = document.getElementById("sim-ref");
  function drawSim(K) {
    let html = "";
    for (let i = 1; i <= N; i++) {
      const role = i <= K ? "explore" : "exploit";
      const tail = i > K ? " tail" : "";
      html += `<div class="sim-task ${role}${tail}"><span class="ti">task ${i}</span>${i<=K?"explore":"exploit"}</div>`;
    }
    simTrack.innerHTML = html;
  }
  function updateSim() {
    if (!simSlider) return;
    const K = KVALS[+simSlider.value];
    const X = TABLE8[simRef.value] ? simRef.value : "Cross-task";
    document.getElementById("sim-k").textContent = K;
    drawSim(K);
    const [explore, exploit] = TABLE8[X][K];
    document.getElementById("sim-explore").textContent = (explore >= 0 ? "+" : "") + explore.toFixed(1) + "%";
    document.getElementById("sim-exploit").textContent = (exploit >= 0 ? "+" : "") + exploit.toFixed(1) + "%";
    const ratio = (exploit / Math.max(explore, 0.1)).toFixed(0);
    document.getElementById("sim-takeaway").innerHTML =
      `At K=${K} (reference = ${X} RL), the exploitation gain
       (<b style="color:var(--good)">+${exploit.toFixed(1)}%</b>) exceeds the exploration gain
       (<b style="color:var(--accent)">+${explore.toFixed(1)}%</b>) by ~${ratio}×.
       Both positive: Cross-Task RL is a better explorer <em>and</em> a better exploiter.`;
  }
  if (simSlider) {
    simSlider.addEventListener("input", updateSim);
    simRef.addEventListener("change", updateSim);
    updateSim();
  }

  // --------------------------------------------------------------- STATIC TABLES T4..T8
  function renderTable(id, thead, rows) {
    const target = document.getElementById(id); if (!target) return;
    const body = rows.map(r => "<tr>" + r.map((c, i) => {
      let v = String(c), cls = "";
      if (/\*$/.test(v)) { cls = "best"; v = v.replace(/\*$/, ""); }
      if (/%$/.test(v) && /^[+\-−]/.test(v)) cls += (v[0] === "+" ? " pos" : " neg");
      const align = i === 0 ? ' style="text-align:left"' : "";
      return `<td class="${cls.trim()}"${align}>${v}</td>`;
    }).join("") + "</tr>").join("");
    target.innerHTML = thead + "<tbody>" + body + "</tbody>";
  }
  const H3 = (g1, g2, g3) => `<thead>
    <tr><th rowspan="2" style="text-align:left">Environment</th>
        <th colspan="3">${g1}</th><th colspan="3">${g2}</th><th colspan="3">${g3}</th></tr>
    <tr><th>Cum</th><th>Gain</th><th>Final</th><th>Cum</th><th>Gain</th><th>Final</th><th>Cum</th><th>Gain</th><th>Final</th></tr></thead>`;
  const H4 = (g1, g2, g3, g4) => `<thead>
    <tr><th rowspan="2" style="text-align:left">Environment</th>
        <th colspan="3">${g1}</th><th colspan="3">${g2}</th><th colspan="3">${g3}</th><th colspan="3">${g4}</th></tr>
    <tr>${"<th>Cum</th><th>Gain</th><th>Final</th>".repeat(4)}</tr></thead>`;

  renderTable("t4", H3("Cross-task RL", "Single-task RL", "Base (Qwen3-8B)"), [
    ["Number guessing","5.78*","+75%","0.63","3.36","−11%","0.31","2.23","−18%","0.18"],
    ["Mastermind","7.13*","+3%","0.70","5.12","−18%","0.51","4.32","−4%","0.44"],
    ["Hangman","6.48*","+5%","0.65","5.53","−5%","0.55","3.47","−3%","0.33"],
    ["Word Ladder","9.20*","+1%","0.93","8.80","−2%","0.88","5.35","−5%","0.54"],
    ["Secretary","7.60*","+24%","0.78","7.07","+3%","0.72","4.58","+15%","0.46"],
    ["Wordle","6.23*","+11%","0.61","3.26","−61%","0.24","2.54","+8%","0.26"],
  ]);
  renderTable("t5", H4("Cross-task (multi-env)","Single (multi-env)","Cross-task (one env)","Base"), [
    ["Number guessing","7.92*","+25%","0.86","6.73","+14%","0.67","6.28","+44%","0.62","2.97","−45%","0.18"],
    ["Hangman","8.55*","+14%","0.89","5.63","+2%","0.55","7.25","+14%","0.75","4.68","+33%","0.48"],
    ["Word Ladder","8.89*","+2%","0.90","8.61","−4%","0.87","8.80","+1%","0.90","4.58","−11%","0.47"],
    ["Secretary","9.54*","+33%","0.93","6.35","−43%","0.36","7.19","+36%","0.75","4.76","+24%","0.47"],
  ]);
  renderTable("t6", H3("Cross-task RL","Single-task RL","Base"), [
    ["Number guessing","6.11*","+23%","0.59","4.03","−9%","0.39","2.82","−49%","0.18"],
    ["Mastermind","4.29*","+10%","0.43","3.48","−10%","0.35","3.46","−13%","0.34"],
    ["Hangman","6.84*","+30%","0.70","5.90","+17%","0.61","5.54","+88%","0.60"],
    ["Word Ladder","9.35*","−1%","0.93","9.25","−4%","0.91","7.42","−6%","0.74"],
    ["Secretary","4.31","+6%","0.38","4.43*","+5%","0.43","4.33","+30%","0.43"],
    ["Wordle","5.07*","+21%","0.57","3.07","−53%","0.26","2.13","−41%","0.19"],
  ]);
  renderTable("t7", `<thead><tr><th rowspan="2" style="text-align:left">Environment</th>
    <th colspan="3">Cross-task RL (LOO)</th><th colspan="3">Base (Qwen3-8B)</th></tr>
    <tr><th>Cum</th><th>Gain</th><th>Final</th><th>Cum</th><th>Gain</th><th>Final</th></tr></thead>`, [
    ["Number guessing","3.57*","−9%","0.32","2.97","−45%","0.18"],
    ["Hangman","5.65*","+5%","0.58","4.68","+33%","0.48"],
    ["Word Ladder","5.15*","+4%","0.51","4.58","−11%","0.47"],
    ["Secretary","4.84*","+32%","0.49","4.76","+24%","0.47"],
  ]);
  // Table 8 (CT vs ST on Number Guessing) is now rendered as a static HTML
  // table in index.html — using rowspan to group rows by K. No JS rendering needed.

  // ----- Bar-chart equivalents for the Cross-Task RL tables ------------------
  // Each bar shows cumulative reward R per environment, grouped by variant.
  const RL_COLORS = {
    "Cross-task RL": "#8a2030",          // accent / wine
    "Single-task RL": "#1f8a4d",         // green
    "Base": "#888888",                   // grey
    "Cross-task (multi-env)": "#5f1626", // darker wine
    "Single (multi-env)": "#155a33",     // darker green
    "Cross-task (one env)": "#8a2030",   // accent
    "Cross-task RL (LOO)": "#8a2030",
  };
  function renderBarChart(targetId, rows, seriesNames, opts) {
    // rows: [{env: "..", vals: [number, ...]}]
    // seriesNames: ["Cross-task RL", "Single-task RL", "Base"]
    const target = document.getElementById(targetId); if (!target) return;
    const W = 760, H = opts.height || 280;
    const padL = 38, padR = 18, padT = 24, padB = 60;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    const maxVal = opts.maxVal || Math.max(...rows.flatMap(r => r.vals)) * 1.15;
    const gN = rows.length;
    const sN = seriesNames.length;
    const groupW = innerW / gN;
    const barW = Math.min(28, (groupW - 14) / sN);
    let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" font-family="Inter, system-ui, sans-serif">`;
    // grid + Y labels
    const ticks = 5;
    for (let i = 0; i <= ticks; i++) {
      const y = padT + innerH * (1 - i / ticks);
      const v = (maxVal * i / ticks).toFixed(1);
      svg += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="#ececec" stroke-width="1"/>`;
      svg += `<text x="${padL - 6}" y="${y + 3}" text-anchor="end" font-size="10" fill="#888">${v}</text>`;
    }
    // bars
    rows.forEach((row, gi) => {
      const groupX = padL + gi * groupW + (groupW - sN * barW - (sN - 1) * 3) / 2;
      row.vals.forEach((val, si) => {
        const bh = innerH * (val / maxVal);
        const x = groupX + si * (barW + 3);
        const y = padT + innerH - bh;
        const color = RL_COLORS[seriesNames[si]] || "#666";
        svg += `<rect x="${x}" y="${y}" width="${barW}" height="${bh}" fill="${color}" rx="2"/>`;
        svg += `<text x="${x + barW / 2}" y="${y - 3}" text-anchor="middle" font-size="9.5" fill="#444" font-weight="600">${val.toFixed(2)}</text>`;
      });
      // env label, slightly rotated if many envs
      const labelX = padL + gi * groupW + groupW / 2;
      const labelY = padT + innerH + 14;
      svg += `<text x="${labelX}" y="${labelY}" text-anchor="middle" font-size="10.5" fill="#1a1a1a">${row.env}</text>`;
    });
    // legend (centered along the bottom)
    let lx = padL;
    const legendItemW = 130;
    const legendTotalW = sN * legendItemW;
    lx = (W - legendTotalW) / 2;
    const ly = H - 16;
    seriesNames.forEach((s, si) => {
      const color = RL_COLORS[s] || "#666";
      const ix = lx + si * legendItemW;
      svg += `<rect x="${ix}" y="${ly - 8}" width="10" height="10" fill="${color}" rx="2"/>`;
      svg += `<text x="${ix + 14}" y="${ly + 1}" font-size="11" fill="#1a1a1a">${s}</text>`;
    });
    svg += `</svg>`;
    target.innerHTML = svg;
  }

  // Bar-chart data (cumulative reward column from each table above)
  renderBarChart("t4-bar",
    [
      { env: "Number guessing", vals: [5.78, 3.36, 2.23] },
      { env: "Mastermind",      vals: [7.13, 5.12, 4.32] },
      { env: "Hangman",         vals: [6.48, 5.53, 3.47] },
      { env: "Word Ladder",     vals: [9.20, 8.80, 5.35] },
      { env: "Secretary",       vals: [7.60, 7.07, 4.58] },
      { env: "Wordle",          vals: [6.23, 3.26, 2.54] },
    ],
    ["Cross-task RL", "Single-task RL", "Base"],
    { maxVal: 10, height: 300 }
  );
  renderBarChart("t5-bar",
    [
      { env: "Number guessing", vals: [7.92, 6.73, 6.28, 2.97] },
      { env: "Hangman",         vals: [8.55, 5.63, 7.25, 4.68] },
      { env: "Word Ladder",     vals: [8.89, 8.61, 8.80, 4.58] },
      { env: "Secretary",       vals: [9.54, 6.35, 7.19, 4.76] },
    ],
    ["Cross-task (multi-env)", "Single (multi-env)", "Cross-task (one env)", "Base"],
    { maxVal: 10, height: 300 }
  );
  renderBarChart("t6-bar",
    [
      { env: "Number guessing", vals: [6.11, 4.03, 2.82] },
      { env: "Mastermind",      vals: [4.29, 3.48, 3.46] },
      { env: "Hangman",         vals: [6.84, 5.90, 5.54] },
      { env: "Word Ladder",     vals: [9.35, 9.25, 7.42] },
      { env: "Secretary",       vals: [4.31, 4.43, 4.33] },
      { env: "Wordle",          vals: [5.07, 3.07, 2.13] },
    ],
    ["Cross-task RL", "Single-task RL", "Base"],
    { maxVal: 10, height: 300 }
  );
  renderBarChart("t7-bar",
    [
      { env: "Number guessing", vals: [3.57, 2.97] },
      { env: "Hangman",         vals: [5.65, 4.68] },
      { env: "Word Ladder",     vals: [5.15, 4.58] },
      { env: "Secretary",       vals: [4.84, 4.76] },
    ],
    ["Cross-task RL (LOO)", "Base"],
    { maxVal: 8, height: 280 }
  );

  // ----- Wire up the Table / Bar-chart toggles -------------------------------
  document.querySelectorAll(".view-toggle").forEach(group => {
    const card = group.dataset.card;
    if (!card) return;
    const tableEl = document.querySelector(`[data-view-target="${card}-table"]`);
    const barEl   = document.querySelector(`[data-view-target="${card}-bar"]`);
    group.querySelectorAll("button").forEach(btn => {
      btn.addEventListener("click", () => {
        const v = btn.dataset.view;
        group.querySelectorAll("button").forEach(b => b.classList.toggle("active", b === btn));
        if (tableEl) tableEl.hidden = (v !== "table");
        if (barEl)   barEl.hidden   = (v !== "bar");
      });
    });
  });

  // --------------------------------------------------------------- ENV CARDS
  const ENVS = [
    { id:"number_guessing", icon:"🔢", name:"Number Guessing",
      core:"Identify a hidden integer in a range; after each guess you're told higher, lower, or correct.",
      families:"Restricted target set · range pattern",
      diff:"Within-task: visible range. Latent-id: size of the hidden set.",
      latents:["set_of_2","set_of_3","range_100","dynamic_range","two_ranges"],
      prompts:{no:"Guess an integer between 1 and 1000. You'll play 10 rounds sequentially.",
               some:"…The hidden numbers across rounds may follow a pattern.",
               full:"…The hidden number is always drawn from a small fixed set; use this to solve later rounds in one guess."} },
    { id:"bandits", icon:"🎰", name:"Bandits",
      core:"Press buttons on a multi-armed bandit to find and commit to the most rewarding arm.",
      families:"Shared best arm · reward pattern",
      diff:"Latent governs which arm is best and how it moves across rounds.",
      latents:["loyal_favorite_0","ping_pong","even_indices_only","top_two_fixed"],
      prompts:{no:"Press buttons to find the most rewarding one; you'll play 10 rounds.",
               some:"The best button across rounds may follow a hidden pattern.",
               full:"The best button changes in a predictable pattern across games; track previous winners."} },
    { id:"secretary", icon:"📋", name:"Secretary",
      core:"Optimal stopping: accept or reject each candidate as it appears; you can't go back.",
      families:"Threshold · position pattern",
      diff:"Latent fixes where (or how good) the best candidate tends to be.",
      latents:["threshold_06","best_is_last","fixed_position_2","increasing_position","sorted_order","inverse_order","prime_positions"],
      prompts:{no:"Accept or reject each candidate; you can't go back. 10 rounds.",
               some:"The position of the best candidate may follow a pattern across rounds.",
               full:"The maximum tends to appear at a consistent position or region in the sequence."} },
    { id:"mastermind", icon:"🔐", name:"Mastermind",
      core:"Infer a hidden code from black/white peg feedback after each guess.",
      families:"Code constraint · structural rule",
      diff:"Latent constrains the space of valid codes.",
      latents:["ascending","consecutive","mixed_parity","sum_divisible_by_3"],
      prompts:{no:"Crack the secret code from peg feedback. 10 rounds.",
               some:"The secret codes share a hidden structural pattern.",
               full:"Every code satisfies a specific rule (e.g. digits in ascending order)."} },
    { id:"wordladder", icon:"🪜", name:"Word Ladder",
      core:"Transform a start word into a target by changing one letter at a time, staying a valid word.",
      families:"Hub word · reusable path structure",
      diff:"Latent fixes shared vocabulary or a hub word that routes many ladders.",
      latents:["hub_word_3letter","hub_word_4letter","restricted_vocab_4letter","order_left_to_right","order_outside_in","subs_consonant_swaps"],
      prompts:{no:"Transform the start word into the target, one letter at a time. 10 rounds.",
               some:"The puzzles may share reusable structure across rounds.",
               full:"All ladders route through a shared hub word; reuse it to solve faster."} },
    { id:"wordle", icon:"🟩", name:"Wordle",
      core:"Guess a hidden 5-letter word in six tries from green/yellow/gray feedback.",
      families:"Shared word property · candidate set",
      diff:"Latent fixes a property all target words share.",
      latents:["letter_freq_high","letter_freq_medium","no_repeated_letters","mixed_balanced"],
      prompts:{no:"Guess the hidden 5-letter word in 6 tries. 10 rounds.",
               some:"The secret words across rounds may share a hidden property.",
               full:"All target words share a property (e.g. exactly two vowels)."} },
    { id:"hangman", icon:"🎯", name:"Hangman",
      core:"Reveal a hidden word by guessing letters before running out of attempts.",
      families:"Shared word category · letter pattern",
      diff:"Latent fixes a category or letter pattern across the hidden words.",
      latents:["category_objects","consonant_heavy","ending_ABLE","has_double_letter","starts_with_S","vowel_count_2","vowel_count_4","high_frequency_score"],
      prompts:{no:"Reveal the hidden word by guessing letters. 10 rounds.",
               some:"The hidden words may share a common feature across rounds.",
               full:"All words belong to a shared category or share a letter pattern."} },
  ];
  const envList = document.getElementById("env-list");
  if (envList) {
    envList.innerHTML = ENVS.map(e => `
      <div class="env-card2" id="env-${e.id}">
        <a class="env-card2-head" data-jump="explorer" data-prefill="mode=frontier&env=${e.id}" title="Watch ${e.name} trajectories">
          <span class="env-ico">${e.icon}</span>
          <div class="env-card2-name">${e.name}</div>
        </a>
        <p class="env-card2-desc">${e.core}</p>
        <div class="latent-tags">
          ${e.latents.slice(0, 3).map(l => `<a data-jump="explorer" data-prefill="mode=frontier&env=${e.id}&latent=${l}">${l}</a>`).join("")}
        </div>
      </div>`).join("");

    // Re-wire data-jump on the dynamically rendered cards.
    envList.querySelectorAll("[data-jump]").forEach(el => {
      el.addEventListener("click", e => {
        e.preventDefault();
        const t = el.dataset.jump, p = el.dataset.prefill;
        showPanel(t);
        if (t === "explorer" && p) {
          const params = Object.fromEntries(new URLSearchParams(p));
          requestAnimationFrame(() =>
            document.dispatchEvent(new CustomEvent("explorer:prefill", { detail: params })));
        }
      });
    });
  }
})();
