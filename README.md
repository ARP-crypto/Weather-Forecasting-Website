# WeatherCast — GitHub-ready weather forecast

A responsive two-screen weather web app inspired by the supplied Figma design.

## Figma-style flow

1. **Landing page** — the first screen presents the branded hero, global search, and a dashboard preview.
2. **Weather dashboard** — submitting a location search transitions to the second screen and loads live weather for that location.
3. Searching again from the dashboard keeps the user on the dashboard and refreshes every weather section for the new place.
4. Clicking the WeatherCast logo returns to the landing screen.

The app also supports the browser URL hashes `#landing` and `#weather` for the two screens.

## Included

- Worldwide city / region / postal-code search
- Live current weather and local time
- 12-hour hourly timeline
- 7-day forecast
- Detailed weather metrics
- Sunrise / sunset
- Interactive radar map with temperature and wind modes
- Celsius / Fahrenheit toggle
- Browser geolocation
- Responsive layout
- Static deployment — no backend required

## Data sources

- Open-Meteo Geocoding API: worldwide location search
- Open-Meteo Forecast API: weather data
- RainViewer: radar tiles
- OpenStreetMap: base map tiles

## GitHub Pages

Upload the contents of this folder to a GitHub repository and enable:

**Settings → Pages → Deploy from branch → main → /(root)**

No build step is required.

## Local development

Run any static HTTP server from this folder, for example:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.
