// Token Launch Radar dashboard: renders window.RADAR (written by main.ts into
// ../data.js) with no network. Hash routes: #/ is the board, #/p/<slug> is a
// protocol's detail view, and #/?cat=..&tier=..&q=..&sort=.. opens the board
// with filters already applied.

(function () {
  'use strict';
  var R = window.RADAR;
  var app = document.getElementById('app');
  var topmeta = document.getElementById('topmeta');
  if (!R || !app) return;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function commas(n) { return Math.round(n).toLocaleString('en-US'); }
  function money(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    return '$' + commas(n);
  }
  function moneyFull(n) { return '$' + commas(n); }
  function pct(v) {
    if (v === null || v === undefined) return '<span class="flat">n/a</span>';
    var cls = v > 0 ? 'up' : v < 0 ? 'down' : 'flat';
    return '<span class="' + cls + '">' + (v > 0 ? '+' : '') + v.toFixed(1) + '%</span>';
  }
  function years(v) { return v === null ? 'unknown' : v.toFixed(1) + ' yrs'; }

  topmeta.innerHTML =
    'Snapshot <strong>' + esc(R.as_of) + '</strong> · DefiLlama<br>' +
    esc(R.stats.tracked) + ' protocols tracked · floor ' + money(R.floor_usd);

  var state = { q: '', cat: '', chain: '', tier: '', sort: 'implied' };
  var SORTS = {
    implied: function (a, b) { return b.implied_value_usd - a.implied_value_usd; },
    tvl: function (a, b) { return b.tvl_usd - a.tvl_usd; },
    growth: function (a, b) { return (b.change_7d || -1e9) - (a.change_7d || -1e9); },
    age: function (a, b) { return (b.years_tokenless || -1) - (a.years_tokenless || -1); },
    multiple: function (a, b) { return b.implied_value_usd / b.tvl_usd - a.implied_value_usd / a.tvl_usd; }
  };

  function categories() {
    var seen = {};
    R.rows.forEach(function (r) { if (r.category) seen[r.category] = true; });
    return Object.keys(seen).sort();
  }
  function chains() {
    var seen = {};
    R.rows.forEach(function (r) { r.chains.forEach(function (c) { seen[c] = true; }); });
    return Object.keys(seen).sort();
  }
  function filtered() {
    var q = state.q.trim().toLowerCase();
    return R.rows.filter(function (r) {
      if (state.cat && r.category !== state.cat) return false;
      if (state.chain && r.chains.indexOf(state.chain) < 0) return false;
      if (state.tier === 'watchlist' && !r.watchlist) return false;
      if (state.tier === 'early' && r.watchlist) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.indexOf(q) < 0) return false;
      return true;
    }).sort(SORTS[state.sort] || SORTS.implied);
  }
  function badge(r) {
    return r.watchlist
      ? '<span class="badge watch">WATCHLIST</span>'
      : '<span class="badge early">RADAR+</span>';
  }
  function tierLine(r) {
    if (r.watchlist) return 'Watchlist — the house floor list';
    if (r.tvl_usd >= R.floor_usd) {
      return 'Radar addition — above the floor but not on the house list (the list also applies a parent-protocol record the snapshot does not carry)';
    }
    return 'Radar addition — below the floor, found by the radar';
  }
  function chainText(r) {
    if (r.chains.length <= 2) return esc(r.chains.join(', '));
    return esc(r.chains.slice(0, 2).join(', ')) + ' +' + (r.chains.length - 2);
  }

  function renderBoard() {
    var rows = filtered();
    var catOpts = '<option value="">All categories</option>' + categories().map(function (c) {
      return '<option value="' + esc(c) + '"' + (state.cat === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
    var chainOpts = '<option value="">All chains</option>' + chains().map(function (c) {
      return '<option value="' + esc(c) + '"' + (state.chain === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
    var body = rows.map(function (r) {
      return '<tr data-slug="' + esc(r.slug) + '" tabindex="0" title="Open the detail view for ' + esc(r.name) + '">' +
        '<td class="rank">' + r.rank + '</td>' +
        '<td><span class="pname">' + esc(r.name) + '</span>' + badge(r) + '<br><span class="pslug">' + esc(r.slug) + '</span></td>' +
        '<td class="cat">' + esc(r.category || 'Uncategorised') + '</td>' +
        '<td class="chains hide-s">' + chainText(r) + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + pct(r.change_7d) + '</td>' +
        '<td class="num implied">' + money(r.implied_value_usd) + '</td>' +
        '<td class="num hide-s">' + (r.implied_value_usd / r.tvl_usd).toFixed(2) + 'x</td>' +
        '<td class="num hide-s">' + years(r.years_tokenless) + '</td></tr>';
    }).join('');
    app.innerHTML =
      '<section class="stats">' +
      '<div class="stat"><div class="k">Protocols tracked</div><div class="v">' + R.stats.tracked + '</div><div class="s">in the sealed snapshot</div></div>' +
      '<div class="stat"><div class="k">On the board</div><div class="v">' + R.stats.board_rows + '</div><div class="s">' + R.stats.watchlist_rows + ' watchlist · ' + R.stats.early_rows + ' radar additions</div></div>' +
      '<div class="stat"><div class="k">Combined implied value</div><div class="v">' + money(R.stats.combined_implied_usd) + '</div><div class="s">across ' + money(R.stats.combined_tvl_usd) + ' of TVL</div></div>' +
      '<div class="stat"><div class="k">Global peer multiple</div><div class="v">' + R.stats.global_multiple.toFixed(3) + 'x</div><div class="s">median mcap / TVL, tokenised protocols</div></div>' +
      '</section>' +
      '<section class="controls">' +
      '<input type="search" id="f-q" placeholder="Search name or slug" value="' + esc(state.q) + '" aria-label="Search">' +
      '<label>Category</label><select id="f-cat">' + catOpts + '</select>' +
      '<label>Chain</label><select id="f-chain">' + chainOpts + '</select>' +
      '<label>Tier</label><select id="f-tier">' +
      '<option value=""' + (state.tier === '' ? ' selected' : '') + '>All tiers</option>' +
      '<option value="watchlist"' + (state.tier === 'watchlist' ? ' selected' : '') + '>Watchlist (the house list)</option>' +
      '<option value="early"' + (state.tier === 'early' ? ' selected' : '') + '>Radar additions (beyond the list)</option></select>' +
      '<label>Sort</label><select id="f-sort">' +
      '<option value="implied"' + (state.sort === 'implied' ? ' selected' : '') + '>Implied value</option>' +
      '<option value="tvl"' + (state.sort === 'tvl' ? ' selected' : '') + '>TVL</option>' +
      '<option value="growth"' + (state.sort === 'growth' ? ' selected' : '') + '>7d growth</option>' +
      '<option value="age"' + (state.sort === 'age' ? ' selected' : '') + '>Years tokenless</option>' +
      '<option value="multiple"' + (state.sort === 'multiple' ? ' selected' : '') + '>Implied / TVL</option></select>' +
      '<span class="count">' + rows.length + ' shown</span>' +
      '</section>' +
      (rows.length === 0
        ? '<div class="empty">No protocol on the board matches those filters. Loosen the search or pick another category.</div>'
        : '<table><thead><tr><th>#</th><th>Protocol</th><th>Category</th><th class="hide-s">Chains</th>' +
          '<th class="num">TVL</th><th class="num">7d</th><th class="num">Implied value</th>' +
          '<th class="num hide-s">x TVL</th><th class="num hide-s">Tokenless</th></tr></thead><tbody>' + body + '</tbody></table>') +
      '<section class="method"><h2>How the board prices a launch that has not happened</h2>' +
      '<p>Every protocol on this board records no token in the snapshot (no CoinGecko id, no ticker, no market cap), and wrapped, staked, bridged or exchange products of tokens that already trade are left out. The watchlist is the house floor: TVL at or above ' + money(R.floor_usd) + '. The radar treats that list as a floor, not a ceiling: it adds the strongest further protocols that record no token and pass the same exclusions the snapshot\'s fields allow, above and below the floor alike.</p>' +
      '<ul><li><code>implied = TVL x peer multiple x growth factor x maturity factor</code></li>' +
      '<li>Peer multiple: the median market-cap / TVL of tokenised protocols in the same category (at least 3 peers, else the global median of ' + R.stats.global_multiple.toFixed(3) + 'x), clamped to 0.05x-1.50x.</li>' +
      '<li>Growth factor: the protocol\'s own 7-day TVL change, clamped to +/-40% and halved, so one hot week moves the price at most +/-20%.</li>' +
      '<li>Maturity factor: +3.5% per year tracked with no token, capped at 6 years: a long tokenless record is an established product a launch would be priced on.</li></ul>' +
      '<p>Click any row for the protocol\'s figures, its model breakdown and the steps to farm it.</p></section>';
    app.setAttribute('aria-busy', 'false');
    bindControls();
  }

  function bindControls() {
    var q = document.getElementById('f-q');
    q.addEventListener('input', function () { state.q = q.value; refreshTable(); });
    document.getElementById('f-cat').addEventListener('change', function (e) { state.cat = e.target.value; renderBoard(); });
    document.getElementById('f-chain').addEventListener('change', function (e) { state.chain = e.target.value; renderBoard(); });
    document.getElementById('f-tier').addEventListener('change', function (e) { state.tier = e.target.value; renderBoard(); });
    document.getElementById('f-sort').addEventListener('change', function (e) { state.sort = e.target.value; renderBoard(); });
    bindRows();
  }
  function refreshTable() {
    // Re-render but keep focus in the search box.
    var val = state.q;
    renderBoard();
    var q = document.getElementById('f-q');
    q.focus();
    q.setSelectionRange(val.length, val.length);
  }
  function bindRows() {
    var trs = app.querySelectorAll('tbody tr[data-slug]');
    Array.prototype.forEach.call(trs, function (tr) {
      tr.addEventListener('click', function () { location.hash = '#/p/' + tr.getAttribute('data-slug'); });
      tr.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          location.hash = '#/p/' + tr.getAttribute('data-slug');
        }
      });
    });
  }

  function stepHtml(step) {
    var at = step.indexOf(' Cost: ');
    if (at < 0) return '<li>' + esc(step) + '</li>';
    return '<li>' + esc(step.slice(0, at)) + '<span class="meta">Cost: ' + esc(step.slice(at + 7)) + '</span></li>';
  }

  function renderDetail(slug) {
    var r = null;
    R.rows.forEach(function (x) { if (x.slug === slug) r = x; });
    if (!r) { renderBoard(); return; }
    var peerLine = r.peers > 0
      ? 'median of ' + r.peers + ' tokenised ' + esc(r.category || '') + ' peers'
      : 'global median (fewer than 3 tokenised peers in this category)';
    app.innerHTML =
      '<a class="backlink" id="back">&larr; Back to the board</a>' +
      '<div class="detail-head"><div><h2>' + esc(r.name) + badge(r) + '</h2>' +
      '<div class="sub">' + esc(r.slug) + ' · ' + esc(r.category || 'Uncategorised') + ' · rank #' + r.rank + ' of ' + R.stats.board_rows + ' on the board</div></div>' +
      '<div class="big-implied"><div class="k">Implied launch value</div><div class="v">' + moneyFull(r.implied_value_usd) + '</div></div></div>' +
      '<div class="grid">' +
      '<section class="card"><h3>The protocol in the snapshot</h3>' +
      '<div class="kv"><span class="kk">Total value locked</span><span class="vv">' + moneyFull(r.tvl_usd) + '</span></div>' +
      '<div class="kv"><span class="kk">TVL change, 7 days</span><span class="vv">' + pct(r.change_7d) + '</span></div>' +
      '<div class="kv"><span class="kk">Chains</span><span class="vv">' + esc(r.chains.join(', ') || 'n/a') + '</span></div>' +
      '<div class="kv"><span class="kk">Tracked by DefiLlama since</span><span class="vv">' + esc(r.listed_at || 'not reported') + '</span></div>' +
      '<div class="kv"><span class="kk">Tokenless record</span><span class="vv">' + years(r.years_tokenless) + '</span></div>' +
      '<div class="kv"><span class="kk">Tier</span><span class="vv">' + esc(tierLine(r)) + '</span></div>' +
      '</section>' +
      '<section class="card"><h3>How the implied value is built</h3>' +
      '<div class="kv"><span class="kk">Peer multiple</span><span class="vv">' + r.multiple.toFixed(3) + 'x</span></div>' +
      '<div class="kv"><span class="kk">Multiple source</span><span class="vv">' + peerLine + '</span></div>' +
      '<div class="kv"><span class="kk">Growth factor (7d ' + (r.change_7d === null ? 'n/a' : r.change_7d.toFixed(1) + '%') + ')</span><span class="vv">x' + r.growth_factor.toFixed(3) + '</span></div>' +
      '<div class="kv"><span class="kk">Maturity factor (' + years(r.years_tokenless) + ' tokenless)</span><span class="vv">x' + r.maturity_factor.toFixed(3) + '</span></div>' +
      '<p class="formula"><code>' + moneyFull(r.tvl_usd) + ' x ' + r.multiple.toFixed(3) + ' x ' + r.growth_factor.toFixed(3) + ' x ' + r.maturity_factor.toFixed(3) + ' = ' + moneyFull(r.implied_value_usd) + '</code></p>' +
      '<p class="formula">That prices the launch at ' + (r.implied_value_usd / r.tvl_usd).toFixed(2) + 'x the value the protocol already holds. It is this board\'s claim from the snapshot\'s figures, not a forecast that a token will come.</p>' +
      '</section></div>' +
      '<section class="card" style="margin-top:12px"><h3>Farm plan — what to do before any launch</h3>' +
      '<ol class="steps">' + r.farm_steps.map(stepHtml).join('') + '</ol></section>';
    app.setAttribute('aria-busy', 'false');
    document.getElementById('back').addEventListener('click', function () { location.hash = '#/'; });
    window.scrollTo(0, 0);
  }

  function route() {
    var hash = location.hash || '#/';
    if (hash.indexOf('#/p/') === 0) {
      renderDetail(decodeURIComponent(hash.slice(4)));
      return;
    }
    var qAt = hash.indexOf('?');
    if (qAt >= 0) {
      var params = new URLSearchParams(hash.slice(qAt + 1));
      state.q = params.get('q') || '';
      state.cat = params.get('cat') || '';
      state.chain = params.get('chain') || '';
      state.tier = params.get('tier') || '';
      state.sort = params.get('sort') || 'implied';
    }
    renderBoard();
  }
  window.addEventListener('hashchange', route);
  route();
})();
