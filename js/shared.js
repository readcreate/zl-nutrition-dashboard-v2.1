// ── SHARED UTILITIES ──

function programTag(prog) {
  const p = (prog || '').toLowerCase();
  return `<span class="tag ${p}">${prog}</span>`;
}

function progressBar(pct, color) {
  const w = Math.min(100, Math.max(0, pct || 0));
  return `<div class="progress-bar"><div class="progress-fill" style="width:${w}%;background:${color}"></div></div>`;
}

// ── CSS HORIZONTAL BAR CHART ──
function renderBarChart(containerId, data, maxVal) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const max = maxVal || Math.max(...data.map(d => d.value), 1);
  el.innerHTML = data.map(d => `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
      <div style="width:90px;font-size:11px;color:var(--gray-500);text-align:right;
                  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"
           title="${d.label}">${d.label}</div>
      <div style="flex:1;background:var(--gray-100);border-radius:3px;height:20px;overflow:hidden;">
        <div style="width:${max > 0 ? (d.value / max * 100) : 0}%;height:100%;
                    background:${d.color || 'var(--blue)'};border-radius:3px;
                    transition:width 0.6s ease;"></div>
      </div>
      <div style="width:36px;font-size:12px;font-weight:700;color:var(--gray-700);text-align:right;">
        ${d.value}
      </div>
    </div>
  `).join('');
}

// ── NAV ──
function buildNav(activeId) {
  return `
  <nav class="nav">
    <div class="nav-brand">
      <div>
        PIH Nutrition
        <span class="sub">Tableau de bord / Dashboard</span>
      </div>
    </div>
    <div class="nav-links">
      <a class="nav-link ${activeId === 'upload' ? 'active' : ''}" href="index.html">
        <span class="fr">Données</span>
        <span class="en">Upload Data</span>
      </a>
      <a class="nav-link ${activeId === 'analytics' ? 'active' : ''}" href="analytics.html">
        <span class="fr">Vue d'ensemble</span>
        <span class="en">Overview</span>
      </a>
      <a class="nav-link ${activeId === 'profiles' ? 'active' : ''}" href="profiles.html">
        <span class="fr">Profils & Résultats</span>
        <span class="en">Profiles & Outcomes</span>
      </a>
      <a class="nav-link ${activeId === 'pathways' ? 'active' : ''}" href="pathways.html">
        <span class="fr">Parcours & Qualité</span>
        <span class="en">Pathways & Quality</span>
      </a>
      <a class="nav-link ${activeId === 'info' ? 'active' : ''}" href="info.html">
        <span class="fr">À propos</span>
        <span class="en">About</span>
      </a>
    </div>
  </nav>`;
}
