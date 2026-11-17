// Token Launch Radar dashboard: renders window.RADAR (written beside this page by
// main.ts) as a sortable, filterable board with a detail view per protocol.
// No network, no framework: every byte shown comes from data.js.
(function () {
  'use strict';
  var DATA = window.RADAR;
  var rows = DATA.rows;
  var bySlug = {};
  rows.forEach(function (r) { bySlug[r.slug] = r; });

  function $(id) { return document.getElementById(id); }
  function money(x) {
    if (x >= 1e9) return '$' + (x / 1e9).toFixed(2) + 'B';
    if (x >= 1e6) return '$' + (x / 1e6).toFixed(1) + 'M';
    if (x >= 1e3) return '$' + (x / 1e3).toFixed(0) + 'k';
    return '$' + x;
  }
  function ageText(days) {
    if (days === null) return '—';
    if (days < 60) return days + 'd';
    if (days < 730) return Math.round(days / 30.4) + ' mo';
    return (days / 365.25).toFixed(1) + ' yrs';
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Header statistics, all counted from the board itself.
  var totalImplied = rows.reduce(function (a, r) { return a + r.implied_value_usd; }, 0);
  var watchCount = rows.filter(function (r) { return r.watchlist; }).length;
  $('stats').innerHTML =
    '<div class="stat"><b>' + rows.length + '</b><span>protocols ranked</span></div>' +
    '<div class="stat"><b>' + watchCount + '</b><span>watchlist covered</span></div>' +
    '<div class="stat"><b>' + money(totalImplied) + '</b><span>total implied value</span></div>' +
    '<div class="stat"><b>' + money(DATA.floor_usd) + '</b><span>watchlist TVL floor</span></div>';
  $('asof').textContent = DATA.as_of;

  var topMultiple = DATA.multiples.slice(0, 3).map(function (m) {
    return m.category + ' ' + m.multiple.toFixed(2) + 'x';
  }).join(' · ');
  $('model-note').innerHTML =
    '<b>How the ranking works.</b> Implied value = TVL x <code>category multiple</code> x <code>momentum</code> x ' +
    '<code>maturity</code> x <code>reach</code>. The multiple is the median market-cap/TVL of tokenised peers in the ' +
    'same category, learned from this snapshot itself (top categories: ' + esc(topMultiple) + '). Momentum reads the ' +
    '7-day TVL change, maturity rewards time survived with no token, reach counts chains. Protocols whose token ' +
    'already trades are never ranked here; they sit in the reference table at the bottom.';

  // Filter option lists, built from the data.
  var cats = {}, chains = {};
  rows.forEach(function (r) {
    if (r.category) cats[r.category] = 1;
    r.chains.forEach(function (c) { chains[c] = 1; });
  });
  Object.keys(cats).sort().forEach(function (c) {
    var o = document.createElement('option'); o.value = c; o.textContent = c; $('category').appendChild(o);
  });
  Object.keys(chains).sort().forEach(function (c) {
    var o = document.createElement('option'); o.value = c; o.textContent = c; $('chain').appendChild(o);
  });

  var SORTERS = {
    implied: function (a, b) { return b.implied_value_usd - a.implied_value_usd; },
    tvl: function (a, b) { return b.tvl_usd - a.tvl_usd; },
    growth: function (a, b) { return (b.change_7d || -999) - (a.change_7d || -999); },
    age: function (a, b) { return (b.age_days || -1) - (a.age_days || -1); },
    multiple: function (a, b) { return b.multiple - a.multiple || b.implied_value_usd - a.implied_value_usd; },
  };

  function currentRows() {
    var q = $('q').value.trim().toLowerCase();
    var cat = $('category').value;
    var chain = $('chain').value;
    var watchOnly = $('watchonly').checked;
    var out = rows.filter(function (r) {
      if (watchOnly && !r.watchlist) return false;
      if (cat && r.category !== cat) return false;
      if (chain && r.chains.indexOf(chain) < 0) return false;
      if (q) {
        var hay = (r.name + ' ' + r.slug + ' ' + (r.category || '') + ' ' + r.chains.join(' ')).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
    out.sort(SORTERS[$('sort').value]);
    return out;
  }

  function renderBoard() {
    var list = currentRows();
    $('empty').hidden = list.length > 0;
    $('rows').innerHTML = list.map(function (r) {
      var chg = r.change_7d === null ? '—'
        : '<span class="' + (r.change_7d >= 0 ? 'pos' : 'neg') + '">' + (r.change_7d >= 0 ? '+' : '') + r.change_7d.toFixed(1) + '%</span>';
      return '<tr data-slug="' + esc(r.slug) + '">' +
        '<td class="num">' + r.rank + '</td>' +
        '<td><span class="pname">' + esc(r.name) + '</span>' + (r.watchlist ? '<span class="watch">watchlist</span>' : '') + '</td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td>' + esc(r.chains.slice(0, 3).join(', ')) + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + chg + '</td>' +
        '<td class="num">' + ageText(r.age_days) + '</td>' +
        '<td class="num">' + r.multiple.toFixed(2) + 'x</td>' +
        '<td class="num implied">' + money(r.implied_value_usd) + '</td>' +
        '<td><span class="farm-link">Farm plan →</span></td></tr>';
    }).join('');
    Array.prototype.forEach.call($('rows').querySelectorAll('tr'), function (tr) {
      tr.addEventListener('click', function () { location.hash = '#/p/' + tr.getAttribute('data-slug'); });
    });
  }

  function factor(label, value, note) {
    return '<div class="factor"><span>' + label + '</span><b>' + value + '</b><i>' + note + '</i></div>';
  }

  function renderDetail(slug) {
    var r = bySlug[slug];
    if (!r) { location.hash = ''; return; }
    $('view-board').hidden = true;
    $('live').hidden = true;
    var d = $('view-detail');
    d.hidden = false;
    d.innerHTML =
      '<button class="back" id="back">← Back to the board</button>' +
      '<h2>' + esc(r.name) + (r.watchlist ? '<span class="watch">watchlist</span>' : '') + '</h2>' +
      '<p class="sub">' + esc(r.category || 'Uncategorised') + ' · ' + esc(r.chains.join(', ')) +
      ' · ranked #' + r.rank + ' of ' + rows.length + ' pre-token protocols</p>' +
      '<div class="factors">' +
      factor('Implied value', money(r.implied_value_usd), 'what the model says the launch would be worth') +
      factor('TVL', money(r.tvl_usd), 'capital the protocol already holds') +
      factor('Category multiple', r.multiple.toFixed(2) + 'x', 'median mcap/TVL of tokenised ' + esc(r.category || 'peers')) +
      factor('Momentum', r.momentum.toFixed(2) + 'x', r.change_7d === null ? 'no 7-day change reported' : '7-day TVL change ' + r.change_7d.toFixed(1) + '%') +
      factor('Maturity', r.maturity.toFixed(2) + 'x', ageText(r.age_days) + ' with no token') +
      factor('Reach', r.reach.toFixed(2) + 'x', r.chains.length + (r.chains.length === 1 ? ' chain' : ' chains') + ' live') +
      '</div>' +
      '<h3>How to farm ' + esc(r.name) + '</h3>' +
      '<ol class="steps">' + r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      '<p class="sub">Start on the protocol\u2019s own app, keep position sizes small enough to hold for a full season, ' +
      'and remember a launch is never promised: the plan above is what to do while the record builds, not a guarantee.</p>';
    $('back').addEventListener('click', function () { location.hash = ''; });
    window.scrollTo(0, 0);
  }

  function renderLive() {
    $('live').innerHTML =
      '<h2>Already trading — the reference set</h2>' +
      '<p>These protocols record a token in the snapshot, so the radar never ranks them as launches. ' +
      'Their market-cap/TVL ratios are what teach the model its category multiples.</p>' +
      '<table><thead><tr><th>Protocol</th><th>Symbol</th><th class="num">Market cap</th><th class="num">TVL</th><th class="num">Mcap / TVL</th></tr></thead><tbody>' +
      DATA.live.map(function (p) {
        return '<tr><td>' + esc(p.name) + '</td><td>' + esc(p.symbol || '—') + '</td>' +
          '<td class="num">' + money(p.mcap_usd) + '</td><td class="num">' + money(p.tvl_usd) + '</td>' +
          '<td class="num">' + (p.tvl_usd > 0 ? (p.mcap_usd / p.tvl_usd).toFixed(2) + 'x' : '—') + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  function route() {
    var m = location.hash.match(/^#\/p\/(.+)$/);
    if (m) { renderDetail(decodeURIComponent(m[1])); return; }
    $('view-detail').hidden = true;
    $('view-board').hidden = false;
    $('live').hidden = false;
  }

  ['q', 'category', 'chain', 'sort', 'watchonly'].forEach(function (id) {
    $(id).addEventListener('input', renderBoard);
    $(id).addEventListener('change', renderBoard);
  });
  window.addEventListener('hashchange', route);
  renderBoard();
  renderLive();
  route();
})();
