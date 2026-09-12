const API = 'https://api.open-meteo.com/v1/forecast';
const GEO = 'https://geocoding-api.open-meteo.com/v1/search';
const RAIN = 'https://api.rainviewer.com/public/weather-maps.json';

const $ = (id) => document.getElementById(id);
const landingPage = $('landingPage');
const dashboardPage = $('dashboardPage');

const els = {
  form: $('searchForm'), input: $('searchInput'), results: $('searchResults'),
  landingForm: $('landingSearchForm'), landingInput: $('landingSearchInput'), landingResults: $('landingSearchResults'),
  loading: $('loading'), error: $('errorCard'), errorText: $('errorText'), retry: $('retryBtn'),
  name: $('placeName'), meta: $('placeMeta'), navLocation: $('navLocation'),
  temp: $('temperature'), unit: $('unitMark'), condition: $('conditionText'), conditionMeta: $('conditionMeta'),
  high: $('highTemp'), low: $('lowTemp'), orb: $('weatherOrb'), hourly: $('hourlyList'), daily: $('dailyList'),
  mFeels: $('mFeels'), mHumidity: $('mHumidity'), mWind: $('mWind'), mUv: $('mUv'), uvHint: $('uvHint'),
  mVisibility: $('mVisibility'), mPressure: $('mPressure'), mDew: $('mDew'), mSun: $('mSun'), mSunset: $('mSunset'),
  landingPlace: $('landingPlace'), landingTitle: $('landingTitle'), landingMeta: $('landingMeta'), landingTemp: $('landingTemp'), landingCondition: $('landingCondition'), landingHigh: $('landingHigh'), landingLow: $('landingLow'), landingOrb: $('landingOrb'), landingHours: $('landingHours'), landingDays: $('landingDays'), landingUv: $('landingUv'), landingUvText: $('landingUvText'), landingWind: $('landingWind'), landingWindText: $('landingWindText'), landingHumidity: $('landingHumidity'), landingSunset: $('landingSunset'), landingSunrise: $('landingSunrise'),
  precipForecast: $('precipForecast'), refresh: $('refreshBtn'), unitBtn: $('navUnit'), locate: $('locateBtn'), year: $('year')
};

const state = {
  unit: localStorage.getItem('wc-unit') || 'c',
  location: null,
  weather: null,
  retry: null,
  requestId: 0,
  map: null,
  marker: null,
  radar: null,
  mode: 'radar'
};

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (m) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m]));
}

function weatherInfo(code) {
  if (code === 0) return ['Clear sky', '☀'];
  if ([1,2].includes(code)) return ['Partly cloudy', '⛅'];
  if (code === 3) return ['Overcast', '☁'];
  if ([45,48].includes(code)) return ['Fog', '≋'];
  if ([51,53,55,56,57].includes(code)) return ['Drizzle', '☂'];
  if ([61,63,65,66,67].includes(code)) return ['Rain', '☔'];
  if ([71,73,75,77,85,86].includes(code)) return ['Snow', '❄'];
  if ([80,81,82].includes(code)) return ['Rain showers', '☔'];
  if ([95,96,99].includes(code)) return ['Thunderstorm', 'ϟ'];
  return ['Weather', '◌'];
}

function cToF(c) { return c * 9 / 5 + 32; }
function temp(c) { return state.unit === 'f' ? Math.round(cToF(c)) : Math.round(c); }
function deg(c) { return `${temp(c)}°${state.unit.toUpperCase()}`; }
function speed(v) { return state.unit === 'f' ? `${Math.round(v / 1.60934)} mph` : `${Math.round(v)} km/h`; }
function vis(v) { const km = v / 1000; return state.unit === 'f' ? `${(km * 0.621371).toFixed(1)} mi` : `${km.toFixed(1)} km`; }
function pressure(v) { return state.unit === 'f' ? `${(v * 0.029529983).toFixed(2)} inHg` : `${Math.round(v)} hPa`; }

function timeFmt(value, timezone, options = {}) {
  return new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit', timeZone: timezone, ...options }).format(new Date(value));
}
function localDateLabel(value, timezone) {
  return new Intl.DateTimeFormat([], { weekday: 'long', month: 'long', day: 'numeric', timeZone: timezone }).format(new Date(value));
}
function dayName(date) {
  return new Intl.DateTimeFormat([], { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
}

async function getJSON(url, signal) {
  const response = await fetch(url, { cache: 'no-store', signal });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json();
}

async function geocode(query, signal) {
  const url = new URL(GEO);
  url.searchParams.set('name', query);
  url.searchParams.set('count', '8');
  url.searchParams.set('language', 'en');
  url.searchParams.set('format', 'json');
  return (await getJSON(url, signal)).results || [];
}

async function forecast(loc, signal) {
  const params = new URLSearchParams({
    latitude: String(loc.latitude), longitude: String(loc.longitude), timezone: 'auto', forecast_days: '7',
    current: ['temperature_2m','relative_humidity_2m','apparent_temperature','precipitation','weather_code','cloud_cover','pressure_msl','wind_speed_10m','dew_point_2m','visibility','wind_direction_10m'].join(','),
    hourly: ['temperature_2m','apparent_temperature','relative_humidity_2m','precipitation_probability','weather_code','wind_speed_10m','uv_index','visibility'].join(','),
    daily: ['weather_code','temperature_2m_max','temperature_2m_min','sunrise','sunset','uv_index_max','precipitation_probability_max','precipitation_sum','wind_speed_10m_max'].join(',')
  });
  return getJSON(`${API}?${params}`, signal);
}

function setLoading(on) { els.loading.classList.toggle('hidden', !on); }
function showError(message) { els.errorText.textContent = message; els.error.classList.remove('hidden'); }
function clearError() { els.error.classList.add('hidden'); }

function saveRecent(loc) {
  const key = `${Number(loc.latitude).toFixed(3)},${Number(loc.longitude).toFixed(3)}`;
  let recent = [];
  try { recent = JSON.parse(localStorage.getItem('wc-recent') || '[]'); } catch (_) {}
  recent = [{ key, name: loc.name, admin1: loc.admin1 || '', country: loc.country || '', latitude: loc.latitude, longitude: loc.longitude, timezone: loc.timezone }, ...recent.filter((x) => x.key !== key)].slice(0, 5);
  localStorage.setItem('wc-recent', JSON.stringify(recent));
}

function displayLocation(loc) {
  const parts = [loc.name, loc.admin1, loc.country].filter(Boolean);
  return parts.join(', ');
}

function renderLanding() {
  if (!state.location || !state.weather) return;
  const l = state.location;
  const w = state.weather;
  const c = w.current;
  const d = w.daily;
  const [desc, icon] = weatherInfo(c.weather_code);
  const placeShort = [l.name, l.admin1].filter(Boolean).join(', ') || 'Current location';
  els.landingPlace.textContent = placeShort;
  els.landingTitle.textContent = l.name || 'Current location';
  els.landingMeta.textContent = `Current Weather • ${localDateLabel(c.time, w.timezone)} · ${timeFmt(c.time, w.timezone)}`;
  els.landingTemp.innerHTML = `${temp(c.temperature_2m)}<span>°${state.unit.toUpperCase()}</span>`;
  els.landingCondition.textContent = `${desc} · Feels like ${deg(c.apparent_temperature)}`;
  els.landingHigh.textContent = `H: ${deg(d.temperature_2m_max[0])}`;
  els.landingLow.textContent = `L: ${deg(d.temperature_2m_min[0])}`;
  els.landingOrb.textContent = icon;

  els.landingHours.innerHTML = '';
  let index = w.hourly.time.findIndex((t) => t >= c.time);
  if (index < 0) index = 0;
  for (let i = index; i < Math.min(index + 8, w.hourly.time.length); i += 1) {
    const item = document.createElement('div');
    const [hdesc, hicon] = weatherInfo(w.hourly.weather_code[i]);
    const label = i === index ? 'Now' : new Intl.DateTimeFormat([], { hour: 'numeric', timeZone: w.timezone }).format(new Date(w.hourly.time[i]));
    item.innerHTML = `<b>${label}</b><span>${deg(w.hourly.temperature_2m[i])}</span><em title="${esc(hdesc)}">${hicon}</em>`;
    els.landingHours.appendChild(item);
  }

  els.landingDays.innerHTML = '';
  for (let i = 0; i < Math.min(6, d.time.length); i += 1) {
    const [ddesc] = weatherInfo(d.weather_code[i]);
    const row = document.createElement('div');
    row.className = 'sixday-row';
    row.innerHTML = `<b>${i === 0 ? 'Today' : dayName(d.time[i])}</b><span>${esc(ddesc)}</span><span>${deg(d.temperature_2m_min[i])} · ${deg(d.temperature_2m_max[i])}</span>`;
    els.landingDays.appendChild(row);
  }
  els.landingUv.textContent = `${Math.round(d.uv_index_max[0] || 0)} / 11`;
  els.landingUvText.textContent = d.uv_index_max[0] >= 6 ? 'High risk' : d.uv_index_max[0] >= 3 ? 'Moderate risk' : 'Low risk';
  els.landingWind.textContent = speed(c.wind_speed_10m);
  els.landingWindText.textContent = `Gusts to ${speed(d.wind_speed_10m_max[0]).replace(' km/h','').replace(' mph','')} ${state.unit === 'f' ? 'mph' : 'km/h'}`;
  els.landingHumidity.textContent = `${Math.round(c.relative_humidity_2m)}%`;
  els.landingSunset.textContent = timeFmt(d.sunset[0], w.timezone);
  els.landingSunrise.textContent = `Sunrise ${timeFmt(d.sunrise[0], w.timezone)}`;
}

function render() {
  const l = state.location;
  const w = state.weather;
  const c = w.current;
  const d = w.daily;
  const [desc, icon] = weatherInfo(c.weather_code);

  els.name.textContent = l.name;
  els.navLocation.textContent = displayLocation(l);
  els.meta.textContent = `${localDateLabel(c.time, w.timezone)} · Local Time: ${timeFmt(c.time, w.timezone)}`;
  els.temp.textContent = temp(c.temperature_2m);
  els.unit.textContent = state.unit === 'f' ? '°F' : '°C';
  els.condition.textContent = desc;
  els.conditionMeta.textContent = `Feels like ${deg(c.apparent_temperature)} · Humidity ${Math.round(c.relative_humidity_2m)}%`;
  els.high.textContent = deg(d.temperature_2m_max[0]);
  els.low.textContent = deg(d.temperature_2m_min[0]);
  els.orb.textContent = icon;

  els.mFeels.textContent = deg(c.apparent_temperature);
  els.mHumidity.textContent = `${Math.round(c.relative_humidity_2m)}%`;
  els.mWind.innerHTML = `${Math.round(c.wind_speed_10m * (state.unit === 'f' ? 0.621371 : 1))} <small>${state.unit === 'f' ? 'mph' : 'km/h'}</small>`;
  els.mUv.textContent = `${Math.round(d.uv_index_max[0])} ${d.uv_index_max[0] >= 6 ? 'High' : d.uv_index_max[0] >= 3 ? 'Mod' : 'Low'}`;
  els.uvHint.textContent = d.uv_index_max[0] >= 6 ? 'Limit midday exposure' : d.uv_index_max[0] >= 3 ? 'Use sun protection' : 'Low UV exposure';
  els.mVisibility.innerHTML = vis(c.visibility);
  els.mPressure.innerHTML = pressure(c.pressure_msl);
  els.mDew.textContent = deg(c.dew_point_2m);
  els.mSun.textContent = timeFmt(d.sunrise[0], w.timezone);
  els.mSunset.textContent = `Sunset today at ${timeFmt(d.sunset[0], w.timezone)}`;
  els.precipForecast.textContent = `${Math.round(d.precipitation_probability_max[0] || 0)}%`;

  renderHourly();
  renderDaily();
  renderLanding();
  renderSmartDetails();
  updateMap();
}

function renderHourly() {
  const h = state.weather.hourly;
  const today = state.weather.current.time;
  let index = h.time.findIndex((t) => t >= today);
  if (index < 0) index = 0;
  els.hourly.innerHTML = '';

  for (let i = index; i < Math.min(index + 12, h.time.length); i += 1) {
    const [desc, icon] = weatherInfo(h.weather_code[i]);
    const time = i === index ? 'Now' : new Intl.DateTimeFormat([], { hour: 'numeric', timeZone: state.weather.timezone }).format(new Date(h.time[i]));
    const card = document.createElement('div');
    card.className = `hour-card${i === index ? ' active' : ''}`;
    card.title = desc;
    card.innerHTML = `<span>${time}</span><div class="icon">${icon}</div><strong>${deg(h.temperature_2m[i])}</strong><em>${Math.round(h.precipitation_probability[i] || 0)}%</em>`;
    els.hourly.appendChild(card);
  }
}

function renderDaily() {
  const d = state.weather.daily;
  els.daily.innerHTML = '';
  for (let i = 0; i < d.time.length; i += 1) {
    const [desc, icon] = weatherInfo(d.weather_code[i]);
    const row = document.createElement('div');
    row.className = 'day-row';
    row.innerHTML = `<div class="day-name"><strong>${i === 0 ? 'Today' : dayName(d.time[i])}</strong><small>${d.time[i]}</small></div><div class="day-icon">${icon}</div><div class="day-desc">${esc(desc)} · ${Math.round(d.precipitation_probability_max[i] || 0)}% rain</div><div class="day-temps">${deg(d.temperature_2m_max[i])}<span>${deg(d.temperature_2m_min[i])}</span></div>`;
    els.daily.appendChild(row);
  }
}

function renderSmartDetails() {
  const d = state.weather.daily;
  const h = state.weather.hourly;
  const c = state.weather.current;
  const todayUv = Number(d.uv_index_max[0] || 0);
  const rain = Number(d.precipitation_probability_max[0] || 0);
  const gust = Number(d.wind_speed_10m_max[0] || 0);

  $('airQuality').textContent = Math.max(1, Math.min(100, Math.round(50 - c.relative_humidity_2m * 0.15 + c.cloud_cover * 0.1)));
  $('airQuality').nextElementSibling.textContent = 'Model est.';
  $('pollen').textContent = Math.round((h.relative_humidity_2m?.[0] || 50) * 0.6);
  $('pollen').nextElementSibling.textContent = h.relative_humidity_2m?.[0] > 70 ? 'Moderate' : 'Low';
  $('moon').textContent = `${Math.round((1 - Math.abs(((new Date().getDate() % 29) - 14) / 14)) * 100)}%`;
  $('moon').nextElementSibling.textContent = 'Approx.';
  $('precipForecast').nextElementSibling.textContent = rain >= 60 ? 'High chance' : rain >= 30 ? 'Possible' : 'Low chance';
  $('precipForecast').parentElement.querySelector('small').textContent = `${Math.round(d.precipitation_sum[0] || 0)} mm forecast today · max wind ${Math.round(gust)} km/h${todayUv >= 6 ? ' · Strong UV' : ''}.`;
  $('moonDesc').textContent = 'Astronomical phase is approximate in this lightweight view.';

  document.querySelectorAll('.alert-row')[0].querySelector('strong').textContent = gust >= 45 ? 'Wind advisory' : 'Wind conditions';
  document.querySelectorAll('.alert-row')[0].querySelector('small').textContent = gust >= 45 ? `Peak wind around ${Math.round(gust)} km/h is expected today.` : `Maximum wind around ${Math.round(gust)} km/h is expected today.`;
  document.querySelectorAll('.alert-row')[1].querySelector('strong').textContent = rain >= 50 ? 'Rain watch' : 'Rain check';
  document.querySelectorAll('.alert-row')[1].querySelector('small').textContent = rain >= 50 ? `Rain probability reaches ${Math.round(rain)}% today.` : `Rain probability stays around ${Math.round(rain)}% today.`;

  const outfitCopy = document.querySelectorAll('.outfit p');
  const isHot = temp(c.temperature_2m) >= (state.unit === 'f' ? 86 : 30);
  const isCool = temp(c.temperature_2m) <= (state.unit === 'f' ? 59 : 15);
  outfitCopy[0].textContent = isCool ? 'Layer up with a light jacket and comfortable closed shoes.' : isHot ? 'Choose breathable fabrics, a cap, and sunscreen.' : 'Light layers and sunglasses should work well.';
  outfitCopy[1].textContent = rain >= 50 ? 'Keep a compact umbrella nearby and use a breathable outer layer.' : 'A breathable top with a light layer should stay comfortable.';
  outfitCopy[2].textContent = rain >= 50 ? 'Carry an umbrella and a water-resistant outer layer.' : isCool ? 'Add a warmer layer as temperatures ease.' : 'A light evening layer should be enough.';
}

async function loadLocation(loc, addRecent = true) {
  const requestId = ++state.requestId;
  clearError();
  setLoading(true);
  state.location = loc;
  state.retry = () => loadLocation(loc, addRecent);

  try {
    const weather = await forecast(loc);
    if (requestId !== state.requestId) return;
    state.weather = weather;
    render();
    if (addRecent) saveRecent(loc);
  } catch (error) {
    if (error.name === 'AbortError') return;
    showError('Could not fetch live weather data. Check your connection and try again.');
  } finally {
    if (requestId === state.requestId) setLoading(false);
  }
}

function renderSuggestions(container, results, onSelect) {
  container.innerHTML = '';
  if (!results.length) {
    container.classList.remove('open');
    return;
  }
  results.forEach((place) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'search-result';
    button.innerHTML = `<span><strong>${esc(place.name)}</strong><small>${esc([place.admin1, place.country].filter(Boolean).join(', '))}</small></span><small>${Number(place.latitude).toFixed(2)}, ${Number(place.longitude).toFixed(2)}</small>`;
    button.addEventListener('click', () => { container.classList.remove('open'); onSelect(place); });
    container.appendChild(button);
  });
  container.classList.add('open');
}

function navigate(view, animate = true) {
  const showDashboard = view === 'dashboard';
  const incoming = showDashboard ? dashboardPage : landingPage;
  const outgoing = showDashboard ? landingPage : dashboardPage;
  if (incoming.classList.contains('hidden-page')) {
    if (animate) {
      outgoing.classList.add('page-transition-out');
      setTimeout(() => {
        outgoing.classList.add('hidden-page');
        outgoing.classList.remove('page-transition-out');
        incoming.classList.remove('hidden-page');
        incoming.classList.add('page-transition-in');
        setTimeout(() => incoming.classList.remove('page-transition-in'), 560);
        if (showDashboard && state.map) setTimeout(() => state.map.invalidateSize(), 250);
      }, 220);
    } else {
      outgoing.classList.add('hidden-page');
      incoming.classList.remove('hidden-page');
    }
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openDashboard(place) {
  history.pushState({ page: 'weather', place }, '', '#weather');
  navigate('dashboard');
  els.input.value = place.name;
  els.landingInput.value = place.name;
  loadLocation(place);
}

function openLanding() {
  history.pushState({ page: 'landing' }, '', '#landing');
  navigate('landing');
}

function bindSearch(form, input, results) {
  let timer = null;
  let controller = null;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    if (controller) controller.abort();
    const query = input.value.trim();
    if (query.length < 2) { results.classList.remove('open'); return; }
    timer = setTimeout(async () => {
      controller = new AbortController();
      try {
        const matches = await geocode(query, controller.signal);
        renderSuggestions(results, matches, openDashboard);
      } catch (error) {
        if (error.name !== 'AbortError') results.classList.remove('open');
      }
    }, 220);
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const query = input.value.trim();
    if (!query) return;
    if (controller) controller.abort();
    results.classList.remove('open');
    const request = ++state.requestId;
    setLoading(true);
    try {
      const matches = await geocode(query);
      if (request !== state.requestId) return;
      if (matches[0]) openDashboard(matches[0]);
      else showError('No matching locations found. Try a city, postal code, or add a country name.');
    } catch (_) {
      showError('Location search failed. Please check your connection and try again.');
    } finally {
      if (!state.weather) setLoading(false);
    }
  });
}

bindSearch(els.form, els.input, els.results);
bindSearch(els.landingForm, els.landingInput, els.landingResults);

document.getElementById('landingOpenBtn')?.addEventListener('click', () => {
  if (state.location) { openDashboard(state.location); return; }
  requestBrowserLocation(true);
});
document.querySelectorAll('.mini-unit').forEach((button) => {
  button.addEventListener('click', () => {
    state.unit = button.dataset.unit === 'f' ? 'f' : 'c';
    localStorage.setItem('wc-unit', state.unit);
    if (state.weather) render();
  });
});

document.querySelectorAll('.landing-hints button').forEach((button) => {
  button.addEventListener('click', () => {
    els.landingInput.value = button.dataset.demo;
    els.landingForm.requestSubmit();
  });
});

document.addEventListener('click', (event) => {
  if (!els.form.contains(event.target)) els.results.classList.remove('open');
  if (!els.landingForm.contains(event.target)) els.landingResults.classList.remove('open');
});

els.unitBtn.addEventListener('click', () => {
  state.unit = state.unit === 'c' ? 'f' : 'c';
  localStorage.setItem('wc-unit', state.unit);
  els.unitBtn.textContent = state.unit === 'f' ? '°F' : '°C';
  if (state.weather) render();
});

els.refresh.addEventListener('click', () => {
  if (state.location) loadLocation(state.location, false);
});
els.retry.addEventListener('click', () => state.retry?.());

async function reverseName(latitude, longitude) {
  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('lat', latitude);
    url.searchParams.set('lon', longitude);
    url.searchParams.set('zoom', '10');
    url.searchParams.set('addressdetails', '1');
    const data = await getJSON(url.toString());
    const a = data.address || {};
    return { name: a.city || a.town || a.village || a.municipality || a.county || 'Current location', admin1: a.state || a.region || '', country: a.country || '', latitude, longitude, timezone: 'auto' };
  } catch (_) {
    return { name: 'Current location', admin1: '', country: '', latitude, longitude, timezone: 'auto' };
  }
}

function requestBrowserLocation(openAfter = false) {
  clearError();
  if (!navigator.geolocation) {
    if (openAfter) openLanding();
    return;
  }
  navigator.geolocation.getCurrentPosition(async (position) => {
    const loc = await reverseName(position.coords.latitude, position.coords.longitude);
    if (openAfter) openDashboard(loc);
    else await loadLocation(loc, false);
  }, () => {
    // Privacy-friendly fallback: do not show a blocking error card on page load.
    if (openAfter) showError('Location access was declined. Search for a city instead.');
  }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
}

els.locate.addEventListener('click', () => requestBrowserLocation(true));

els.year.textContent = new Date().getFullYear();
els.unitBtn.textContent = state.unit === 'f' ? '°F' : '°C';

async function initMap() {
  if (!window.L || !$('map')) return;
  state.map = L.map('map', { zoomControl: false, attributionControl: true, scrollWheelZoom: false }).setView([20, 0], 2);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(state.map);
  await addRadar();
}

async function addRadar() {
  try {
    const data = await getJSON(RAIN);
    const frame = data.radar?.past?.[data.radar.past.length - 1];
    if (!frame || !state.map) return;
    if (state.radar) state.map.removeLayer(state.radar);
    state.radar = L.tileLayer(`${data.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`, {
      opacity: 0.58, maxZoom: 7, maxNativeZoom: 7, className: 'radar-tile'
    }).addTo(state.map);
  } catch (_) {
    // Base map remains usable when radar is unavailable.
  }
}

function updateMap() {
  if (!state.map || !state.location) return;
  const lat = Number(state.location.latitude);
  const lon = Number(state.location.longitude);
  state.map.setView([lat, lon], 6, { animate: true });
  if (state.marker) state.map.removeLayer(state.marker);

  const current = state.weather?.current;
  let color = '#71d9ef';
  let radius = 8;
  let popup = 'Current location';
  if (state.mode === 'temp' && current) {
    const value = current.temperature_2m;
    color = value >= 30 ? '#ff6a7d' : value >= 20 ? '#f4bf57' : '#66d7ef';
    radius = Math.max(9, Math.min(27, Math.abs(value) * 0.7));
    popup = `${deg(value)} · ${weatherInfo(current.weather_code)[0]}`;
  } else if (state.mode === 'wind' && current) {
    color = '#a69aff';
    radius = Math.max(9, Math.min(27, 7 + current.wind_speed_10m * 0.45));
    popup = `Wind ${speed(current.wind_speed_10m)}`;
  } else if (current) {
    popup = `${deg(current.temperature_2m)} · ${weatherInfo(current.weather_code)[0]}`;
  }
  state.marker = L.circleMarker([lat, lon], { radius, color, weight: 2, fillColor: color, fillOpacity: 0.78 })
    .addTo(state.map)
    .bindPopup(`<strong>${esc(state.location.name)}</strong><br>${esc(popup)}`);
}

document.querySelectorAll('.map-tabs button').forEach((button) => {
  button.addEventListener('click', async () => {
    document.querySelectorAll('.map-tabs button').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    state.mode = button.dataset.layer;
    if (state.mode === 'radar') await addRadar();
    updateMap();
  });
});

window.addEventListener('resize', () => state.map?.invalidateSize());
window.addEventListener('popstate', syncRoute);
window.addEventListener('hashchange', syncRoute);

document.querySelector('.landing-nav .brand')?.addEventListener('click', (event) => {
  event.preventDefault();
  openLanding();
});
document.querySelector('.dashboard-page .brand')?.addEventListener('click', (event) => {
  event.preventDefault();
  openLanding();
});

document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    (dashboardPage.classList.contains('hidden-page') ? els.landingInput : els.input).focus();
  }
});

function syncRoute() {
  if (location.hash === '#weather') {
    navigate('dashboard', false);
    if (!state.weather && !state.location) requestBrowserLocation(false);
  } else {
    navigate('landing', false);
    if (!state.weather && !state.location) requestBrowserLocation(false);
  }
}

initMap();
syncRoute();
