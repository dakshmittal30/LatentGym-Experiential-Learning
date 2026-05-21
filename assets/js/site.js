/* =============================================================================
   site.js — shared nav + footer, injected into every page.
   Each page has <div id="nav-root"></div> and <div id="footer-root"></div>
   and <body data-page="KEY">. Edit LINKS / AUTHORS / NAV here only.
   ============================================================================= */

// ---- single source of truth for external links (fill these in) --------------
const LINKS = {
  paper: "#",                 // arXiv / PDF
  blog: "#",                  // blog post
  code: "https://github.com/", // GitHub repo
  dashboard: "#",             // original interactive dashboard (optional)
};

const NAV = [
  { key: "home", href: "index.html", label: "Home" },
  { key: "framework", href: "framework.html", label: "Framework" },
  { key: "environments", href: "environments.html", label: "Environments" },
  { key: "findings", href: "findings.html", label: "Findings" },
  { key: "explorer", href: "explorer.html", label: "Trajectory Explorer" },
  { key: "metrics", href: "metrics.html", label: "Metrics" },
  { key: "resources", href: "resources.html", label: "Resources" },
];

const AUTHORS = [
  "Daksh Mittal*", "Tommaso Castellani*", "Thomson Yen*", "Naimeng Ye",
  "Fangyu Wu", "Minghui Chen", "Tiffany Cai", "Emmanouil Koukoumidis",
  "William Zeng", "Hongseok Namkoong",
];
const AFFIL = "Columbia Business School · University of Chicago · Oumi AI";

const BIBTEX = `@inproceedings{mittal2026crosstask,
  title     = {Probing Cross-Task Adaptation in LLM Agents through Controllable Latents},
  author    = {Mittal, Daksh and Castellani, Tommaso and Yen, Thomson and Ye, Naimeng
               and Wu, Fangyu and Chen, Minghui and Cai, Tiffany and Koukoumidis, Emmanouil
               and Zeng, William and Namkoong, Hongseok},
  year      = {2026},
}`;

function buildNav() {
  const page = document.body.getAttribute("data-page");
  const links = NAV.map(n =>
    `<a href="${n.href}" class="${n.key === page ? "active" : ""}">${n.label}</a>`
  ).join("");
  const root = document.getElementById("nav-root");
  if (!root) return;
  root.innerHTML = `
    <nav class="nav">
      <div class="nav-inner">
        <a class="nav-brand" href="index.html">Cross-Task Adaptation<span class="dot">.</span></a>
        <button class="nav-toggle" aria-label="Menu" onclick="document.getElementById('navlinks').classList.toggle('open')">☰</button>
        <div class="nav-links" id="navlinks">${links}</div>
      </div>
    </nav>`;
}

function buildFooter() {
  const root = document.getElementById("footer-root");
  if (!root) return;
  root.innerHTML = `
    <footer class="footer">
      <div class="wrap">
        <div style="max-width:420px">
          <h4>Probing Cross-Task Adaptation in LLM Agents</h4>
          <p class="small muted" style="margin:.3em 0">${AUTHORS.join(", ")}</p>
          <p class="small muted">${AFFIL}</p>
          <p class="small" style="margin-top:.6em">
            <a href="${LINKS.paper}">Paper</a> · <a href="${LINKS.blog}">Blog</a> ·
            <a href="${LINKS.code}">Code</a>
          </p>
          <p class="small muted">* Equal contribution. Correspondence: dm3766@columbia.edu</p>
        </div>
        <div>
          <h4>Cite</h4>
          <div class="cite">${BIBTEX.replace(/</g, "&lt;")}</div>
        </div>
      </div>
    </footer>`;
}

document.addEventListener("DOMContentLoaded", () => {
  buildNav();
  buildFooter();
  // apply external links to any [data-link] element
  document.querySelectorAll("[data-link]").forEach(el => {
    const k = el.getAttribute("data-link");
    if (LINKS[k]) el.setAttribute("href", LINKS[k]);
  });
});
