const stations = [
  { id: 1, name: "赤島原", rapid: true, express: true, major: true },
  { id: 2, name: "南大山", express: true },
  { id: 3, name: "幅栗", express: true },
  { id: 4, name: "坂柳", express: true },
  { id: 5, name: "大狩", express: true },
  { id: 6, name: "芝潟崎下", express: true },
  { id: 7, name: "穂ノ鳥", express: true },
  { id: 8, name: "板沼", rapid: true, express: true, major: true },
  { id: 9, name: "宮藤" },
  { id: 10, name: "鎌張本郷" },
  { id: 11, name: "鎌張" },
  { id: 12, name: "宮大野", rapid: true },
  { id: 13, name: "千木良" },
  { id: 14, name: "三井" },
  { id: 15, name: "大橋", rapid: true, major: true },
  { id: 16, name: "江川", rapid: true, express: true, major: true },
  { id: 17, name: "しょみん", rapid: true, express: true },
  { id: 18, name: "しょみん中央" },
  { id: 19, name: "しょみん村" },
  { id: 20, name: "小豆町" },
  { id: 21, name: "木下" },
  { id: 22, name: "船戸", rapid: true, express: true, major: true },
  { id: 23, name: "棚前" },
  { id: 24, name: "岡上" },
  { id: 25, name: "南山神" },
  { id: 26, name: "山神", rapid: true },
  { id: 27, name: "北山神" },
  { id: 28, name: "花先" },
  { id: 29, name: "大吹", rapid: true },
  { id: 30, name: "呼塚", rapid: true },
  { id: 31, name: "東呼塚" },
  { id: 32, name: "日田ヶ谷" },
  { id: 33, name: "桜浜", rapid: true },
  { id: 34, name: "東白葉" },
  { id: 35, name: "南鎌原" },
  { id: 36, name: "新桜浜", rapid: true, major: true },
  { id: 37, name: "荒井" },
  { id: 38, name: "武蔵多摩浜", rapid: true, express: true, major: true },
  { id: 39, name: "州久内" },
  { id: 40, name: "品山", rapid: true, major: true },
  { id: 41, name: "新端", rapid: true, major: true },
  { id: 42, name: "東ノ宮", rapid: true, express: true, major: true },
];

const branchStations = [
  { id: "TA0", name: "船戸", code: "TA 00", major: true },
  { id: "TA1", name: "青崎", code: "TA 01", major: true },
  { id: "TA2", name: "縦浜新都心", code: "TA 02", major: true },
  { id: "TA3", name: "戸羽空港", code: "TA 03", major: true },
];

const stationMap = new Map([...stations, ...branchStations].map((station) => [station.id, station]));
const platformStations = new Set([1, 8, 15, 16, 22, 29, 36, 38, 40, 41, 42]);
const overviewMap = document.getElementById("overviewMap");
const zoomMap = document.getElementById("zoomMap");
const railPanel = document.getElementById("railPanel");
const dialog = document.getElementById("trainDialog");
const dialogBody = document.getElementById("dialogBody");

const lineColors = {
  rapid: "rapid",
  airport: "airport",
  limited: "limited",
  local: "local",
  miyano: "ordinary",
};

const dwellSeconds = 45;
const turnbackSeconds = 7 * 60;
const airportLayoverSeconds = 15 * 60;
const miyanoOvertakeStations = new Set([5, 8, 10, 12, 15]);
let mapPoints = new Map();
let zoomPoints = new Map();
let trains = [];
let userZoomScale = 1;
let pinchStartDistance = 0;
let pinchStartScale = 1;

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatTime(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatTimeSeconds(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function updateLastRefresh(date = new Date()) {
  const node = document.getElementById("lastRefreshText");
  if (node) node.textContent = `最終更新 ${formatTimeSeconds(date)}`;
}

function stationById(id) {
  return stationMap.get(id);
}

function mainIds(start, end) {
  const step = start < end ? 1 : -1;
  const ids = [];
  for (let id = start; step > 0 ? id <= end : id >= end; id += step) ids.push(id);
  return ids;
}

function reverseStops(stops) {
  return [...stops].reverse();
}

const adjacentMinutes = [5, 5, 5, 5, 5, 5, 5, 4, 4, 3, 4, 5, 3, 3, 2, 3, 2, 3, 3, 3, 3, 2, 3, 3, 3, 3, 3, 3, 5, 5, 4, 4, 2, 3, 3, 4, 5, 6, 5, 6, 3];

function adjacentTravelSeconds(a, b) {
  if (typeof a !== "number" || typeof b !== "number") return 4 * 60;
  const low = Math.min(a, b);
  return (adjacentMinutes[low - 1] || 3) * 60;
}

function travelSecondsBetween(from, to, train) {
  if (typeof from === "string" || typeof to === "string") return branchTravelSeconds(from, to);
  const step = from < to ? 1 : -1;
  let total = 0;
  for (let id = from; id !== to; id += step) total += adjacentTravelSeconds(id, id + step);
  const skipped = Math.max(0, Math.abs(to - from) - 1);
  const passingReduction = train?.kind === "local" || train?.kind === "miyano" ? 0 : skipped * 2 * 60;
  let result = Math.max(90, total - passingReduction);
  if (train?.kind === "limited" && Math.min(from, to) >= 36) result = Math.ceil(result * 1.35);
  if (train?.label === "快速急行" && Math.min(from, to) >= 36) result = Math.ceil(result * 1.25);
  return result;
}

function branchTravelSeconds(from, to) {
  const order = ["TA0", "TA1", "TA2", "TA3"];
  const a = from === 22 ? 0 : order.indexOf(from);
  const b = to === 22 ? 0 : order.indexOf(to);
  return Math.max(1, Math.abs(a - b)) * 4 * 60;
}

function stopDwell(train, stop, index) {
  if (train.passThrough?.includes(stop)) return 0;
  if (train.fixedDwell?.[stop] != null) return train.fixedDwell[stop];
  if (train.kind === "miyano" && stop === 8 && index > 0 && index < train.stops.length - 1) return 5 * 60;
  if (train.kind === "miyano" && stop === 5 && index > 0 && index < train.stops.length - 1) return 4 * 60;
  if (train.kind === "miyano" && miyanoOvertakeStations.has(stop) && index > 0 && index < train.stops.length - 1) return 3 * 60;
  if (index === train.stops.length - 1) return train.terminalLayover || dwellSeconds;
  return dwellSeconds;
}

function journeySeconds(train) {
  let total = 0;
  for (let i = 0; i < train.stops.length; i += 1) {
    total += stopDwell(train, train.stops[i], i);
    if (i < train.stops.length - 1) total += travelSecondsBetween(train.stops[i], train.stops[i + 1], train);
  }
  return total;
}

function runtimeAtStop(train, stopId, depart = false) {
  let elapsed = 0;
  for (let i = 0; i < train.stops.length; i += 1) {
    if (train.stops[i] === stopId) return elapsed + (depart ? stopDwell(train, stopId, i) : 0);
    elapsed += stopDwell(train, train.stops[i], i);
    if (i < train.stops.length - 1) elapsed += travelSecondsBetween(train.stops[i], train.stops[i + 1], train);
  }
  return 0;
}

const egawaRapidEastTimetable = [
  { arr: 1, dep: 2, label: "快速", dest: "島橋", platform: "1" },
  { arr: 2, dep: 4, label: "快速", dest: "新桜浜", platform: "2", depot: true },
  { arr: 4, dep: 6, label: "快速", dest: "滋葉", platform: "1", depot: true },
  { arr: 6, dep: 8, label: "快速", dest: "新桜浜", platform: "2", depot: true },
  { arr: 8, dep: 10, label: "快速", dest: "戸羽空港", platform: "1", depot: true },
  { arr: 10, dep: 12, label: "快速", dest: "東ノ宮", platform: "2", depot: true },
  { arr: 12, dep: 14, label: "快速", dest: "新桜浜", platform: "1", depot: true },
  { arr: 14, dep: 16, label: "快速", dest: "花取", platform: "2", depot: true },
  { arr: 16, dep: 18, label: "快速", dest: "志田浦", platform: "1", depot: true },
  { arr: 18, dep: 20, label: "快速", dest: "新桜浜", platform: "2", depot: true },
  { arr: 20, dep: 22, label: "快速", dest: "南鎌崎", platform: "1", depot: true },
  { arr: 22, dep: 24, label: "快速急行", dest: "東ノ宮", platform: "2", express: true },
  { arr: 24, dep: 26, label: "快速", dest: "戸羽空港", platform: "1", depot: true },
  { arr: 27, dep: 28, label: "快速", dest: "新桜浜", platform: "1", depot: true },
  { arr: 27, dep: 30, label: "快速", dest: "北宮", platform: "2", depot: true },
  { arr: 30, dep: 32, label: "快速", dest: "新桜浜", platform: "1", depot: true },
  { arr: 32, dep: 34, label: "快速", dest: "滋葉", platform: "2", depot: true },
  { arr: 34, dep: 36, label: "快速", dest: "新桜浜", platform: "1", depot: true },
  { arr: 36, dep: 38, label: "快速", dest: "東ノ宮", platform: "2", depot: true },
  { arr: 38, dep: 40, label: "快速", dest: "戸羽空港", platform: "1", depot: true },
  { arr: 40, dep: 42, label: "快速", dest: "南鎌崎", platform: "2", depot: true },
  { arr: 42, dep: 44, label: "快速", dest: "新桜浜", platform: "1", depot: true },
  { arr: 44, dep: 46, label: "快速", dest: "滋葉", platform: "2", depot: true },
  { arr: 46, dep: 48, label: "快速急行", dest: "東ノ宮", platform: "1", express: true },
  { arr: 48, dep: 50, label: "快速", dest: "新桜浜", platform: "2", depot: true },
  { arr: 49, dep: 51, label: "快速", dest: "花取", platform: "1", depot: true },
  { arr: 53, dep: 54, label: "快速", dest: "戸羽空港", platform: "1", depot: true },
  { arr: 54, dep: 55, label: "快速", dest: "新桜浜", platform: "2", depot: true },
  { arr: 56, dep: 57, label: "快速", dest: "志田浦", platform: "1", depot: true },
  { arr: 58, dep: 60, label: "快速", dest: "新桜浜", platform: "2", depot: true },
];

const limitedTimetable = [
  { arr: 58, dep: 70, label: "のどり・特急", dest: "みらいじま・滋葉", platform: "9", direction: "down", cars: 12, note: "前寄り6両はみらいじま行き、後寄り6両は滋葉行き" },
  { arr: 21, dep: 23, label: "しょみん線・特急", dest: "東ノ宮", platform: "9", direction: "down", cars: 10 },
  { arr: 12, dep: 37, label: "しまなみ・特急", dest: "稲豆", platform: "10", direction: "down", cars: 12 },
  { arr: 46, dep: 48, label: "とわ・空港特急", dest: "戸羽空港", platform: "9", direction: "down", cars: 12 },
  { arr: 52, dep: 54, label: "しょみん線・特急", dest: "東ノ宮", platform: "9", direction: "down", cars: 10 },
  { arr: 25, dep: 26, label: "しょみん線・特急", dest: "赤島原", platform: "9", direction: "up", cars: 10 },
  { arr: 33, dep: 35, label: "とわ・空港特急", dest: "赤島原", platform: "9", direction: "up", cars: 12 },
  { arr: 43, dep: 45, label: "しょみん線・特急", dest: "赤島原", platform: "10", direction: "up", cars: 10 },
];

function rapidStops(origin, dest, express = false) {
  if (dest === "戸羽空港") return [...rapidStops(origin, 22, express), "TA1", "TA2", "TA3"];
  const terminal = typeof dest === "number" ? dest : dest === "新桜浜" ? 36 : 42;
  if (express) {
    const base = [1, 2, 3, 4, 5, 6, 7, 8, 15, 16, 17, 22, 36, 38, 40, 41, 42];
    const filtered = base.filter((id) => origin <= terminal ? id >= origin && id <= terminal : id <= origin && id >= terminal);
    return origin <= terminal ? filtered : filtered.reverse();
  }
  const ids = mainIds(origin, terminal).filter((id) => {
    const station = stationById(id);
    return id === origin || id === terminal || station.rapid;
  });
  return ids;
}

function localStops(origin, terminal) {
  return mainIds(origin, terminal);
}

function returnPlanForRapid(entry, index) {
  if (entry.express) return { dest: "赤島原", terminal: 1, layover: 2 * 60, nextDest: "東ノ宮" };
  if (index === 0 || index === 15) return { dest: "板沼", terminal: 8, layover: 8 * 60 };
  if (index % 3 === 1) return { dest: "大橋", terminal: 15, layover: 7 * 60, nextDest: "江川", platform: "2" };
  return { dest: "江川", terminal: 16, layover: 45 };
}

function throughOriginForDestination(destination) {
  if (isMiraijimaDestination(destination)) return "みらいじま線から直通";
  if (isSanbuDestination(destination)) return "山武線から直通";
  return "";
}

function makeRapidTrain(entry, index, direction) {
  const express = !!entry.express;
  const line = entry.dest === "戸羽空港" ? "airport" : "rapid";
  if (direction === "down") {
    const origin = entry.depot ? 16 : 1;
    const stops = rapidStops(origin, entry.dest, express);
    const returnPlan = returnPlanForRapid(entry, index);
    const continuesBeyondHigashi = isMiraijimaDestination(entry.dest) || isSanbuDestination(entry.dest);
    const train = {
      key: `rapid-${index}-down`,
      label: entry.label,
      kind: line,
      color: lineColors[line],
      direction: "down",
      stops,
      passThrough: express ? [36] : [],
      platformAtEgawa: entry.platform,
      fixedDwell: { 16: Math.max(45, (entry.dep - entry.arr) * 60) },
      destination: entry.dest,
      cars: 15,
      laneDown: entry.platform === "1" ? "rapidDownA" : "rapidDownB",
      laneUp: "rapidUpA",
      terminalLayover: entry.dest === "戸羽空港" ? airportLayoverSeconds : turnbackSeconds,
      nextDestination: continuesBeyondHigashi ? undefined : returnPlan.dest,
      nextStops: continuesBeyondHigashi ? undefined : entry.dest === "戸羽空港"
        ? ["TA3", "TA2", "TA1", 22, ...rapidStops(22, returnPlan.terminal, express).slice(1)]
        : rapidStops(entry.dest === "新桜浜" ? 36 : 42, returnPlan.terminal, express),
      scheduled: true,
      note: express ? "船戸の次は武蔵多摩浜に停車します。船戸 - 新桜浜間は特急レーンを走行します。" : "",
    };
    train.offset = entry.dep * 60 - runtimeAtStop(train, 16, true);
    return train;
  }
  const plan = returnPlanForRapid(entry, index);
  const start = entry.dest === "戸羽空港" ? "TA3" : entry.dest === "新桜浜" ? 36 : 42;
  const stops = start === "TA3"
    ? ["TA3", "TA2", "TA1", 22, ...rapidStops(22, plan.terminal, express).slice(1)]
    : rapidStops(start, plan.terminal, express);
  const platform = index % 2 === 0 ? "3" : "4";
  const train = {
    key: `rapid-${index}-up`,
    label: entry.label,
    kind: line,
    color: lineColors[line],
    direction: "up",
    stops,
    passThrough: express ? [36] : [],
    platformAtEgawa: platform,
    platformAtOhashi: plan.terminal === 15 ? plan.platform : undefined,
    throughOrigin: throughOriginForDestination(entry.dest),
    destination: plan.dest,
    cars: 15,
    laneDown: "rapidDownA",
    laneUp: platform === "3" ? "rapidUpA" : "rapidUpB",
    terminalLayover: plan.layover,
    nextDestination: plan.nextDest || entry.dest,
    nextStops: plan.nextDest ? [15, 16] : rapidStops(plan.terminal, entry.dest === "戸羽空港" ? 22 : entry.dest === "新桜浜" ? 36 : 42, express),
    scheduled: true,
    note: express ? "船戸の次は武蔵多摩浜に停車します。船戸 - 新桜浜間は特急レーンを走行します。" : "",
  };
  train.offset = entry.arr * 60 - runtimeAtStop(train, 16, false);
  return train;
}

function makeOhashiToEgawaTrain(upTrain, index) {
  if (upTrain.stops.at(-1) !== 15) return null;
  return {
    key: `rapid-${index}-ohashi-egawa`,
    label: "快速",
    kind: "rapid",
    color: lineColors.rapid,
    direction: "down",
    stops: [15, 16],
    destination: "江川",
    cars: 15,
    laneDown: "miyanoDown",
    laneUp: "miyanoUp",
    platformAtOhashi: upTrain.platformAtOhashi || "2",
    platformAtEgawa: index % 2 === 0 ? "5" : "6",
    offset: upTrain.offset + journeySeconds(upTrain),
    terminalLayover: 30,
    scheduled: true,
  };
}

function makeLimitedTrain(entry, index) {
  const down = entry.direction === "down";
  const destAirport = String(entry.dest).includes("戸羽空港") || String(entry.label).includes("空港");
  const stops = down
    ? destAirport ? [16, 22, "TA1", "TA2", "TA3"] : [16, 38, 42]
    : [16, 8, 1];
  const train = {
    key: `limited-${index}`,
    label: entry.label,
    kind: "limited",
    color: lineColors.limited,
    direction: entry.direction,
    stops,
    passThrough: destAirport ? [22] : [],
    platformAtEgawa: entry.platform,
    fixedDwell: { 16: Math.max(45, (entry.dep - entry.arr) * 60) },
    destination: entry.dest,
    cars: entry.cars,
    laneDown: "expressDown",
    laneUp: "expressUp",
    terminalLayover: destAirport ? airportLayoverSeconds : turnbackSeconds,
    scheduled: true,
    note: entry.note || "",
  };
  train.offset = (down ? entry.dep * 60 - runtimeAtStop(train, 16, true) : entry.arr * 60 - runtimeAtStop(train, 16, false));
  return train;
}

function makePatternTrain({ key, label, kind, direction, stops, interval, offset, destination, cars, laneDown, laneUp, terminalLayover, throughOrigin }) {
  return {
    key,
    label,
    kind,
    color: lineColors[kind],
    direction,
    stops,
    interval,
    offset,
    destination,
    cars,
    laneDown,
    laneUp,
    terminalLayover,
    throughOrigin,
  };
}

const serviceTemplates = [];
egawaRapidEastTimetable.forEach((entry, index) => {
  const down = makeRapidTrain(entry, index, "down");
  const up = makeRapidTrain(entry, index, "up");
  serviceTemplates.push(down, up);
  const ohashi = makeOhashiToEgawaTrain(up, index);
  if (ohashi) serviceTemplates.push(ohashi);
});
limitedTimetable.forEach((entry, index) => serviceTemplates.push(makeLimitedTrain(entry, index)));

serviceTemplates.push(
  makePatternTrain({ key: "miyano-local-down", label: "普通", kind: "miyano", direction: "down", stops: mainIds(1, 16), interval: 30 * 60, offset: 4 * 60, destination: "江川", cars: 8, laneDown: "miyanoDown", laneUp: "miyanoUp", terminalLayover: turnbackSeconds }),
  makePatternTrain({ key: "miyano-local-up", label: "普通", kind: "miyano", direction: "up", stops: mainIds(16, 1), interval: 30 * 60, offset: 11 * 60, destination: "赤島原", cars: 8, laneDown: "miyanoDown", laneUp: "miyanoUp", terminalLayover: turnbackSeconds }),
  makePatternTrain({ key: "miyano-itanuma-up", label: "普通", kind: "miyano", direction: "up", stops: mainIds(16, 8), interval: 30 * 60, offset: 26 * 60, destination: "板沼", cars: 8, laneDown: "miyanoDown", laneUp: "miyanoUp", terminalLayover: 9 * 60 }),
  makePatternTrain({ key: "miyano-itanuma-down", label: "普通", kind: "miyano", direction: "down", stops: mainIds(8, 16), interval: 30 * 60, offset: 7 * 60, destination: "江川", cars: 8, laneDown: "miyanoDown", laneUp: "miyanoUp", terminalLayover: turnbackSeconds }),
  makePatternTrain({ key: "local-down-motoyama", label: "各停", kind: "local", direction: "down", stops: localStops(16, 38), interval: 40 * 60, offset: 1 * 60, destination: "武蔵多摩浜", cars: 11, laneDown: "localDown", laneUp: "localUp", terminalLayover: turnbackSeconds, throughOrigin: "元山線から直通" }),
  makePatternTrain({ key: "local-down-egawa", label: "各停", kind: "local", direction: "down", stops: localStops(16, 38), interval: 40 * 60, offset: 21 * 60, destination: "武蔵多摩浜", cars: 11, laneDown: "localDown", laneUp: "localUp", terminalLayover: turnbackSeconds }),
  makePatternTrain({ key: "local-up-egawa", label: "各停", kind: "local", direction: "up", stops: localStops(38, 16), interval: 20 * 60, offset: 6 * 60, destination: "江川", cars: 11, laneDown: "localDown", laneUp: "localUp", terminalLayover: turnbackSeconds }),
  makePatternTrain({ key: "local-obuki-down-honmachi", label: "各停", kind: "local", direction: "down", stops: localStops(16, 29), interval: 40 * 60, offset: 11 * 60, destination: "大吹", cars: 11, laneDown: "localDown", laneUp: "localUp", terminalLayover: turnbackSeconds, throughOrigin: "本町から直通" }),
  makePatternTrain({ key: "local-obuki-down-egawa", label: "各停", kind: "local", direction: "down", stops: localStops(16, 29), interval: 40 * 60, offset: 31 * 60, destination: "大吹", cars: 11, laneDown: "localDown", laneUp: "localUp", terminalLayover: turnbackSeconds }),
  makePatternTrain({ key: "local-obuki-up-honmachi", label: "各停", kind: "local", direction: "up", stops: localStops(29, 16), interval: 40 * 60, offset: 16 * 60, destination: "本町", cars: 11, laneDown: "localDown", laneUp: "localUp", terminalLayover: turnbackSeconds }),
  makePatternTrain({ key: "local-obuki-up-motoyama", label: "各停", kind: "local", direction: "up", stops: localStops(29, 16), interval: 40 * 60, offset: 36 * 60, destination: "元山", cars: 11, laneDown: "localDown", laneUp: "localUp", terminalLayover: turnbackSeconds }),
);

function generateTrains(now) {
  const seconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const list = [];
  serviceTemplates.forEach((template) => {
    const interval = template.interval || 60 * 60;
    const duration = journeySeconds(template);
    const base = template.offset || 0;
    const first = Math.floor((seconds - base) / interval) * interval + base;
    const span = Math.max(2, Math.ceil(duration / interval) + 1);
    for (let n = -span; n <= 2; n += 1) {
      const departure = first + n * interval;
      const elapsed = seconds - departure;
      if (elapsed >= 0 && elapsed <= duration) {
        list.push({ ...template, id: `${template.key}-${departure}`, departure, platformSeed: departure, elapsed });
      }
    }
  });
  return list.sort((a, b) => a.departure - b.departure);
}

function trainProgress(train) {
  let elapsed = train.elapsed;
  for (let i = 0; i < train.stops.length; i += 1) {
    const dwell = stopDwell(train, train.stops[i], i);
    if (elapsed < dwell) return { from: train.stops[i], to: train.stops[i], ratio: 0, stopIndex: i, dwelling: true, dwellSeconds: dwell, dwellElapsed: elapsed };
    elapsed -= dwell;
    if (i === train.stops.length - 1) return { from: train.stops[i], to: train.stops[i], ratio: 0, stopIndex: i, dwelling: true, dwellSeconds: dwell, dwellElapsed: dwell };
    const travel = travelSecondsBetween(train.stops[i], train.stops[i + 1], train);
    if (elapsed < travel) return { from: train.stops[i], to: train.stops[i + 1], ratio: elapsed / travel, stopIndex: i, dwelling: false, dwellSeconds: 0 };
    elapsed -= travel;
  }
  return { from: train.stops.at(-1), to: train.stops.at(-1), ratio: 0, stopIndex: train.stops.length - 1, dwelling: true, dwellSeconds };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function makePoint(a, b, t) {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

function routeIdsBetween(from, to) {
  if (!Number.isInteger(from) || !Number.isInteger(to)) return [from, to];
  const step = from < to ? 1 : -1;
  const ids = [];
  for (let id = from; id !== to && ids.length < 60; id += step) ids.push(id);
  ids.push(to);
  return ids;
}

function lineFollowingPoint(fromId, toId, lane, train, pointMap, ratio) {
  if (!Number.isInteger(fromId) || !Number.isInteger(toId) || fromId === toId) {
    return makePoint(trainLanePoint(fromId, lane, train, pointMap, false), trainLanePoint(toId, lane, train, pointMap, false), ratio);
  }
  const ids = routeIdsBetween(fromId, toId);
  const rawTotal = ids.slice(0, -1).reduce((sum, id, index) => sum + adjacentTravelSeconds(id, ids[index + 1]), 0);
  let remaining = rawTotal * ratio;
  for (let i = 0; i < ids.length - 1; i += 1) {
    const segmentTime = adjacentTravelSeconds(ids[i], ids[i + 1]);
    if (remaining <= segmentTime || i === ids.length - 2) {
      const segmentRatio = segmentTime ? Math.max(0, Math.min(1, remaining / segmentTime)) : 0;
      const a = trainLanePoint(ids[i], lane, train, pointMap, false);
      const b = trainLanePoint(ids[i + 1], lane, train, pointMap, false);
      return makePoint(a, b, segmentRatio);
    }
    remaining -= segmentTime;
  }
  return trainLanePoint(toId, lane, train, pointMap, false);
}

function effectiveLane(train, progress) {
  const minId = Math.min(...[progress.from, progress.to].filter((id) => typeof id === "number"));
  const maxId = Math.max(...[progress.from, progress.to].filter((id) => typeof id === "number"));
  const direction = routeDirection(train);
  if (minId === maxId && terminalOrOrigin(train, minId)) {
    const platform = String(platformFor(train, minId));
    if (minId === 8) {
      if (platform === "4") return "miyanoDown";
      if (platform === "1") return "miyanoUp";
      return "miyanoTurnback";
    }
    if (minId === 15) return ["2", "3", "4"].includes(platform) ? "miyanoDown" : "miyanoUp";
    if (minId === 16 && train.kind === "local") return platform === "7" ? "localDown" : "localUp";
    if (minId === 29 && train.kind === "local") return platform === "7" ? "localTurnbackUp" : platform === "5" ? "localDown" : "localUp";
    if (minId === 36 && train.kind !== "local") return platform === "2" ? "rapidDownB" : "rapidUpA";
    if (minId === 38 && train.kind === "local") return platform === "3" ? "localDown" : "localUp";
    if (minId === 42 && train.kind !== "limited") return platform === "5" ? "rapidDownB" : "mainDown";
  }
  if (minId === 16 && maxId === 16 && train.kind === "limited") return String(platformFor(train, 16)) === "10" ? "expressUp" : "expressDown";
  if (minId === 22 && maxId === 22 && train.label === "快速急行") {
    const platform = String(platformFor(train, 22));
    if (platform === "1") return "rapidDownA";
    if (platform === "2") return "rapidDownB";
    if (platform === "3") return "rapidUpA";
    if (platform === "4") return "rapidUpB";
  }
  if (minId === 42 && maxId === 42 && train.kind === "limited") return String(platformFor(train, 42)) === "10" ? "expressUp" : "expressDown";
  if (minId === 16 && maxId === 16 && train.kind === "local") return direction === "down" ? "localDown" : "localUp";
  if (minId === 16 && maxId === 16 && (train.kind === "rapid" || train.kind === "airport")) {
    const platform = String(train.platformAtEgawa || "");
    if (platform === "1") return "rapidDownA";
    if (platform === "2") return "rapidDownB";
    if (platform === "3") return "rapidUpA";
    if (platform === "4") return "rapidUpB";
    if (platform === "5") return "miyanoDown";
    if (platform === "6") return "miyanoUp";
  }
  if (train.kind === "local" && minId >= 16 && maxId <= 38) return direction === "down" ? "localDown" : "localUp";
  if (minId === 36 && maxId === 36) return direction === "down" ? train.laneDown : train.laneUp;
  if (minId >= 36 && maxId <= 38) return direction === "down" ? "mainDown" : "mainUp";
  if (maxId <= 16) return direction === "down" ? "miyanoDown" : "miyanoUp";
  if (train.label === "快速急行" && minId >= 22 && maxId <= 36) return direction === "down" ? "expressDown" : "expressUp";
  if (train.kind === "limited" && train.destination === "戸羽空港" && minId >= 16 && maxId <= 22) return direction === "down" ? "expressDown" : "expressUp";
  if (train.kind === "limited" && minId >= 36) return direction === "down" ? "rapidDownA" : "rapidUpA";
  if (minId >= 38) return direction === "down" ? "mainDown" : "mainUp";
  return direction === "down" ? train.laneDown : train.laneUp;
}

function laneOffset(lane, zoomed) {
  const overview = { miyanoDown: 24, miyanoUp: -24, miyanoTurnback: 0, rapidDownA: 24, rapidDownB: 44, rapidUpA: -24, rapidUpB: -44, mainDown: 24, mainUp: -24, localDown: 64, localUp: -64, localTurnbackUp: -84, expressDown: 84, expressUp: -84 };
  const zoom = { expressUp: -600, expressDown: -480, localTurnbackUp: -240, localUp: -180, localDown: -60, rapidUpB: 60, rapidUpA: 180, rapidDownB: 300, rapidDownA: 420, mainUp: 60, mainDown: 420, miyanoTurnback: 0, miyanoUp: -120, miyanoDown: 120 };
  return (zoomed ? zoom : overview)[lane] || 0;
}

function isMiraijimaDestination(destination) {
  return [0, 7, 10, 14, 20, 25].some((index) => egawaRapidEastTimetable[index]?.dest === destination);
}

function isSanbuDestination(destination) {
  return [2, 8, 16, 22, 26].some((index) => egawaRapidEastTimetable[index]?.dest === destination);
}

function stableTrainHash(train) {
  return String(train.key || train.id || "").split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function alternatePlatform(train, a, b, minutes = 10) {
  const base = Number.isFinite(train.platformSeed) ? train.platformSeed : Number.isFinite(train.departure) ? train.departure : train.offset || 0;
  return (Math.floor(Math.abs(base) / (minutes * 60)) + stableTrainHash(train)) % 2 === 0 ? a : b;
}

function terminalOrOrigin(train, stationId) {
  return train.stops[0] === stationId || train.stops.at(-1) === stationId;
}

function routeDirection(train) {
  const numericStops = train.stops.filter((stop) => typeof stop === "number");
  if (numericStops.length >= 2 && numericStops[0] !== numericStops.at(-1)) {
    return numericStops.at(-1) > numericStops[0] ? "down" : "up";
  }
  return train.direction;
}

function platformFor(train, stationId) {
  if (train.turnbackPlatformStation === stationId && train.turnbackPlatform) return train.turnbackPlatform;
  const down = routeDirection(train) === "down";
  if (stationId === 16 && train.platformAtEgawa) return train.platformAtEgawa;
  if (stationId === 1) return down ? "1" : "2";
  if (stationId === 8) {
    if (terminalOrOrigin(train, 8)) return alternatePlatform(train, "2", "3", 15);
    if (train.kind === "miyano") return down ? "4" : "1";
    return down ? "3" : "4";
  }
  if (stationId === 15) {
    if (train.platformAtOhashi) return train.platformAtOhashi;
    if (train.kind !== "miyano") return down ? "4" : "1";
    return terminalOrOrigin(train, 15) ? "2" : down ? "3" : "1";
  }
  if (stationId === 16 && train.kind === "local") return terminalOrOrigin(train, 16) ? alternatePlatform(train, "7", "8", 10) : down ? "7" : "8";
  if (stationId === 16 && train.kind === "miyano") return down ? "5" : "6";
  if ((train.kind === "rapid" || train.kind === "airport") && stationId >= 16 && stationId < 36 && ["1", "2", "3", "4"].includes(String(train.platformAtEgawa))) {
    if (!(stationId === 22 && train.kind === "airport")) return train.platformAtEgawa;
  }
  if (stationId === 22) {
    if (train.kind === "airport") return down ? "9" : "12";
    if (train.kind === "local") return down ? "5" : "7";
    return down ? "1" : "3";
  }
  if (stationId === 29) return train.kind === "local" ? (terminalOrOrigin(train, 29) ? alternatePlatform(train, "6", "7", 10) : down ? "5" : "6") : down ? "1" : "3";
  if (stationId === 36) {
    if (train.kind === "local") return down ? "5" : "6";
    if (terminalOrOrigin(train, 36)) return alternatePlatform(train, "2", "3", 10);
    if (["1", "2", "3", "4"].includes(String(train.platformAtEgawa))) return train.platformAtEgawa;
    return down ? "1" : "4";
  }
  if (stationId === 38) return train.kind === "local" ? alternatePlatform(train, "3", "4") : down ? "1" : "2";
  if (stationId === 40 || stationId === 41) return down ? "4" : "1";
  if (stationId === 42) {
    if (train.kind === "limited") return down ? (train.platformAtEgawa === "10" ? "10" : "9") : "10";
    if (down && isMiraijimaDestination(train.destination)) return "2";
    if (down && isSanbuDestination(train.destination)) return "3";
    if (down) return alternatePlatform(train, "5", "6");
    return "8";
  }
  return "";
}

function currentCars(train, progress) {
  const ids = [progress.from, progress.to].filter((id) => typeof id === "number");
  const minId = ids.length ? Math.min(...ids) : 99;
  if (train.cars === 15 && minId <= 8) return "11両";
  return `${train.cars}両`;
}

function isDepotAfterArrival(train, progress) {
  return progress.dwelling && progress.stopIndex === train.stops.length - 1 && train.stops.at(-1) === 16 && train.destination === "江川" && train.kind !== "miyano" && train.key.includes("up");
}

function terminalTurnbackDestination(train) {
  return train.nextDestination || stationById(train.stops[0])?.name || train.destination;
}

function terminalTurnbackStops(train) {
  return train.nextStops?.length ? train.nextStops : reverseStops(train.stops);
}

function continuesBeyondShownArea(train) {
  const lastStop = train.stops.at(-1);
  return routeDirection(train) === "down" && lastStop === 42 && (isMiraijimaDestination(train.destination) || isSanbuDestination(train.destination));
}

function isTerminalTurnback(train, progress) {
  return progress.dwelling && progress.stopIndex === train.stops.length - 1 && !isDepotAfterArrival(train, progress) && !continuesBeyondShownArea(train);
}

function currentDaySeconds() {
  const now = new Date();
  return now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
}

function trainForPassengerDisplay(train, progress) {
  if (!isTerminalTurnback(train, progress)) return train;
  const firstStop = progress.from;
  return {
    ...train,
    turnbackPlatformStation: firstStop,
    turnbackPlatform: platformFor(train, firstStop),
    direction: routeDirection(train) === "down" ? "up" : "down",
    destination: terminalTurnbackDestination(train),
    stops: terminalTurnbackStops(train),
    departure: currentDaySeconds() - (progress.dwellElapsed || 0),
    elapsed: progress.dwellElapsed || 0,
    fixedDwell: {
      ...(train.fixedDwell || {}),
      [firstStop]: train.terminalLayover || dwellSeconds,
    },
  };
}

function displayTrain(train, progress) {
  if (isDepotAfterArrival(train, progress)) return { label: "回送", destination: "当駅止まり", isDepot: true };
  if (isTerminalTurnback(train, progress)) return { label: train.label, destination: terminalTurnbackDestination(train) };
  return { label: train.label, destination: train.destination };
}

function displayDirection(train, progress) {
  if (isTerminalTurnback(train, progress)) return routeDirection(train) === "down" ? "up" : "down";
  if (!progress.dwelling && typeof progress.from === "number" && typeof progress.to === "number" && progress.from !== progress.to) {
    return progress.to > progress.from ? "down" : "up";
  }
  if (!progress.dwelling && typeof progress.from === "string" && typeof progress.to === "string" && progress.from !== progress.to) {
    return progress.to > progress.from ? "down" : "up";
  }
  return routeDirection(train);
}

function displayStatus(train, progress) {
  if (isDepotAfterArrival(train, progress)) return "当駅止まり・回送";
  if (progress.platformConflict) return "入線待ち";
  return progress.dwelling ? "停車中" : "走行中";
}

function visibleStops(train) {
  return train.passThrough?.length ? train.stops.filter((stop) => !train.passThrough.includes(stop)) : train.stops;
}

function serviceTime(seconds) {
  const minutes = ((Math.floor(seconds / 60) % (24 * 60)) + (24 * 60)) % (24 * 60);
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

function numericStationBetween(from, to, stationId) {
  if (typeof from !== "number" || typeof to !== "number" || typeof stationId !== "number") return false;
  return stationId > Math.min(from, to) && stationId < Math.max(from, to);
}

function runtimeAtStationPassage(train, stationId) {
  let elapsed = 0;
  for (let i = 0; i < train.stops.length; i += 1) {
    const stop = train.stops[i];
    if (stop === stationId) return elapsed;
    const dwell = stopDwell(train, stop, i);
    if (i >= train.stops.length - 1) return null;
    const next = train.stops[i + 1];
    const travel = travelSecondsBetween(stop, next, train);
    if (numericStationBetween(stop, next, stationId)) {
      const route = routeIdsBetween(stop, next);
      const totalRaw = route.slice(0, -1).reduce((sum, id, index) => sum + adjacentTravelSeconds(id, route[index + 1]), 0);
      const stationIndex = route.indexOf(stationId);
      const beforeRaw = route.slice(0, stationIndex).reduce((sum, id, index) => sum + adjacentTravelSeconds(id, route[index + 1]), 0);
      return elapsed + dwell + travel * (totalRaw ? beforeRaw / totalRaw : 0);
    }
    elapsed += dwell + travel;
  }
  return null;
}

function trainRunsAcrossStation(train, stationId) {
  if (train.stops.includes(stationId)) return true;
  return train.stops.some((stop, index) => numericStationBetween(stop, train.stops[index + 1], stationId));
}

function overtakeNoteForStop(train, stop, arrivalSeconds, departureSeconds) {
  if (train.kind !== "miyano" || !miyanoOvertakeStations.has(stop)) return "";
  const stopIndex = train.stops.indexOf(stop);
  if (stopIndex <= 0 || stopIndex >= train.stops.length - 1) return "";
  const match = trains
    .filter((candidate) => candidate.id !== train.id && ["rapid", "airport", "limited"].includes(candidate.kind) && routeDirection(candidate) === routeDirection(train) && trainRunsAcrossStation(candidate, stop))
    .map((candidate) => {
      const runtime = runtimeAtStationPassage(candidate, stop);
      return { train: candidate, time: runtime == null ? NaN : candidate.departure + runtime };
    })
    .filter((item) => Number.isFinite(item.time) && item.time >= arrivalSeconds && item.time <= departureSeconds - 60)
    .sort((a, b) => a.time - b.time)[0];
  if (!match) return "";
  const stopsHere = match.train.stops.includes(stop) && !match.train.passThrough?.includes(stop);
  const display = displayTrain(match.train, trainProgress(match.train));
  const action = stopsHere ? "が先発" : "を待避";
  return `${serviceTime(match.time)}ごろ、この駅で${display.label} ${display.destination}行${action}します。発車は通過・先発後に間隔をあけます。`;
}

function arrivalRows(train) {
  const stops = visibleStops(train);
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const rows = [];
  let elapsed = 0;
  const progress = trainProgress(train);
  stops.forEach((stop, index) => {
    const fullIndex = train.stops.indexOf(stop);
    const dwell = stopDwell(train, stop, fullIndex);
    const arrival = new Date(midnight.getTime() + (train.departure + elapsed) * 1000);
    const departure = new Date(midnight.getTime() + (train.departure + elapsed + dwell) * 1000);
    const terminal = fullIndex === train.stops.length - 1;
    rows.push({
      id: stop,
      name: stationById(stop).name,
      time: formatTime(arrival),
      departTime: terminal ? "" : formatTime(departure),
      platform: platformFor(train, stop),
      note: overtakeNoteForStop(train, stop, train.departure + elapsed, train.departure + elapsed + dwell),
      departed: fullIndex < progress.stopIndex || (!progress.dwelling && fullIndex <= progress.stopIndex),
    });
    if (index < stops.length - 1) {
      elapsed += dwell + travelSecondsBetween(stop, stops[index + 1], train);
    }
  });
  return rows;
}

function renderOverviewBase() {
  overviewMap.innerHTML = "";
  const rect = overviewMap.getBoundingClientRect();
  const w = rect.width || 1200;
  const h = Math.max(rect.height, 2800);
  overviewMap.style.height = `${h}px`;
  const leftX = Math.max(110, w * 0.28);
  const rightX = Math.min(w - 130, w * 0.72);
  const topY = 92;
  const bottomY = h - 110;
  mapPoints = new Map();
  stations.forEach((station) => {
    const onLeft = station.id <= 21;
    const t = onLeft ? (station.id - 1) / 20 : (station.id - 22) / 20;
    mapPoints.set(station.id, { x: onLeft ? leftX : rightX, y: onLeft ? lerp(topY, bottomY, t) : lerp(bottomY, topY, t) });
  });
  const funato = mapPoints.get(22);
  mapPoints.set("TA0", { x: funato.x, y: funato.y });
  mapPoints.set("TA1", { x: funato.x + 100, y: funato.y + 34 });
  mapPoints.set("TA2", { x: funato.x + 188, y: funato.y + 82 });
  mapPoints.set("TA3", { x: funato.x + 280, y: funato.y + 126 });
  drawOffsetCenterLine(overviewMap, mapPoints, mainIds(16, 38), "emerald", 8, 16);
  drawCenterLine(overviewMap, mapPoints, mainIds(1, 42), "magenta", 8);
  drawSegment(overviewMap, mapPoints.get(22), mapPoints.get("TA1"), "airport", 7);
  drawSegment(overviewMap, mapPoints.get("TA1"), mapPoints.get("TA2"), "airport", 7);
  drawSegment(overviewMap, mapPoints.get("TA2"), mapPoints.get("TA3"), "airport", 7);
  [...stations, ...branchStations.filter((station) => station.id !== "TA0")].forEach((station) => {
    const point = mapPoints.get(station.id);
    const node = document.createElement("div");
    node.className = `station ${station.major ? "major" : ""}`;
    node.style.left = `${point.x}px`;
    node.style.top = `${point.y}px`;
    const side = typeof station.id === "number" && station.id <= 21 ? "right" : "left";
    const code = typeof station.id === "number" ? `SM ${pad(station.id)}` : station.code;
    node.innerHTML = `<div class="station-dot"></div><div class="station-label" style="${side}:18px;top:-14px">${station.name}<br><span class="station-code">${code}</span></div>`;
    overviewMap.appendChild(node);
  });
}

function renderZoomBase() {
  zoomMap.innerHTML = "";
  const width = Math.max(1700, railPanel.clientWidth || 1200);
  zoomMap.style.width = `${width}px`;
  const center = Math.max(520, Math.min(width * 0.5, (railPanel.clientWidth || 1200) * 0.86));
  const rowHeight = 176;
  const wideRowHeight = 244;
  const top = 70;
  let y = top;
  zoomPoints = new Map();
  stations.forEach((station, index) => {
    zoomPoints.set(station.id, { x: center, y });
    const gap = station.id >= 36 ? wideRowHeight : rowHeight;
    if (index < stations.length - 1) {
      const between = document.createElement("div");
      between.className = `zoom-between-band ${index % 2 ? "alt" : ""}`;
      between.style.top = `${y + 42}px`;
      between.style.height = `${gap - 84}px`;
      zoomMap.appendChild(between);
    }
    const row = document.createElement("div");
    row.className = `zoom-row zoom-station-band ${index % 2 ? "alt" : ""}`;
    row.style.top = `${y - 42}px`;
    row.style.height = "84px";
    row.innerHTML = `<div class="zoom-station-name">${station.name}</div><div class="zoom-code-set"><span class="zoom-code">SM<br>${pad(station.id)}</span>${station.id >= 16 ? `<span class="zoom-code local">SL<br>${pad(station.id)}</span>` : ""}</div>`;
    zoomMap.appendChild(row);
    y += gap;
  });
  const airportTop = y + 80;
  zoomMap.style.minHeight = `${airportTop + 430}px`;
  zoomPoints.set("TA0", { x: center, y: airportTop + 70 });
  zoomPoints.set("TA1", { x: center, y: airportTop + 160 });
  zoomPoints.set("TA2", { x: center, y: airportTop + 250 });
  zoomPoints.set("TA3", { x: center, y: airportTop + 340 });
  drawOffsetCenterLine(zoomMap, zoomPoints, mainIds(16, 38), "emerald faint", 8, 18, "zoom-line");
  drawCenterLine(zoomMap, zoomPoints, mainIds(1, 42), "magenta faint", 8, "zoom-line");
  drawSegment(zoomMap, zoomPoints.get("TA0"), zoomPoints.get("TA1"), "airport", 10, "zoom-line");
  drawSegment(zoomMap, zoomPoints.get("TA1"), zoomPoints.get("TA2"), "airport", 10, "zoom-line");
  drawSegment(zoomMap, zoomPoints.get("TA2"), zoomPoints.get("TA3"), "airport", 10, "zoom-line");
  renderPlatformsAligned(zoomMap, zoomPoints);
  [...stations, ...branchStations].forEach((station) => {
    const point = zoomPoints.get(station.id);
    const dot = document.createElement("div");
    dot.className = `station ${station.major ? "major" : ""}`;
    dot.style.left = `${point.x}px`;
    dot.style.top = `${point.y}px`;
    dot.innerHTML = "<div class=\"station-dot\"></div>";
    zoomMap.appendChild(dot);
  });
  const airportBox = document.createElement("div");
  airportBox.className = "airport-box";
  airportBox.style.top = `${airportTop}px`;
  airportBox.innerHTML = "<strong>戸羽空港線</strong><span>船戸から分岐する直通列車を別枠で表示</span>";
  zoomMap.appendChild(airportBox);
}

function drawSegment(container, a, b, className, width, extraClass = "segment") {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  const seg = document.createElement("div");
  seg.className = `${extraClass} ${className}`;
  seg.style.left = `${a.x}px`;
  seg.style.top = `${a.y - width / 2}px`;
  seg.style.width = `${length}px`;
  seg.style.height = `${width}px`;
  seg.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
  container.appendChild(seg);
}

function offsetPoint(point, dx) {
  return { x: point.x + dx, y: point.y };
}

function drawCenterLine(container, pointMap, ids, className, width, extraClass = "segment") {
  ids.slice(0, -1).forEach((id, index) => drawSegment(container, pointMap.get(id), pointMap.get(ids[index + 1]), className, width, extraClass));
}

function drawOffsetCenterLine(container, pointMap, ids, className, width, dx, extraClass = "segment") {
  ids.slice(0, -1).forEach((id, index) => drawSegment(container, offsetPoint(pointMap.get(id), dx), offsetPoint(pointMap.get(ids[index + 1]), dx), className, width, extraClass));
}

function platformBoxLayout(stationId, point) {
  const platformMap = {
    1: ["2", "1"],
    8: ["1", "2", "3", "4"],
    15: ["1", "2", "3", "4"],
    16: ["10", "9", "8", "7", "6", "5", "4", "3", "2", "1"],
    22: ["12", "11", "10", "9", "8", "7", "6", "5", "4", "3", "2", "1"],
    29: ["7", "6", "5", "4", "3", "2", "1"],
    36: ["6", "5", "4", "3", "2", "1"],
    38: ["4", "3", "2", "1"],
    40: ["1", "2", "3", "4"],
    41: ["1", "2", "3", "4"],
    42: ["10", "9", "8", "7", "6", "5", "4", "3", "2", "1"],
  };
  const centerMap = {
    1: { 2: -120, 1: 120 },
    8: { 1: -120, 2: 0, 3: 120, 4: 240 },
    15: { 1: -240, 2: -80, 3: 80, 4: 240 },
    16: { 10: -540, 9: -420, 8: -300, 7: -180, 5: -60, 6: 60, 4: 180, 3: 300, 2: 420, 1: 540 },
    22: { 12: 180, 11: 60, 10: 300, 9: 420, 8: -180, 7: -180, 6: -60, 5: -60, 4: 60, 3: 180, 2: 300, 1: 420 },
    29: { 7: -240, 6: -180, 5: -60, 4: 60, 3: 180, 2: 300, 1: 420 },
    36: { 6: -180, 5: -60, 4: 60, 3: 180, 2: 300, 1: 420 },
    38: { 4: -180, 3: -60, 2: 60, 1: 420 },
    40: { 1: 60, 2: 180, 3: 300, 4: 420 },
    41: { 1: 60, 2: 180, 3: 300, 4: 420 },
    42: { 10: -540, 9: -420, 8: -300, 7: -180, 6: -60, 5: 60, 4: 180, 3: 300, 2: 420, 1: 540 },
  };
  const platforms = platformMap[stationId] || [];
  const centers = centerMap[stationId] || {};
  const cellWidth = 108;
  const min = Math.min(...platforms.map((platform) => centers[platform] ?? 0));
  const max = Math.max(...platforms.map((platform) => centers[platform] ?? 0));
  const cells = platforms.map((platform) => ({ platform, left: (centers[platform] ?? 0) - min }));
  return { platforms, cells, cellWidth, width: max - min + cellWidth, height: 96, left: point.x + min - cellWidth / 2, top: point.y - 48 };
}

function renderPlatformsAligned(container, pointMap) {
  platformStations.forEach((stationId) => {
    const point = pointMap.get(stationId);
    const layout = platformBoxLayout(stationId, point);
    const box = document.createElement("div");
    box.className = "platform-box";
    box.style.left = `${layout.left}px`;
    box.style.top = `${layout.top}px`;
    box.style.width = `${layout.width}px`;
    box.style.height = `${layout.height}px`;
    box.innerHTML = `<div class="platform-title">${stationById(stationId).name}</div><div class="platform-groups"><span>特急</span><span>各停</span><span>快速</span></div><div class="platform-cells">${layout.cells.map((cell) => `<span style="left:${cell.left}px;width:${layout.cellWidth}px">${cell.platform}番線</span>`).join("")}</div>`;
    container.appendChild(box);
  });
}

function lanePoint(id, lane, pointMap, zoomed) {
  const point = pointMap.get(id);
  if (!point) return undefined;
  if (typeof id === "string") return point;
  return { x: point.x + laneOffset(lane, zoomed), y: point.y };
}

function trainLanePoint(id, lane, train, pointMap, zoomed) {
  const point = lanePoint(id, lane, pointMap, zoomed);
  if (!point || typeof id !== "string" || train.kind !== "airport") return point;
  return { x: point.x + (routeDirection(train) === "down" ? 46 : -46), y: point.y };
}

function platformPoint(id, train, pointMap, zoomed) {
  if (!zoomed || typeof id !== "number" || !platformStations.has(id)) return undefined;
  const platform = platformFor(train, id);
  if (!platform) return undefined;
  const layout = platformBoxLayout(id, pointMap.get(id));
  const cell = layout.cells.find((item) => item.platform === String(platform));
  if (!cell) return undefined;
  const platformX = layout.left + cell.left + layout.cellWidth / 2;
  return { x: id === 15 || id === 16 || id === 42 ? platformX : undefined, y: layout.top + layout.height - 30 };
}

function dwellingPoint(id, lane, train, pointMap, zoomed) {
  const lanePointAtStation = trainLanePoint(id, lane, train, pointMap, zoomed);
  const platform = platformPoint(id, train, pointMap, zoomed);
  if (!platform) return lanePointAtStation;
  if (Number.isFinite(platform.x)) return platform;
  return { x: lanePointAtStation.x, y: platform.y };
}

function movingBandPoint(from, to, ratio) {
  return makePoint(from, to, 0.22 + ratio * 0.56);
}

function shiftIntoInterstationBand(point, progress) {
  if (progress.dwelling || typeof progress.from !== "number" || typeof progress.to !== "number") return point;
  return { x: point.x, y: point.y + (progress.to > progress.from ? 28 : -28) };
}

function platformOccupancyKey(train, progress) {
  if (!progress.dwelling || typeof progress.from !== "number" || !platformStations.has(progress.from)) return "";
  const platform = platformFor(train, progress.from);
  return platform ? `${progress.from}:${platform}` : "";
}

function holdBeforePlatformPoint(train, p, pointMap, zoomed, conflictIndex) {
  const stationId = p.progress.from;
  const stationPoint = pointMap.get(stationId);
  const direction = displayDirection(train, p.progress);
  const sign = direction === "down" ? -1 : 1;
  const stagger = Math.min(conflictIndex - 1, 3) * (zoomed ? 38 : 16);
  const lane = p.lane || effectiveLane(train, p.progress);
  if (zoomed && stationPoint) {
    return {
      ...p,
      x: stationPoint.x + laneOffset(lane, true),
      y: stationPoint.y + sign * (88 + stagger),
      progress: { ...p.progress, dwelling: false, platformConflict: true },
    };
  }
  const approachId = direction === "down" ? stationId - 1 : stationId + 1;
  if (pointMap.has(approachId)) {
    const from = trainLanePoint(approachId, lane, train, pointMap, false);
    const to = trainLanePoint(stationId, lane, train, pointMap, false);
    const point = lineFollowingPoint(approachId, stationId, lane, train, pointMap, 0.78 - Math.min(conflictIndex - 1, 3) * 0.08);
    return { ...p, x: point.x, y: point.y, progress: { ...p.progress, dwelling: false, platformConflict: true } };
  }
  return { ...p, y: p.y + sign * (70 + stagger), progress: { ...p.progress, dwelling: false, platformConflict: true } };
}

function trainPoint(train, pointMap, zoomed) {
  const progress = trainProgress(train);
  if (train.kind === "limited" && train.destination === "戸羽空港") {
    return limitedAirportPoint(train, progress, pointMap, zoomed);
  }
  if (train.kind === "airport" && progress.from === 22 && progress.to === "TA1" && progress.ratio > 0) progress.from = "TA0";
  if (train.kind === "airport" && progress.from === "TA1" && progress.to === 22 && progress.ratio > 0) progress.to = "TA0";
  const positionTrain = isTerminalTurnback(train, progress) ? trainForPassengerDisplay(train, progress) : train;
  const lane = effectiveLane(positionTrain, progress);
  const stopped = progress.dwelling ? dwellingPoint(progress.from, lane, positionTrain, pointMap, zoomed) : undefined;
  if (stopped) return { ...stopped, progress, lane };
  const from = trainLanePoint(progress.from, lane, positionTrain, pointMap, zoomed);
  const to = trainLanePoint(progress.to, lane, positionTrain, pointMap, zoomed);
  const point = zoomed && !progress.dwelling
    ? movingBandPoint(from, to, progress.ratio)
    : lineFollowingPoint(progress.from, progress.to, lane, positionTrain, pointMap, progress.ratio);
  const shifted = zoomed ? shiftIntoInterstationBand(point, progress) : point;
  return { x: shifted.x, y: shifted.y, progress, lane };
}

function limitedAirportPoint(train, progress, pointMap, zoomed) {
  const airportStops = [16, 22, "TA1", "TA2", "TA3"];
  let elapsed = train.elapsed;
  let from = airportStops[0];
  let to = airportStops[0];
  let ratio = 0;
  let dwelling = true;
  for (let i = 0; i < airportStops.length; i += 1) {
    const dwell = i === 0 ? 45 : 0;
    if (elapsed < dwell) {
      from = airportStops[i];
      to = airportStops[i];
      dwelling = true;
      ratio = 0;
      break;
    }
    elapsed -= dwell;
    if (i === airportStops.length - 1) {
      from = airportStops[i];
      to = airportStops[i];
      dwelling = true;
      ratio = 0;
      break;
    }
    const travel = travelSecondsBetween(airportStops[i], airportStops[i + 1], train);
    if (elapsed < travel) {
      from = airportStops[i];
      to = airportStops[i + 1];
      dwelling = false;
      ratio = elapsed / travel;
      break;
    }
    elapsed -= travel;
  }
  const lane = from === 16 || to === 22 ? "expressDown" : "airportDown";
  const mappedFrom = from === 22 && to === "TA1" ? "TA0" : from;
  const mappedTo = to === 22 && from === "TA1" ? "TA0" : to;
  const fromPoint = trainLanePoint(mappedFrom, lane, train, pointMap, zoomed);
  const toPoint = trainLanePoint(mappedTo, lane, train, pointMap, zoomed);
  const point = dwelling ? fromPoint : (zoomed ? makePoint(fromPoint, toPoint, ratio) : lineFollowingPoint(mappedFrom, mappedTo, lane, train, pointMap, ratio));
  return { x: point.x, y: point.y, progress: { ...progress, from, to, ratio, dwelling }, lane };
}

function renderTrains(container, pointMap, zoomed) {
  container.querySelectorAll(".train").forEach((node) => node.remove());
  const fragment = document.createDocumentFragment();
  const occupied = new Map();
  const platformOccupied = new Map();
  trains.forEach((train) => {
    let p = trainPoint(train, pointMap, zoomed);
    const platformKey = platformOccupancyKey(train, p.progress);
    if (platformKey) {
      const count = platformOccupied.get(platformKey) || 0;
      platformOccupied.set(platformKey, count + 1);
      if (count > 0) p = holdBeforePlatformPoint(train, p, pointMap, zoomed, count + 1);
    }
    const visualDirection = displayDirection(train, p.progress);
    const cleanDisplay = displayTrain(train, p.progress);
    const key = `${Math.round(p.x / 8) * 8}:${Math.round(p.y / 8) * 8}`;
    const count = occupied.get(key) || 0;
    occupied.set(key, count + 1);
    const shift = overlapDisplayShift(count, zoomed);
    const btn = document.createElement("button");
    btn.className = `train ${train.color} ${visualDirection} ${p.progress.dwelling ? "dwelling" : "moving"}`;
    btn.type = "button";
    btn.style.left = `${p.x + shift.x}px`;
    btn.style.top = `${p.y + shift.y}px`;
    btn.innerHTML = `<div class="head">${cleanDisplay.label}・${cleanDisplay.destination}<br>${currentCars(train, p.progress)}</div><div class="run-state">${displayStatus(train, p.progress)}</div><div class="face"></div>`;
    btn.addEventListener("click", () => showTrain(train));
    fragment.appendChild(btn);
  });
  container.appendChild(fragment);
}

function overlapDisplayShift(index, zoomed) {
  if (!index) return { x: 0, y: 0 };
  const side = index % 2 ? 1 : -1;
  const step = Math.ceil(index / 2);
  if (zoomed) return { x: 0, y: side * step * 26 };
  return { x: side * step * 28, y: side * step * 8 };
}

function passengerNote(train) {
  return train.throughOrigin || train.note || "";
}

function nextOperationNotice(train, progress) {
  if (isDepotAfterArrival(train, progress) || continuesBeyondShownArea(train) || progress.stopIndex < train.stops.length - 2) return "";
  return `終点到着後：${train.label} ${terminalTurnbackDestination(train)}行 ${train.cars}両`;
}

function showTrain(train) {
  const progress = trainProgress(train);
  const passengerTrain = trainForPassengerDisplay(train, progress);
  const rows = arrivalRows(passengerTrain);
  const platform = progress.dwelling ? platformFor(train, progress.from) : "";
  const display = displayTrain(train, progress);
  const title = display.isDepot ? `${display.label} ${display.destination}` : `${display.label} ${display.destination}行`;
  const originText = passengerTrain.throughOrigin || `${stationById(passengerTrain.stops[0]).name}発`;
  dialogBody.innerHTML = `<h2 class="dialog-title">${title}</h2><div class="dialog-meta">${currentCars(train, progress)}・${originText}・${displayStatus(train, progress)}${platform ? `・${platform}番線` : ""}</div>${passengerNote(train) ? `<p class="dialog-note">${passengerNote(train)}</p>` : ""}${nextOperationNotice(train, progress) ? `<p class="dialog-note">${nextOperationNotice(train, progress)}</p>` : ""}<div class="stop-list">${rows.map((row) => `<div class="stop-row ${row.departed ? "departed" : ""}"><strong>${row.name}${row.platform ? ` ${row.platform}番線` : ""}</strong><span>${row.departed ? "発車済み" : `${row.time} 着${row.departTime ? ` / ${row.departTime} 発` : ""}`}</span>${row.note ? `<em>${row.note}</em>` : ""}</div>`).join("")}</div>`;
  dialog.showModal();
}

function render() {
  const now = new Date();
  document.getElementById("dateText").textContent = `${now.getMonth() + 1}月${now.getDate()}日 現在`;
  document.getElementById("timeText").textContent = formatTime(now);
  trains = generateTrains(now);
  window.__nanahamaDebug = { serviceTemplates, trains, trainProgress, stationById };
  renderTrains(overviewMap, mapPoints, false);
  renderTrains(zoomMap, zoomPoints, true);
}

function setMode(zoomed) {
  railPanel.classList.toggle("zoomed", zoomed);
  document.getElementById("zoomBtn").classList.toggle("active", zoomed);
  document.getElementById("overviewBtn").classList.toggle("active", !zoomed);
  applyZoomScale();
  renderTrains(zoomed ? zoomMap : overviewMap, zoomed ? zoomPoints : mapPoints, zoomed);
}

function applyZoomScale() {
  const mobileZoom = window.matchMedia("(max-width: 720px)").matches && railPanel.classList.contains("zoomed");
  const baseScale = mobileZoom ? Math.min(0.46, Math.max(0.2, (railPanel.clientWidth - 18) / 1700)) : 1;
  const scale = railPanel.classList.contains("zoomed") ? baseScale * userZoomScale : baseScale;
  zoomMap.style.transform = scale === 1 ? "" : `scale(${scale})`;
  zoomMap.style.transformOrigin = "top left";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function touchDistance(touches) {
  const a = touches[0];
  const b = touches[1];
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

function setupPinchZoom() {
  railPanel.addEventListener("touchstart", (event) => {
    if (!railPanel.classList.contains("zoomed") || event.touches.length !== 2) return;
    pinchStartDistance = touchDistance(event.touches);
    pinchStartScale = userZoomScale;
  }, { passive: true });

  railPanel.addEventListener("touchmove", (event) => {
    if (!railPanel.classList.contains("zoomed") || event.touches.length !== 2 || !pinchStartDistance) return;
    event.preventDefault();
    userZoomScale = clamp(pinchStartScale * (touchDistance(event.touches) / pinchStartDistance), 0.75, 3.5);
    applyZoomScale();
  }, { passive: false });

  railPanel.addEventListener("touchend", (event) => {
    if (event.touches.length < 2) pinchStartDistance = 0;
  }, { passive: true });

  railPanel.addEventListener("touchcancel", () => {
    pinchStartDistance = 0;
  }, { passive: true });

  railPanel.addEventListener("wheel", (event) => {
    if (!railPanel.classList.contains("zoomed") || !event.ctrlKey) return;
    event.preventDefault();
    userZoomScale = clamp(userZoomScale * (event.deltaY < 0 ? 1.08 : 0.92), 0.75, 3.5);
    applyZoomScale();
  }, { passive: false });
}

function showView(view) {
  const isPosition = view === "position";
  document.querySelectorAll(".tab").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  document.querySelectorAll(".position-view").forEach((node) => { node.style.display = isPosition ? "" : "none"; });
  document.querySelectorAll(".app-view").forEach((node) => node.classList.remove("active"));
  const panel = document.getElementById(`${view}View`);
  if (panel) panel.classList.add("active");
}

function init() {
  document.title = "ななはま鉄道 しょみん線 列車走行位置";
  renderOverviewBase();
  renderZoomBase();
  updateLastRefresh();
  render();
  setInterval(render, 1000);
  document.getElementById("overviewBtn").addEventListener("click", () => setMode(false));
  document.getElementById("zoomBtn").addEventListener("click", () => setMode(true));
  document.getElementById("refreshBtn").addEventListener("click", () => {
    updateLastRefresh();
    render();
  });
  document.getElementById("closeDialog").addEventListener("click", () => dialog.close());
  document.querySelectorAll(".tab").forEach((button) => button.addEventListener("click", () => showView(button.dataset.view)));
  document.querySelectorAll("[data-jump='position']").forEach((button) => button.addEventListener("click", () => showView("position")));
  setupPinchZoom();
  window.addEventListener("resize", applyZoomScale);
}

init();
