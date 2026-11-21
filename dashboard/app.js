// Token Radar dashboard: renders window.RADAR (written by main.ts beside this directory).
// Board with sort + filter, a detail view per protocol with its costed farm plan, the model's
// own held-out validation record, the traded set the model was fitted on, and the set-asides.
(function () {
  var D = window.RADAR;
  var $ = function (id) { return document.getElementById(id); };
  var fmt = function (n) { return '$' + Math.round(n).toLocaleString('en-US'); };
  var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); };

  // ---- integrity strip: every one of the 758 protocols accounted for ----
  var c = D.counts;
  $('strip').innerHTML = [
    [D.total, 'protocols in snapshot'],
    [c.live, 'token already trades'],
    [c.watchlist, 'watchlist rows'],
    [c.candidate, 'below-floor finds'],
    [c.setaside, 'products set aside'],
    [D.rows.length, 'board rows ranked']
  ].map(function (k) { return '<div class="kpi"><b>' + k[0] + '</b><span>' + k[1] + '</span></div>'; }).join('');

  // ---- model & validation panel: the fit, and how it scored on tokens it had not seen ----
  var m = D.model;
  var ab = m.ablation.map(function (r) {
    var chosen = r.terms === m.terms ? ' class="chosen"' : '';
    return '<tr' + chosen + '><td>' + r.terms + '</td><td>' + r.fold_a_err + '</td><td>' + r.fold_a_rho + '</td><td>' + r.fold_b_err + '</td><td>' + r.fold_b_rho + '</td></tr>';
  }).join('');
  $('modelPanel').innerHTML =
    '<h2>THE MODEL, AND ITS HELD-OUT RECORD</h2>' +
    '<p>Implied value = a regression of log market cap on the snapshot\'s own figures, fitted on the ' + m.train_n +
    ' protocols whose token already trades, then read across to the ones still waiting. Term groups were chosen by ' +
    'held-out ablation, not by hand: two folds (a slug-hash split, and walk-forward on listing date) scored every ' +
    'candidate; the winner runs. Chosen terms: <b>' + m.terms + '</b>; calibration factor ' + m.calibration +
    ' (median traded/predicted on the training set). Held-out median error for the chosen model: fold A ' +
    m.chosen.fold_a_err + ' log10, fold B ' + m.chosen.fold_b_err + ' log10. Rank ranges come from 200 seeded ' +
    'bootstrap refits. Token odds: ' + m.odds_global + '% of all 758 protocols record a token; each row shows its own age-and-size bucket\'s rate.</p>' +
    '<table><tr><th>Term set</th><th>Fold A err</th><th>Fold A rho</th><th>Fold B err</th><th>Fold B rho</th></tr>' + ab + '</table>';

  // ---- board ----
  var cats = {};
  D.rows.forEach(function (r) { if (r.category) cats[r.category] = 1; });
  Object.keys(cats).sort().forEach(function (cat) {
    var o = document.createElement('option'); o.value = cat; o.textContent = cat; $('fCat').appendChild(o);
  });

  var state = { q: '', cls: '', verdict: '', cat: '', sort: 'rank' };
  function visible() {
    var rows = D.rows.filter(function (r) {
      if (state.cls && r.cls !== state.cls) return false;
      if (state.verdict && r.verdict !== state.verdict) return false;
      if (state.cat && r.category !== state.cat) return false;
      if (state.q && (r.name + ' ' + r.slug).toLowerCase().indexOf(state.q) < 0) return false;
      return true;
    });
    var key = { rank: 'rank', odds: 'token_odds', tvl: 'tvl_usd', growth: 'change_7d', ev: 'expected_usd' }[state.sort];
    rows.sort(function (a, b) {
      if (state.sort === 'rank') return a.rank - b.rank;
      return (b[key] || 0) - (a[key] || 0) || a.rank - b.rank;
    });
    return rows;
  }

  function render() {
    var rows = visible();
    $('rowCount').textContent = rows.length + ' of ' + D.rows.length + ' rows';
    $('tbody').innerHTML = rows.map(function (r) {
      return '<tr data-slug="' + r.slug + '">' +
        '<td class="num">' + r.rank + '</td>' +
        '<td><span class="name">' + esc(r.name) + '</span><br><span class="slug">' + r.slug + ' · ' + esc(r.category || 'uncategorised') + '</span></td>' +
        '<td><span class="badge ' + (r.cls === 'watchlist' ? 'b-watch' : 'b-cand') + '">' + (r.cls === 'watchlist' ? 'WATCHLIST' : 'BELOW FLOOR') + '</span></td>' +
        '<td class="num">' + fmt(r.tvl_usd) + '</td>' +
        '<td class="num">' + (r.change_7d === null ? '—' : (r.change_7d > 0 ? '+' : '') + r.change_7d + '%') + '</td>' +
        '<td class="num"><b>' + fmt(r.implied_value_usd) + '</b></td>' +
        '<td class="range">' + r.rank_lo + '–' + r.rank_hi + '</td>' +
        '<td class="num">' + r.token_odds + '%</td>' +
        '<td class="v-' + r.verdict + '">' + r.verdict + '</td></tr>';
    }).join('');
    Array.prototype.forEach.call($('tbody').querySelectorAll('tr'), function (tr) {
      tr.addEventListener('click', function () { showDetail(tr.getAttribute('data-slug')); });
    });
  }

  function showDetail(slug) {
    var r = null;
    D.rows.forEach(function (x) { if (x.slug === slug) r = x; });
    if (!r) return;
    var age = r.age_days === null ? 'listing date unrecorded' : Math.round(r.age_days / 30.4) + ' months tracked';
    $('detail').innerHTML =
      '<div class="card"><h2>' + esc(r.name) + ' <span class="slug">' + r.slug + '</span></h2>' +
      '<div class="meta">' + esc(r.category || 'uncategorised') + ' · chains: ' + esc(r.chains.join(', ') || '—') + ' · ' + age +
      ' · ' + (r.cls === 'watchlist' ? 'on the snapshot watchlist (TVL at or above the $50M floor)' : 'below the floor: a radar find, not a watchlist row') + '</div>' +
      '<div class="grid">' +
      '<div class="kpi"><b>#' + r.rank + '</b><span>board rank</span></div>' +
      '<div class="kpi"><b>' + fmt(r.implied_value_usd) + '</b><span>implied value</span></div>' +
      '<div class="kpi"><b>' + r.rank_lo + '–' + r.rank_hi + '</b><span>rank range, 200 refits</span></div>' +
      '<div class="kpi"><b>' + r.token_odds + '%</b><span>token odds (bucket)</span></div>' +
      '<div class="kpi"><b>' + fmt(r.tvl_usd) + '</b><span>TVL</span></div>' +
      '<div class="kpi"><b class="v-' + r.verdict + '">' + r.verdict + '</b><span>farm verdict</span></div>' +
      '<div class="kpi"><b>' + fmt(r.cost_usd) + '</b><span>plan cost, ' + r.weeks + ' weeks</span></div>' +
      '<div class="kpi"><b>' + fmt(r.expected_usd) + '</b><span>expected value</span></div>' +
      '</div>' +
      '<div class="stepsTitle">FARM PLAN — ' + r.farm_steps.length + ' STEPS, COSTED</div><ol>' +
      r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol></div>';
    $('detail').scrollIntoView({ block: 'nearest' });
  }

  ['q', 'fClass', 'fVerdict', 'fCat', 'fSort'].forEach(function (id) {
    $(id).addEventListener('input', function () {
      state = { q: $('q').value.toLowerCase(), cls: $('fClass').value, verdict: $('fVerdict').value, cat: $('fCat').value, sort: $('fSort').value };
      render();
    });
  });

  // ---- the traded set the model learned from (top 40 by market cap) ----
  $('livePanel').innerHTML = '<h2>ALREADY TRADING — THE COMPS SET (TOP 40 OF ' + c.live + ')</h2>' +
    '<p>The model\'s anchors: protocols whose token already trades. The board above is kept strictly separate from these.</p>' +
    '<table><tr><th>Protocol</th><th>Category</th><th>TVL</th><th>Market cap</th><th>Cap / TVL</th></tr>' +
    D.live.map(function (p) {
      return '<tr><td class="liveName">' + esc(p.name) + '</td><td>' + esc(p.category || '—') + '</td><td>' + fmt(p.tvl_usd) + '</td><td>' + fmt(p.mcap_usd) + '</td><td>' + p.ratio + 'x</td></tr>';
    }).join('') + '</table>';

  // ---- set aside, with reasons ----
  $('asidePanel').innerHTML = '<h2>SET ASIDE — ' + D.set_aside_total + ' PRODUCTS OF TOKENS THAT ALREADY TRADE</h2>' +
    '<p>Counted, never ranked: a wrapped, staked, bridged or versioned product is not a launch still to come. First ' +
    D.set_aside_sample.length + ' by snapshot order:</p>' +
    '<table><tr><th>Protocol</th><th>Why set aside</th></tr>' +
    D.set_aside_sample.map(function (p) { return '<tr><td class="liveName">' + esc(p.name) + '</td><td>' + esc(p.reason) + '</td></tr>'; }).join('') + '</table>';

  render();

  // Deterministic views for the handed-in screenshots: ?detail=<slug>, ?filter=belowfarm
  var params = new URLSearchParams(location.search);
  if (params.get('filter') === 'belowfarm') {
    $('fClass').value = 'candidate'; $('fVerdict').value = 'FARM';
    state.cls = 'candidate'; state.verdict = 'FARM'; render();
  }
  if (params.get('detail')) showDetail(params.get('detail'));
  else if (params.get('shot') === 'detail' && D.rows.length) {
    // Screenshot view: move the detail card to the top so the capture frames it whole.
    document.querySelector('main').prepend($('detail'));
    showDetail(D.rows[0].slug);
  }
})();
