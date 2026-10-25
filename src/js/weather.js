// ============================================================
// WEATHER: part of the simulation (it changes moods and plans), so it uses the sim's rng and is saved.
// What it looks like lives in ambience.js.
// ============================================================
const WEATHER = {
  clear:  { label: 'Clear',  hours: [6, 16], next: { clear: 3, cloudy: 4 } },
  cloudy: { label: 'Cloudy', hours: [3, 8],  next: { clear: 4, cloudy: 1, rain: 4 } },
  rain:   { label: 'Rain',   hours: [2, 6],  next: { cloudy: 5, rain: 1 } },
  fog:    { label: 'Fog',    hours: [3, 5],  next: { clear: 3, cloudy: 1 } },
};
function initWeather(w) {
  w.weather = { kind: 'clear', until: w.time + randRange(4, 10) * HOUR, wind: 0.3, windTarget: 0.3 };
}
function pickWeather(w) {
  const now = w.weather.kind, h = hourOf(w.time);
  const options = Object.entries(WEATHER[now].next).map(([kind, weight]) => ({ kind, weight }));
  if (h >= 3 && h < 7 && now !== 'rain') options.push({ kind: 'fog', weight: 2 }); // mist settles before dawn
  const kind = weightedPick(options, o => o.weight).kind;
  const [lo, hi] = WEATHER[kind].hours;
  w.weather.kind = kind;
  w.weather.until = w.time + randRange(lo, hi) * HOUR;
  w.weather.windTarget = kind === 'rain' ? randRange(0.5, 1) : kind === 'fog' ? randRange(0, 0.15) : randRange(0.1, 0.7);
}
// Hourly: maybe change the weather; the wind eases toward its target so gusts build and fade.
function updateWeather(w) {
  if (!w.weather) initWeather(w);
  if (w.time >= w.weather.until) pickWeather(w);
  w.weather.wind = lerp(w.weather.wind, w.weather.windTarget, 0.5);
}
const isRaining = w => w.weather && w.weather.kind === 'rain';
// Every 10 minutes from refreshMind: what the sky does to someone's mood.
function weatherThoughts(th, w) {
  if (!w.weather) return;
  const h = hourOf(w.time);
  if (isRaining(w)) {
    if (th.hidden && th.asleep) addThought(th, w, 'rain_on_roof');
    else if (!th.hidden) {
      if (!th.thoughts.some(t => t.id === 'got_soaked')) emote(th, w, 'rain', 15); // caught out: a little cloud
      addThought(th, w, 'got_soaked');
    }
  } else if (w.weather.kind === 'clear' && h >= 10 && h < 16 && !th.hidden && !th.asleep && chance(0.15)) {
    addThought(th, w, 'sunshine');
  }
}
