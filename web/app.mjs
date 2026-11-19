const $ = id => document.getElementById(id);
const counts = new Intl.NumberFormat('en-CA', { maximumFractionDigits: 2 });
const percent = new Intl.NumberFormat('en-CA', { style: 'percent', maximumFractionDigits: 2 });
const dollars = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' });
const collator = new Intl.Collator('en-CA', { numeric: true });
const metricColumns = {
  fixed: [3, 1, 'Usual resident dwellings'],
  gigabit: [4, 1, 'Usual resident dwellings'],
  lte: [5, 2, 'Residents'],
  nr: [6, 2, 'Residents'],
};
const provinceCache = new Map();
const reportCache = new Map();
const startOxford = new URLSearchParams(location.search).get('example') === 'oxford';
let manifest, prices, places = [], place, selectedSeries, generation = 0;

function node(tag, value) {
  const element = document.createElement(tag);
  if (value != null) element.textContent = value;
  return element;
}

function option(value, label) {
  const element = node('option', label);
  element.value = value;
  return element;
}

async function data(file) {
  const response = await fetch(`./data/${file}.json`);
  if (!response.ok) throw Error(`Data request failed (${response.status}).`);
  return response.json();
}

function status(message, error = false) {
  $('status').textContent = message;
  $('status').classList.toggle('error', error);
}

function updatePlaces() {
  const query = $('search').value.trim().toLocaleLowerCase('en-CA');
  const previous = $('place').value;
  const options = places.map(([name, code, area, reserve], index) => ({
    index, label: `${name} · ${area}${reserve ? ' · reserve area' : ''} · ${code}`,
  }));
  const matched = options.filter(item => item.label.toLocaleLowerCase('en-CA').includes(query));
  $('place').replaceChildren(...matched.map(item => option(String(item.index), item.label)));
  if (matched.some(item => String(item.index) === previous)) $('place').value = previous;
  $('place').disabled = !matched.length;
  if (!matched.length) {
    $('place').append(option('', 'No matching area'));
    place = null;
    $('results').hidden = true;
    status('No areas match that search. Try a shorter subdivision name or code.');
    return;
  }
  status(`${counts.format(matched.length)} coverage areas. Each census subdivision can contain several area types.`);
  pickPlace();
}

async function selectProvince(oxford = false) {
  const request = ++generation;
  const province = $('province').value;
  place = null;
  $('results').hidden = true;
  $('search').disabled = true;
  $('place').disabled = true;
  $('place').replaceChildren(option('', 'Loading areas…'));
  status('Loading coverage areas…');
  try {
    if (!provinceCache.has(province)) provinceCache.set(province, await data(province));
    if (request !== generation) return;
    places = provinceCache.get(province);
    $('search').disabled = false;
    $('search').value = oxford === true ? '1211012' : ({ BC: 'Langley', NS: 'Halifax' })[province] ?? '';
    updatePlaces();
  } catch {
    if (request !== generation) return;
    $('place').replaceChildren(option('', 'Areas unavailable'));
    status('Coverage data could not be loaded. Try again after reloading.', true);
  }
}

function pickPlace() {
  place = places[Number($('place').value)];
  $('market').value = place[2] === 'Rural' ? 'Rural' : 'Urban';
  updatePriceChoices();
}

function updatePriceChoices() {
  const service = $('service').value;
  const province = $('province').value;
  const market = $('market').value;
  const series = prices.filter(row => row[0] === service && [province, 'Canada'].includes(row[1]) && row[2] === market);
  const plans = [...new Set(series.map(row => row[3]))].sort(collator.compare);
  const current = $('plan').value;
  const preferred = service === 'Mobile' ? '20GB' : '50/10 Mbps';
  $('plan').replaceChildren(...plans.map(plan => option(plan, plan)));
  $('plan').disabled = !plans.length;
  if (plans.includes(current)) $('plan').value = current;
  else if (plans.includes(preferred)) $('plan').value = preferred;
  updateSpeedChoices(series);
}

function updateSpeedChoices(filtered) {
  const service = $('service').value;
  const province = $('province').value;
  const market = $('market').value;
  const plan = $('plan').value;
  const series = filtered ?? prices.filter(row => row[0] === service && [province, 'Canada'].includes(row[1]) && row[2] === market);
  const tiers = [...new Set(series.filter(row => row[3] === plan).map(row => row[4]))].sort(collator.compare);
  const speed = $('speed').value;
  $('speed-field').hidden = service !== 'Mobile';
  $('speed').disabled = !tiers.length;
  $('speed').replaceChildren(...tiers.map(tier => option(tier, tier || 'Unspecified')));
  if (tiers.includes(speed)) $('speed').value = speed;
  else if (tiers.includes('5G')) $('speed').value = '5G';
  render();
}

function coverageRows() {
  const [numerator, denominator, label] = metricColumns[$('metric').value];
  $('coverage-scope').textContent = `${place[0]} · ${place[2]}${place[3] ? ' · reserve area' : ''} · ${label}`;
  return place[4].map(row => {
    const base = row[denominator];
    const covered = row[numerator];
    const rate = base > 0 && covered != null ? covered / base : null;
    return { year: row[0], base, covered, rate };
  });
}

function priceRows() {
  const province = $('province').value;
  const values = new Map();
  for (const [service, area, market, plan, tier, year, price] of prices) {
    if (service !== $('service').value || market !== $('market').value || plan !== $('plan').value || tier !== $('speed').value) continue;
    if (area !== province && area !== 'Canada') continue;
    const observation = values.get(year) ?? { year };
    observation[area === province ? 'province' : 'canada'] = price;
    values.set(year, observation);
  }
  return [...values.values()].sort((a, b) => a.year - b.year);
}

function emptyRow(message) {
  const row = node('tr');
  const cell = node('td', message);
  cell.colSpan = 3;
  row.append(cell);
  return row;
}

async function showReports() {
  if (!$('report-details').open) return;
  const province = $('province').value;
  const market = $('market').value;
  const plan = $('plan').value;
  const speed = $('speed').value;
  const year = Number($('report-year').value);
  const version = generation;
  if (!reportCache.has(province)) {
    reportCache.set(province, data('prices-' + province).catch(error => {
      reportCache.delete(province);
      throw error;
    }));
  }
  $('report-summary').textContent = 'Loading provider reports…';
  $('report-rows').replaceChildren();
  try {
    const reports = await reportCache.get(province);
    if (version !== generation || market !== $('market').value || plan !== $('plan').value ||
        speed !== $('speed').value || year !== Number($('report-year').value)) return;
    const selected = reports.filter(row => row[0] === year && (market === 'National' || market === row[1]) && plan === row[2] && speed === row[3]);
    const offers = new Map();
    for (const [, , , , community, brand, price] of selected) {
      const key = JSON.stringify([brand, price]);
      if (!offers.has(key)) offers.set(key, {brand, price, communities: new Set()});
      offers.get(key).communities.add(community);
    }
    $('report-summary').textContent = selected.length
      ? selected.length + ' provincial source rows. Identical offers are grouped by provider and price. The averages above come directly from the CRTC averages table.'
      : 'The detailed price file has no matching provincial offers for this selection.';
    const rows = [...offers.values()].sort((a, b) => a.price - b.price || collator.compare(a.brand, b.brand)).map(offer => {
      const tr = node('tr');
      tr.append(node('th', offer.brand), node('td', dollars.format(offer.price)), node('td', [...offer.communities].sort(collator.compare).join(', ')));
      return tr;
    });
    $('report-rows').replaceChildren(...rows);
  } catch {
    if (version === generation) $('report-summary').textContent = 'The detailed price file could not be loaded. The published averages are available above.';
  }
}

function render() {
  if (!place) return;
  $('results').hidden = false;
  const provinceName = manifest.provinces[$('province').value];
  $('price-province').textContent = provinceName;
  const coverage = coverageRows();
  const pricing = priceRows();
  selectedSeries = { coverage, pricing };
  const marketName = $('market').selectedOptions[0].textContent;
  const pricePlan = [$('plan').value, $('speed').value].filter(Boolean).join(' · ');
  $('pricing-scope').textContent = marketName + ' survey averages for ' + provinceName + ' and Canada, in CAD per month. These describe the surveyed communities in each market.';
  const gap = year => coverage.some(row => row.year === year && row.base > 0 && row.covered == null);
  $('oxford-note').hidden = !(place[1] === '1211012' && place[2] === 'Rural' && $('metric').value === 'gigabit' && gap(2022) && gap(2023));
  const priorYear = $('report-year').value;
  const yearOptions = pricing.filter(row => row.province != null).map(row => row.year).toReversed();
  $('report-year').replaceChildren(...yearOptions.map(year => option(String(year), year)));
  if (yearOptions.includes(Number(priorYear))) $('report-year').value = priorYear;
  showReports();
  const coverageTable = coverage.toReversed().map(row => {
    const tr = node('tr');
    const value = node('td');
    value.className = 'coverage-number';
    if (row.rate != null) {
      const meter = node('meter');
      meter.max = 1;
      meter.value = row.rate;
      meter.setAttribute('aria-hidden', 'true');
      value.append(meter, percent.format(row.rate));
    } else value.textContent = row.covered == null ? 'No covered estimate' : 'No positive base';
    const fraction = [row.covered, row.base].map(amount => amount == null ? '—' : counts.format(amount)).join(' / ');
    tr.append(node('th', row.year), value, node('td', fraction));
    tr.firstChild.scope = 'row';
    return tr;
  });
  $('coverage').replaceChildren(...coverageTable);
  const priced = value => value == null ? '—' : dollars.format(value);
  const pricingTable = pricing.toReversed().map(row => {
    const tr = node('tr');
    tr.append(node('th', row.year), node('td', priced(row.province)), node('td', priced(row.canada)));
    tr.firstChild.scope = 'row';
    return tr;
  });
  $('pricing').replaceChildren(...(pricingTable.length ? pricingTable : [emptyRow('No observations for this plan and market.')]));
  const currentCoverage = coverage.findLast(row => row.rate != null);
  const currentProvince = pricing.findLast(row => row.province != null);
  const currentNational = pricing.findLast(row => row.canada != null);
  const stats = [
    [currentCoverage ? percent.format(currentCoverage.rate) : '—', `${$('metric').selectedOptions[0].textContent} · ${place[0]} ${place[2]}${currentCoverage ? ` · ${currentCoverage.year}` : ''}`],
    [priced(currentProvince?.province), `${provinceName} · ${marketName} · ${pricePlan}${currentProvince ? ` · ${currentProvince.year}` : ''}`],
    [priced(currentNational?.canada), `Canada · ${marketName} · ${pricePlan}${currentNational ? ` · ${currentNational.year}` : ''}`],
  ];
  $('stats').replaceChildren(...stats.map(([value, label]) => {
    const stat = node('div');
    stat.className = 'stat';
    stat.append(node('strong', value), node('span', label));
    return stat;
  }));
}

function csv(value) {
  return '"' + String(value ?? '').replaceAll('"', '""') + '"';
}

function download() {
  const { coverage, pricing } = selectedSeries;
  const pricesByYear = new Map(pricing.map(row => [row.year, row]));
  const coverageByYear = new Map(coverage.map(row => [row.year, row]));
  const years = [...new Set([...pricesByYear.keys(), ...coverageByYear.keys()])].sort((a, b) => a - b);
  const rows = [['Year', 'Province', 'Census subdivision', 'Subdivision code', 'Area', 'Reserve area', 'Coverage metric', 'Covered estimate', 'Base estimate', 'Coverage fraction', 'Pricing service', 'Pricing plan', 'Pricing market', 'Mobile speed', 'Province CAD/month', 'Canada CAD/month']];
  for (const year of years) {
    const area = coverageByYear.get(year);
    const cost = pricesByYear.get(year);
    rows.push([year, $('province').value, ...place.slice(0, 4), $('metric').selectedOptions[0].textContent,
      area?.covered, area?.base, area?.rate, $('service').value, $('plan').value, $('market').value, $('speed').value,
      cost?.province, cost?.canada]);
  }
  const url = URL.createObjectURL(new Blob([rows.map(row => row.map(csv).join(',')).join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' }));
  const link = node('a');
  link.href = url;
  link.download = 'telecom-pulse.csv';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$('province').addEventListener('change', selectProvince);
$('search').addEventListener('input', updatePlaces);
$('place').addEventListener('change', pickPlace);
$('metric').addEventListener('change', render);
$('service').addEventListener('change', updatePriceChoices);
$('market').addEventListener('change', updatePriceChoices);
$('plan').addEventListener('change', () => updateSpeedChoices());
$('speed').addEventListener('change', render);
$('export').addEventListener('click', download);
$('report-details').addEventListener('toggle', showReports);
$('report-year').addEventListener('change', showReports);

try {
  [manifest, prices] = await Promise.all([data('manifest'), data('pricing')]);
  $('province').replaceChildren(...Object.entries(manifest.provinces).map(([code, name]) => option(code, name)));
  $('province').value = startOxford ? 'NS' : 'BC';
  if (startOxford) $('metric').value = 'gigabit';
  $('province').disabled = false;
  $('build-date').textContent = `CRTC Communications Market Reports · snapshot built ${manifest.built.slice(0, 10)}`;
  $('availability-download').href = manifest.availability;
  $('pricing-download').href = manifest.pricing;
  await selectProvince(startOxford);
} catch {
  status('The snapshot could not be loaded. Retry later or use the official sources below.', true);
}
