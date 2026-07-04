const stations = [
  { id: 1, name: "赤島原", rapid: true, express: true, major: true },
  { id: 2, name: "南大山", rapid: true },
  { id: 3, name: "幅栗", rapid: true },
  { id: 4, name: "坂柳", rapid: true },
  { id: 5, name: "大狩", rapid: true },
  { id: 6, name: "芝潟崎下", rapid: true },
  { id: 7, name: "穂ノ鳥", rapid: true },
  { id: 8, name: "板沼", rapid: true, express: true, major: true },
  { id: 9, name: "宮藤" },
  { id: 10, name: "鎌張本郷" },
  { id: 11, name: "鎌張" },
  { id: 12, name: "宮大野", rapid: true },
  { id: 13, name: "千木良" },
  { id: 14, name: "三井" },
  { id: 15, name: "大橋", rapid: true },
  { id: 16, name: "江川", rapid: true, express: true, major: true },
  { id: 17, name: "しょみん", rapid: true, express: true },
  { id: 18, name: "しょみん中央" },
  { id: 19, name: "しょみん村", rapid: true },
  { id: 20, name: "小豆町" },
  { id: 21, name: "木下" },
  { id: 22, name: "船戸", rapid: true, express: true, major: true },
  { id: 23, name: "棚前" },
  { id: 24, name: "岡上" },
  { id: 25, name: "南山神" },
  { id: 26, name: "山神", rapid: true, express: true },
  { id: 27, name: "北山神" },
  { id: 28, name: "花先" },
  { id: 29, name: "大吹", rapid: true, express: true },
  { id: 30, name: "呼塚", rapid: true },
  { id: 31, name: "東呼塚" },
  { id: 32, name: "日田ヶ谷" },
  { id: 33, name: "桜浜", rapid: true, express: true },
  { id: 34, name: "東白葉" },
  { id: 35, name: "南鎌原" },
  { id: 36, name: "新桜浜", rapid: true, major: true },
  { id: 37, name: "荒井" },
  { id: 38, name: "武蔵多摩浜", rapid: true, express: true, major: true },
  { id: 39, name: "州久内", rapid: true },
  { id: 40, name: "品山", rapid: true, express: true, major: true },
  { id: 41, name: "新端", rapid: true, major: true },
  { id: 42, name: "東ノ宮", rapid: true, express: true, major: true },
];

const branchStations = [
  { id: "TA0", name: "船戸", code: "TA 00", major: true },
  { id: "TA1", name: "青崎", code: "TA 01" },
  { id: "TA2", name: "縦浜新都心", code: "TA 02" },
  { id: "TA3", name: "戸羽空港", code: "TA 03", major: true },
];

const stationMap = new Map([...stations, ...branchStations].map((station) => [station.id, station]));
const platformStations = new Set([8, 16, 22, 36, 38, 40, 41, 42]);
const segmentSeconds = 180;
const dwellSeconds = 45;
const turnbackSeconds = 7 * 60;
const couplingSeconds = 4 * 60;
const airportLayoverSeconds = 15 * 60;
const overviewMap = document.getElementById("overviewMap");
const zoomMap = document.getElementById("zoomMap");
const railPanel = document.getElementById("railPanel");
const dialog = document.getElementById("trainDialog");
const dialogBody = document.getElementById("dialogBody");
let mapPoints = new Map();
let zoomPoints = new Map();
let trains = [];

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatTime(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
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

function filteredMainIds(start, end, kind) {
  return mainIds(start, end).filter((id) => {
    const station = stationById(id);
    if (id === start || id === end) return true;
    if (kind === "express") return station.express;
    if (kind === "rapid") return station.rapid;
    return true;
  });
}

function reverseStops(stops) {
  return [...stops].reverse();
}

function cycleValue(values, slot) {
  return values[Math.abs(slot) % values.length];
}

function addRoutePair(routes, base) {
  routes.push({
    ...base,
    key: `${base.key}-down`,
    direction: "down",
    stops: base.stops,
    start: base.stops[0],
    end: base.stops.at(-1),
    offset: base.offset || 0,
    terminalLayover: base.terminalLayover ?? turnbackSeconds,
  });
  routes.push({
    ...base,
    key: `${base.key}-up`,
    direction: "up",
    stops: reverseStops(base.stops),
    start: base.stops.at(-1),
    end: base.stops[0],
    offset: base.returnOffset ?? Math.round(base.interval / 2),
    destCycle: base.upDestCycle || base.destCycle,
    terminalLayover: base.terminalLayover ?? turnbackSeconds,
  });
}

function buildServiceRoutes() {
  const routes = [];
  const limitedStops = [1, 8, 16, 38, 42];
  const limitedEgawaStops = [16, 38, 42];
  addRoutePair(routes, {
    key: "miyano-local",
    label: "普通",
    color: "ordinary",
    line: "miyano",
    laneA: "miyanoDown",
    laneB: "miyanoUp",
    stops: mainIds(1, 16),
    interval: 20 * 60,
    cars: 8,
    terminalLayover: turnbackSeconds,
    note: "赤島原 - 江川間を運転します。",
  });
  addRoutePair(routes, {
    key: "miyano-itanuma",
    label: "普通",
    color: "ordinary",
    line: "miyano",
    laneA: "miyanoDown",
    laneB: "miyanoUp",
    stops: mainIds(16, 8),
    interval: 40 * 60,
    cars: 8,
    offset: 10 * 60,
    returnOffset: 23 * 60,
    terminalLayover: turnbackSeconds,
    note: "赤島原 - 板沼間を運転します。",
  });
  addRoutePair(routes, {
    key: "rapid-through",
    label: "快速",
    color: "rapid",
    line: "rapid",
    laneA: "rapidDownA",
    laneB: "rapidUpA",
    stops: filteredMainIds(16, 42, "rapid"),
    interval: 4 * 60,
    cars: 15,
    offset: 30,
    returnOffset: 150,
    destCycle: ["北宮", "東ノ宮", "滋葉", "東ノ宮", "南鎌崎", "東ノ宮", "志田浦", "花取"],
    upDestCycle: ["江川"],
    note: "東ノ宮から先、みらいじま線または山武線へ直通する列車があります。",
  });
  addRoutePair(routes, {
    key: "rapid-short",
    label: "快速",
    color: "rapid",
    line: "rapid",
    laneA: "rapidDownB",
    laneB: "rapidUpB",
    stops: filteredMainIds(16, 36, "rapid"),
    interval: 4 * 60,
    cars: 15,
    offset: 2 * 60,
    returnOffset: 6 * 60,
    terminalLayover: turnbackSeconds,
    note: "新桜浜で折り返します。",
  });
  addRoutePair(routes, {
    key: "rapid-ohashi",
    label: "快速",
    color: "rapid",
    line: "rapid",
    laneA: "rapidDownA",
    laneB: "rapidUpA",
    stops: filteredMainIds(16, 15, "rapid"),
    interval: 240 * 60,
    cars: 15,
    offset: 10 * 60,
    returnOffset: 14 * 60,
    terminalLayover: turnbackSeconds,
    destCycle: ["大橋"],
    upDestCycle: ["江川"],
    note: "大橋で折り返し、江川で回送となります。",
  });
  routes.push({
    key: "rapid-east-ohashi-up",
    label: "快速",
    color: "rapid",
    line: "rapid",
    direction: "up",
    laneA: "rapidDownA",
    laneB: "rapidUpA",
    stops: filteredMainIds(42, 15, "rapid"),
    start: 42,
    end: 15,
    interval: 8 * 60,
    cars: 15,
    offset: 6 * 60,
    terminalLayover: turnbackSeconds,
    destCycle: ["大橋"],
    nextDestination: "江川",
    nextStops: [15, 16],
    nextDirection: "down",
    note: "大橋で折り返し、江川で回送となります。",
  });
  routes.push({
    key: "rapid-ohashi-egawa-down",
    label: "快速",
    color: "rapid",
    line: "rapid",
    direction: "down",
    laneA: "rapidDownA",
    laneB: "rapidUpA",
    stops: [15, 16],
    start: 15,
    end: 16,
    interval: 8 * 60,
    cars: 15,
    offset: 9 * 60,
    destCycle: ["江川"],
    note: "江川到着後、回送となります。",
  });
  addRoutePair(routes, {
    key: "rapid-akashimabara",
    label: "快速",
    color: "rapid",
    line: "rapid",
    laneA: "rapidDownA",
    laneB: "rapidUpA",
    stops: filteredMainIds(1, 42, "rapid"),
    interval: 30 * 60,
    cars: 15,
    offset: 5 * 60,
    returnOffset: 15 * 60,
    specialDwell: { 8: couplingSeconds },
    destCycle: ["北宮", "東ノ宮", "滋葉", "東ノ宮"],
    upDestCycle: ["赤島原"],
    note: "板沼で赤島原寄り4両の切り離し・増結を行います。",
  });
  addRoutePair(routes, {
    key: "rapid-express",
    label: "快速急行",
    color: "rapid",
    line: "rapid",
    laneA: "rapidDownB",
    laneB: "rapidUpB",
    stops: [1, 2, 3, 4, 5, 6, 7, 8, 15, 16, 17, 22, 38, 40, 41, 42],
    interval: 40 * 60,
    cars: 15,
    offset: 11 * 60,
    returnOffset: 1 * 60,
    specialDwell: { 8: couplingSeconds },
    destCycle: ["東ノ宮", "北宮", "滋葉"],
    upDestCycle: ["赤島原"],
    note: "板沼で赤島原寄り4両の切り離し・増結を行います。",
  });
  addRoutePair(routes, {
    key: "airport-through",
    label: "快速",
    color: "airport",
    line: "airport",
    laneA: "rapidDownB",
    laneB: "rapidUpB",
    stops: [...filteredMainIds(16, 22, "rapid"), "TA1", "TA2", "TA3"],
    interval: 15 * 60,
    cars: 15,
    offset: 6 * 60,
    returnOffset: 13 * 60,
    terminalLayover: airportLayoverSeconds,
    destCycle: ["戸羽空港"],
    upDestCycle: ["江川"],
    note: "船戸から戸羽空港線へ直通します。",
  });
  addRoutePair(routes, {
    key: "local-main",
    label: "各停",
    color: "local",
    line: "local",
    laneA: "localDown",
    laneB: "localUp",
    stops: mainIds(16, 38),
    interval: 6 * 60,
    cars: 11,
    offset: 90,
    returnOffset: 6 * 60,
    destCycle: ["武蔵多摩浜", "大吹", "武蔵多摩浜"],
    upDestCycle: ["江川", "元山", "江川", "本町"],
    note: "一部列車は元山線へ直通します。",
  });
  addRoutePair(routes, {
    key: "local-obuki",
    label: "各停",
    color: "local",
    line: "local",
    laneA: "localDown",
    laneB: "localUp",
    stops: mainIds(16, 29),
    interval: 24 * 60,
    cars: 11,
    offset: 7 * 60,
    returnOffset: 18 * 60,
    terminalLayover: turnbackSeconds,
    destCycle: ["大吹"],
    upDestCycle: ["元山", "江川", "本町"],
    note: "江川 - 大吹間を運転します。",
  });
  addRoutePair(routes, {
    key: "local-higashinomiya",
    label: "各停",
    color: "local",
    line: "local",
    laneA: "localDown",
    laneB: "localUp",
    stops: mainIds(16, 42),
    interval: 60 * 60,
    cars: 11,
    offset: 9 * 60,
    returnOffset: 39 * 60,
    destCycle: ["東ノ宮"],
    upDestCycle: ["江川"],
    note: "東ノ宮まで直通します。",
  });
  addRoutePair(routes, {
    key: "limited-akashimabara",
    label: "特急",
    color: "limited",
    line: "limited",
    laneA: "expressDown",
    laneB: "expressUp",
    stops: limitedStops,
    interval: 80 * 60,
    cars: 12,
    offset: 12 * 60,
    returnOffset: 32 * 60,
    specialDwell: { 42: couplingSeconds },
    destCycle: ["島橋・滋葉", "島橋・滋葉", "みらいじま・滋葉"],
    upDestCycle: ["赤島原"],
    note: "東ノ宮で前6両をみらいじま線方面、後ろ6両を山武線方面へ切り離します。東ノ宮で折り返す江川方面は増結します。",
  });
  addRoutePair(routes, {
    key: "limited-egawa",
    label: "特急",
    color: "limited",
    line: "limited",
    laneA: "expressDown",
    laneB: "expressUp",
    stops: limitedEgawaStops,
    interval: 40 * 60,
    cars: 12,
    offset: 28 * 60,
    returnOffset: 8 * 60,
    specialDwell: { 42: couplingSeconds },
    destCycle: ["島橋・滋葉", "島橋・滋葉"],
    upDestCycle: ["江川"],
    note: "東ノ宮で前6両をみらいじま線方面、後ろ6両を山武線方面へ切り離します。東ノ宮で折り返す江川方面は増結します。",
  });
  return routes;
}

const serviceRoutes = buildServiceRoutes().filter((route) => ![
  "rapid-through",
  "rapid-short",
  "rapid-akashimabara",
  "rapid-express",
  "airport-through",
  "rapid-east-ohashi",
  "rapid-ohashi-egawa",
].some((key) => route.key.includes(key)));
addScheduledRapidRoutes(serviceRoutes);
serviceRoutes.forEach((route) => {
  if (route.key === "rapid-ohashi-egawa-down") route.terminalLayover = 5 * 60;
});

function addScheduledRapidRoutes(routes) {
  const scheduleMinutes = [0, 2, 4, 6, 8, 11, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60];
  const downPatterns = [
    { name: "新桜浜", stops: filteredMainIds(16, 36, "rapid"), layover: turnbackSeconds },
    { name: "東ノ宮", stops: filteredMainIds(16, 42, "rapid"), layover: turnbackSeconds },
    { name: "花取", stops: filteredMainIds(16, 42, "rapid"), layover: turnbackSeconds },
    { name: "南鎌崎", stops: filteredMainIds(16, 42, "rapid"), layover: turnbackSeconds },
    { name: "北宮", stops: filteredMainIds(16, 42, "rapid"), layover: turnbackSeconds },
    { name: "志田浦", stops: filteredMainIds(16, 42, "rapid"), layover: turnbackSeconds },
    { name: "滋葉", stops: filteredMainIds(16, 42, "rapid"), layover: turnbackSeconds },
    { name: "戸羽空港", stops: [...filteredMainIds(16, 22, "rapid"), "TA1", "TA2", "TA3"], layover: airportLayoverSeconds, line: "airport", color: "airport" },
  ];
  const upPatterns = [
    { name: "江川", stops: reverseStops(filteredMainIds(16, 42, "rapid")) },
    { name: "江川", stops: reverseStops(filteredMainIds(16, 36, "rapid")) },
    { name: "江川", stops: reverseStops(filteredMainIds(16, 42, "rapid")) },
    { name: "江川", stops: ["TA3", "TA2", "TA1", ...reverseStops(filteredMainIds(16, 22, "rapid"))], line: "airport", color: "airport" },
  ];
  scheduleMinutes.forEach((minute, index) => {
    const platform = index % 2 === 0 ? "1" : "2";
    const lane = platform === "1" ? "rapidDownA" : "rapidDownB";
    const pattern = scheduledDownPattern(index);
    const downRuntime = departureRuntimeAtStop({
      ...pattern,
      line: pattern.line || "rapid",
      stops: pattern.stops,
      terminalLayover: pattern.layover || turnbackSeconds,
      specialDwell: pattern.specialDwell,
    }, pattern.scheduleStop || pattern.stops[0]);
    routes.push({
      key: `scheduled-rapid-down-${index}`,
      label: pattern.label || "快速",
      color: pattern.color || "rapid",
      line: pattern.line || "rapid",
      direction: "down",
      laneA: lane,
      laneB: lane,
      stops: pattern.stops,
      start: pattern.stops[0],
      end: pattern.stops.at(-1),
      interval: 60 * 60,
      offset: minute * 60 - downRuntime,
      cars: 15,
      terminalLayover: pattern.layover || turnbackSeconds,
      specialDwell: pattern.specialDwell,
      destCycle: [pattern.name],
      platformAtEgawa: platform,
      scheduled: true,
    });
    const upPlatform = index % 2 === 0 ? "3" : "4";
    const upLane = upPlatform === "3" ? "rapidUpA" : "rapidUpB";
    const upPattern = scheduledUpPattern(index, upPatterns);
    const upRuntime = arrivalRuntimeAtStop({
      ...upPattern,
      line: upPattern.line || "rapid",
      stops: upPattern.stops,
      terminalLayover: upPattern.layover || 5 * 60,
      specialDwell: upPattern.specialDwell,
    }, upPattern.scheduleStop || 16);
    routes.push({
      key: `scheduled-rapid-up-${index}`,
      label: upPattern.label || "快速",
      color: upPattern.color || "rapid",
      line: upPattern.line || "rapid",
      direction: "up",
      laneA: upLane,
      laneB: upLane,
      stops: upPattern.stops,
      start: upPattern.stops[0],
      end: upPattern.stops.at(-1),
      interval: 60 * 60,
      offset: minute * 60 - upRuntime,
      cars: 15,
      terminalLayover: upPattern.layover || 5 * 60,
      specialDwell: upPattern.specialDwell,
      platformAtEgawa: upPlatform,
      destCycle: [upPattern.name || stationById(upPattern.stops.at(-1)).name],
      scheduled: true,
      scheduleAsArrival: false,
    });
  });
}

function scheduledDownPattern(index) {
  const beyond = [
    { name: "東ノ宮", stops: filteredMainIds(16, 42, "rapid"), layover: turnbackSeconds },
    { name: "花取", stops: filteredMainIds(16, 42, "rapid"), layover: turnbackSeconds },
    { name: "南鎌崎", stops: filteredMainIds(16, 42, "rapid"), layover: turnbackSeconds },
    { name: "北宮", stops: filteredMainIds(16, 42, "rapid"), layover: turnbackSeconds },
    { name: "志田浦", stops: filteredMainIds(16, 42, "rapid"), layover: turnbackSeconds },
    { name: "滋葉", stops: filteredMainIds(16, 42, "rapid"), layover: turnbackSeconds },
    { name: "赤島原", stops: filteredMainIds(16, 1, "rapid"), layover: turnbackSeconds },
    { name: "戸羽空港", stops: [...filteredMainIds(16, 22, "rapid"), "TA1", "TA2", "TA3"], layover: airportLayoverSeconds, line: "airport", color: "airport" },
  ];
  if (index % 2 === 0) return { name: "新桜浜", stops: filteredMainIds(16, 36, "rapid"), layover: turnbackSeconds };
  if (index % 2 !== 0 && Math.floor(index / 2) % 9 === 6) {
    return {
      name: stationById(42).name,
      label: "快速急行",
      stops: filteredMainIds(1, 42, "express"),
      scheduleStop: 16,
      layover: turnbackSeconds,
      specialDwell: { 8: couplingSeconds },
    };
  }
  return beyond[Math.floor(index / 2) % beyond.length];
}

function scheduledUpPattern(index, fallbackPatterns) {
  if (index % 10 === 7) {
    return {
      name: stationById(1).name,
      label: "快速急行",
      stops: reverseStops(filteredMainIds(1, 42, "express")),
      scheduleStop: 16,
      layover: turnbackSeconds,
      specialDwell: { 8: couplingSeconds },
    };
  }
  if (index % 10 === 3) {
    return {
      name: stationById(1).name,
      stops: filteredMainIds(16, 1, "rapid"),
      scheduleStop: 16,
      layover: turnbackSeconds,
    };
  }
  return fallbackPatterns[index % fallbackPatterns.length];
}

function arrivalRuntimeAtStop(route, stopId) {
  let total = 0;
  for (let i = 0; i < route.stops.length; i += 1) {
    if (route.stops[i] === stopId) return total;
    total += stopDwell(route, route.stops[i], i);
    if (i < route.stops.length - 1) total += travelSecondsForTrain(route, route.stops[i], route.stops[i + 1]);
  }
  return total;
}

function departureRuntimeAtStop(route, stopId) {
  const stopIndex = route.stops.indexOf(stopId);
  if (stopIndex < 0) return 0;
  return arrivalRuntimeAtStop(route, stopId) + stopDwell(route, stopId, stopIndex);
}

function stopDwell(route, stopId, index) {
  const passingWait = passingWaitSeconds(route, stopId);
  if (passingWait) return Math.max(dwellSeconds, passingWait);
  if (route.specialDwell?.[stopId]) return route.specialDwell[stopId];
  if (index === route.stops.length - 1) return route.terminalLayover || dwellSeconds;
  if (["rapid", "local", "limited", "airport"].includes(route.line)) return Math.max(dwellSeconds, 2 * 60);
  return dwellSeconds;
}

function passingWaitSeconds(route, stopId) {
  if (route.line !== "miyano" && route.line !== "local") return 0;
  const passingStations = new Set([5, 8, 10, 12, 15]);
  if (!passingStations.has(stopId)) return 0;
  return 2 * 60;
}

function adjacentTravelSeconds(a, b) {
  const low = Math.min(a, b);
  const high = Math.max(a, b);
  if (low >= 36 && high <= 42) return 5 * 60;
  if (low === 29 && high === 30) return 5 * 60;
  if (low === 30 && high === 31) return 5 * 60;
  if (low === 31 && high === 32) return 4 * 60;
  if (low === 32 && high === 33) return 3 * 60;
  return 3 * 60;
}

function travelSecondsBetween(from, to) {
  if (typeof from !== "number" || typeof to !== "number") return segmentSeconds;
  const step = from < to ? 1 : -1;
  let total = 0;
  let intervals = 0;
  for (let id = from; id !== to; id += step) {
    total += adjacentTravelSeconds(id, id + step);
    intervals += 1;
  }
  const skippedStations = Math.max(0, Math.abs(to - from) - 1);
  const discount = intervals >= 4 ? intervals : skippedStations;
  return Math.max(60, total - discount * 60);
}

function travelSecondsForTrain(route, from, to) {
  const base = travelSecondsBetween(from, to);
  if (route.line === "limited" && typeof from === "number" && typeof to === "number") {
    const low = Math.min(from, to);
    if (low >= 36) return Math.ceil(base * 1.35);
  }
  return base;
}

function arrivalRuntimeSeconds(route) {
  return route.stops.reduce((total, stop, index) => {
    if (index === route.stops.length - 1) return total;
    return total + stopDwell(route, stop, index) + travelSecondsForTrain(route, stop, route.stops[index + 1]);
  }, 0);
}

function isTerminalDwell(train, progress) {
  return progress.dwelling && progress.stopIndex === train.stops.length - 1;
}

function isDepotAfterArrival(train, progress) {
  if (!isTerminalDwell(train, progress)) return false;
  if (train.scheduled && train.direction === "up" && train.end === 16) return true;
  if (train.key.includes("rapid-ohashi-egawa")) return true;
  if (train.key.includes("rapid-ohashi-up") && train.end === 16) return true;
  if (train.terminalLayover) return false;
  return train.end === 16;
}

function journeySeconds(route) {
  return route.stops.reduce((total, stop, index) => {
    const travel = index < route.stops.length - 1 ? travelSecondsForTrain(route, stop, route.stops[index + 1]) : 0;
    return total + stopDwell(route, stop, index) + travel;
  }, 0);
}

function generateTrains(now) {
  const seconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const list = [];
  serviceRoutes.forEach((route) => {
    const total = journeySeconds(route);
    const offset = route.offset || 0;
    const scheduleOffset = route.scheduleAsArrival ? offset - arrivalRuntimeSeconds(route) : offset;
    const count = Math.ceil(total / route.interval) + 2;
    for (let i = -1; i < count; i += 1) {
      const departure = Math.floor((seconds - scheduleOffset) / route.interval) * route.interval + scheduleOffset - i * route.interval;
      const elapsed = seconds - departure;
      if (elapsed >= 0 && elapsed <= total) {
        const slot = Math.floor(departure / route.interval);
        const destination = route.destCycle ? cycleValue(route.destCycle, slot) : stationById(route.end).name;
        list.push({ ...route, id: `${route.key}-${departure}`, departure, elapsed, destination });
      }
    }
  });
  return enforceDispatchSpacing(list);
}

function segmentDepartureTime(train, stopIndex) {
  let elapsed = 0;
  for (let i = 0; i <= stopIndex; i += 1) {
    elapsed += stopDwell(train, train.stops[i], i);
    if (i < stopIndex) elapsed += travelSecondsForTrain(train, train.stops[i], train.stops[i + 1]);
  }
  return train.departure + elapsed;
}

function trainBlockKey(train) {
  const progress = trainProgress(train);
  const lane = effectiveLane(train, progress);
  if (progress.dwelling) {
    const from = progress.from;
    const to = train.stops[progress.stopIndex + 1] ?? progress.from;
    return { key: `${lane}:${train.direction}:${from}-${to}`, time: segmentDepartureTime(train, progress.stopIndex), lane };
  }
  return { key: `${lane}:${train.direction}:${progress.from}-${progress.to}`, time: segmentDepartureTime(train, progress.stopIndex), lane };
}

function enforceDispatchSpacing(list) {
  const minGap = 2 * 60;
  const kept = [];
  const seen = new Map();
  [...list]
    .sort((a, b) => trainBlockKey(a).time - trainBlockKey(b).time)
    .forEach((train) => {
      const block = trainBlockKey(train);
      const previous = seen.get(block.key);
      if (previous != null && Math.abs(block.time - previous) < minGap) return;
      seen.set(block.key, block.time);
      kept.push(train);
    });
  return removeEgawaRapidArrivalConflicts(kept);
}

function removeEgawaRapidArrivalConflicts(list) {
  const occupied = new Set();
  return list.filter((train) => {
    const progress = trainProgress(train);
    const isEgawaRapidArrival = progress.dwelling
      && progress.from === 16
      && train.direction === "up"
      && (train.line === "rapid" || train.line === "airport");
    if (!isEgawaRapidArrival) return true;
    if (occupied.has("egawa-up-rapid")) return false;
    occupied.add("egawa-up-rapid");
    return true;
  });
}

function trainProgress(train) {
  let elapsed = train.elapsed;
  for (let i = 0; i < train.stops.length; i += 1) {
    const dwell = stopDwell(train, train.stops[i], i);
    if (elapsed < dwell) return { from: train.stops[i], to: train.stops[i], ratio: 0, stopIndex: i, dwelling: true, dwellSeconds: dwell, dwellElapsed: elapsed };
    elapsed -= dwell;
    if (i === train.stops.length - 1) return { from: train.stops[i], to: train.stops[i], ratio: 0, stopIndex: i, dwelling: true, dwellSeconds: dwell, dwellElapsed: dwell };
    const travel = travelSecondsForTrain(train, train.stops[i], train.stops[i + 1]);
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

function baseLane(train) {
  return train.direction === "down" ? train.laneA : train.laneB;
}

function effectiveLane(train, progress) {
  const lane = baseLane(train);
  const ids = [progress.from, progress.to].filter((id) => typeof id === "number");
  const minId = ids.length ? Math.min(...ids) : 0;
  const maxId = ids.length ? Math.max(...ids) : 0;
  if (maxId <= 16) return train.direction === "down" ? "miyanoDown" : "miyanoUp";
  if (train.direction === "down" && train.line === "rapid" && minId >= 36 && maxId <= 38) return "rapidDownA";
  if (train.direction === "down" && train.line === "airport" && minId >= 36 && maxId <= 38) return "rapidDownA";
  if ((minId === 40 && maxId === 41) || minId >= 40) return train.direction === "down" ? "rapidDownA" : "rapidUpB";
  if (minId >= 38) return train.direction === "down" ? "rapidDownA" : "rapidUpA";
  if (train.line === "limited" && minId >= 36) {
    return train.direction === "down" ? "rapidDownA" : "rapidUpA";
  }
  return lane;
}

function lineClassFor(route) {
  if (route.line === "local") return "emerald";
  if (route.line === "limited") return "limited";
  if (route.line === "airport") return "airport";
  return "magenta";
}

function laneOffset(lane, zoomed) {
  const overview = {
    miyanoDown: 24, miyanoUp: -24,
    rapidDownA: 24, rapidDownB: 44, rapidUpA: -24, rapidUpB: -44,
    localDown: 64, localUp: -64,
    expressDown: 84, expressUp: -84,
    airportDown: 0, airportUp: 0,
  };
  const zoom = {
    expressUp: -600, expressDown: -480,
    localUp: -180, localDown: -60,
    rapidUpB: 60, rapidUpA: 180, rapidDownB: 300, rapidDownA: 420,
    miyanoUp: -120, miyanoDown: 120,
    airportDown: 0, airportUp: 0,
  };
  return (zoomed ? zoom : overview)[lane] || 0;
}

function platformFor(train, stationId) {
  const down = train.direction === "down";
  if (stationId === 42) {
    if (train.line === "limited") return down ? "9" : "10";
    if (!down) return "8";
    if (train.line === "rapid" && !train.terminalLayover) return "2";
    return "5";
  }
  if (stationId === 16) {
    if (train.platformAtEgawa) return train.platformAtEgawa;
    if (train.line === "limited") return down ? "9" : "10";
    if (train.line === "local") return down ? "7" : "8";
    if (train.line === "miyano") return "5";
    return down ? "1" : "3";
  }
  if (stationId === 8) {
    if (train.key.includes("itanuma")) return down ? "2" : "3";
    return down ? "3" : "1";
  }
  if (stationId === 22) {
    if (train.line === "airport") return down ? "9" : "12";
    if (train.line === "local") return down ? "5" : "7";
    return down ? "1" : "3";
  }
  if (stationId === 36) {
    if (train.line === "local") return down ? "5" : "6";
    if (train.key.includes("rapid-short")) return down ? "1" : "2";
    return down ? "1" : "4";
  }
  if (stationId === 38) {
    if (train.line === "local") return down ? "3" : "4";
    return down ? "1" : "2";
  }
  if (stationId === 40 || stationId === 41) return down ? "4" : "1";
  if (stationId === 42) {
    if (train.line === "limited") return down ? "8" : "9";
    if (train.line === "rapid" && train.destination !== "東ノ宮") return train.destination === "北宮" || train.destination === "南鎌崎" || train.destination === "花取" ? "2" : "3";
    return down ? "4" : "7";
  }
  return "";
}

function lanePoint(id, lane, pointMap, zoomed) {
  const point = pointMap.get(id);
  if (!point) return undefined;
  if (typeof id === "string") return point;
  return { x: point.x + laneOffset(lane, zoomed), y: point.y };
}

function trainLanePoint(id, lane, train, pointMap, zoomed) {
  const point = lanePoint(id, lane, pointMap, zoomed);
  if (!point || typeof id !== "string" || train.line !== "airport") return point;
  const offset = train.direction === "down" ? 46 : -46;
  return { x: point.x + offset, y: point.y };
}

function platformPoint(id, train, pointMap, zoomed) {
  if (!zoomed || typeof id !== "number" || !platformStations.has(id)) return undefined;
  const platform = platformFor(train, id);
  if (!platform) return undefined;
  const point = pointMap.get(id);
  const layout = platformBoxLayout(id, point);
  const cell = layout.cells.find((item) => item.platform === String(platform));
  if (!cell) return undefined;
  return {
    x: layout.left + cell.left + layout.cellWidth / 2,
    y: layout.top + layout.height - 30,
  };
}

function shiftIntoInterstationBand(point, progress) {
  if (progress.dwelling || typeof progress.from !== "number" || typeof progress.to !== "number") return point;
  const direction = progress.to > progress.from ? 1 : -1;
  return { x: point.x, y: point.y + direction * 28 };
}

function movingBandPoint(from, to, ratio) {
  return makePoint(from, to, 0.22 + ratio * 0.56);
}

function trainPoint(train, pointMap, zoomed) {
  const progress = trainProgress(train);
  if (train.line === "airport" && progress.from === 22 && progress.to === "TA1" && progress.ratio > 0) {
    progress.from = "TA0";
  }
  if (train.line === "airport" && progress.from === "TA1" && progress.to === 22 && progress.ratio > 0) {
    progress.to = "TA0";
  }
  const lane = effectiveLane(train, progress);
  const platform = progress.dwelling ? platformPoint(progress.from, train, pointMap, zoomed) : undefined;
  if (platform) return { ...platform, progress, lane };
  const from = trainLanePoint(progress.from, lane, train, pointMap, zoomed);
  const to = trainLanePoint(progress.to, lane, train, pointMap, zoomed);
  const p = zoomed && !progress.dwelling ? movingBandPoint(from, to, progress.ratio) : makePoint(from, to, progress.ratio);
  const bandPoint = zoomed ? shiftIntoInterstationBand(p, progress) : p;
  return { x: bandPoint.x, y: bandPoint.y, progress, lane };
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

function drawLine(container, pointMap, ids, className, width, zoomed, lane = "rapidDownA", extraClass = "segment") {
  for (let i = 0; i < ids.length - 1; i += 1) {
    drawSegment(container, lanePoint(ids[i], lane, pointMap, zoomed), lanePoint(ids[i + 1], lane, pointMap, zoomed), className, width, extraClass);
  }
}

function drawCenterLine(container, pointMap, ids, className, width, extraClass = "segment") {
  for (let i = 0; i < ids.length - 1; i += 1) {
    drawSegment(container, pointMap.get(ids[i]), pointMap.get(ids[i + 1]), className, width, extraClass);
  }
}

function offsetPoint(point, dx) {
  return { x: point.x + dx, y: point.y };
}

function drawOffsetCenterLine(container, pointMap, ids, className, width, dx, extraClass = "segment") {
  for (let i = 0; i < ids.length - 1; i += 1) {
    drawSegment(container, offsetPoint(pointMap.get(ids[i]), dx), offsetPoint(pointMap.get(ids[i + 1]), dx), className, width, extraClass);
  }
}

function platformBoxLayout(stationId, point) {
  const platformMap = {
    8: ["1", "2", "3", "4"],
    16: ["10", "9", "8", "7", "6", "5", "4", "3", "2", "1"],
    22: ["12", "11", "10", "9", "8", "7", "6", "5", "4", "3", "2", "1"],
    36: ["6", "5", "4", "3", "2", "1"],
    38: ["4", "3", "2", "1"],
    40: ["1", "2", "3", "4"],
    41: ["1", "2", "3", "4"],
    42: ["10", "9", "8", "7", "6", "5", "4", "3", "2", "1"],
  };
  const centerMap = {
    8: { 1: -210, 2: -70, 3: 70, 4: 210 },
    16: { 10: -600, 9: -480, 8: -360, 7: -240, 6: -120, 5: 0, 4: 60, 3: 180, 2: 300, 1: 420 },
    22: { 12: -660, 11: -540, 10: -420, 9: -300, 8: -180, 7: -60, 6: 60, 5: 180, 4: 300, 3: 420, 2: 540, 1: 660 },
    36: { 6: -180, 5: -60, 4: 60, 3: 180, 2: 300, 1: 420 },
    38: { 4: -180, 3: -60, 2: 180, 1: 420 },
    40: { 1: 60, 2: 180, 3: 300, 4: 420 },
    41: { 1: 60, 2: 180, 3: 300, 4: 420 },
    42: { 10: -600, 9: -480, 8: -300, 7: -180, 6: 60, 5: 180, 4: 300, 3: 420, 2: 540, 1: 660 },
  };
  const platforms = platformMap[stationId] || [];
  const centers = centerMap[stationId] || {};
  const cellWidth = 108;
  const min = Math.min(...platforms.map((platform) => centers[platform] ?? 0));
  const max = Math.max(...platforms.map((platform) => centers[platform] ?? 0));
  const width = max - min + cellWidth;
  const cells = platforms.map((platform) => ({
    platform,
    left: (centers[platform] ?? 0) - min,
  }));
  return {
    platforms,
    cells,
    cellWidth,
    width,
    height: 96,
    left: point.x + min - cellWidth / 2,
    top: point.y - 48,
  };
}

function renderPlatforms(container, pointMap, zoomed) {
  if (!zoomed) return;
  platformStations.forEach((stationId) => {
    const point = pointMap.get(stationId);
    const layout = platformBoxLayout(stationId, point);
    const box = document.createElement("div");
    box.className = "platform-box";
    box.style.left = `${layout.left}px`;
    box.style.top = `${layout.top}px`;
    box.style.width = `${layout.width}px`;
    box.style.height = `${layout.height}px`;
    box.innerHTML = `
      <div class="platform-title">${stationById(stationId).name}</div>
      <div class="platform-groups"><span>快速</span><span>各停</span><span>特急</span></div>
      <div class="platform-cells">
        ${layout.platforms.map((platform) => `<span>${platform}番線</span>`).join("")}
      </div>
    `;
    container.appendChild(box);
  });
}

function renderPlatformsAligned(container, pointMap, zoomed) {
  if (!zoomed) return;
  platformStations.forEach((stationId) => {
    const point = pointMap.get(stationId);
    const layout = platformBoxLayout(stationId, point);
    const box = document.createElement("div");
    box.className = "platform-box";
    box.style.left = `${layout.left}px`;
    box.style.top = `${layout.top}px`;
    box.style.width = `${layout.width}px`;
    box.style.height = `${layout.height}px`;
    box.innerHTML = `
      <div class="platform-title">${stationById(stationId).name}</div>
      <div class="platform-groups"><span>特急</span><span>各停</span><span>快速</span></div>
      <div class="platform-cells">
        ${layout.cells.map((cell) => `<span style="left:${cell.left}px;width:${layout.cellWidth}px">${cell.platform}番線</span>`).join("")}
      </div>
    `;
    container.appendChild(box);
  });
}

function renderOverviewBase() {
  overviewMap.innerHTML = "";
  const rect = overviewMap.getBoundingClientRect();
  const w = rect.width;
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
    const x = onLeft ? leftX : rightX;
    const y = onLeft ? lerp(topY, bottomY, t) : lerp(bottomY, topY, t);
    mapPoints.set(station.id, { x, y });
  });

  const funato = mapPoints.get(22);
  mapPoints.set("TA0", { x: funato.x, y: funato.y });
  mapPoints.set("TA1", { x: funato.x + 100, y: funato.y + 34 });
  mapPoints.set("TA2", { x: funato.x + 188, y: funato.y + 82 });
  mapPoints.set("TA3", { x: funato.x + 280, y: funato.y + 126 });

  drawOffsetCenterLine(overviewMap, mapPoints, mainIds(16, 36), "emerald", 8, 16);
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
    const side = station.id <= 21 ? "right" : "left";
    const code = typeof station.id === "number" ? `SM ${pad(station.id)}` : station.code;
    node.innerHTML = `<div class="station-dot"></div><div class="station-label" style="${side}:18px;top:-14px">${station.name}<br><span class="station-code">${code}</span></div>`;
    overviewMap.appendChild(node);
  });
}

function renderZoomBase() {
  zoomMap.innerHTML = "";
  const width = Math.max(1700, railPanel.clientWidth);
  zoomMap.style.width = `${width}px`;
  const center = Math.max(520, Math.min(width * 0.5, railPanel.clientWidth * 0.86));
  const rowHeight = 176;
  const top = 70;
  zoomPoints = new Map();

  stations.forEach((station, index) => {
    const y = top + index * rowHeight;
    zoomPoints.set(station.id, { x: center, y });
    const row = document.createElement("div");
    row.className = "zoom-row";
    row.style.top = `${y - rowHeight / 2}px`;
    row.style.height = `${rowHeight}px`;
    row.innerHTML = `<div class="zoom-station-name">${station.name}</div><div class="zoom-code-set"><span class="zoom-code">SM<br>${pad(station.id)}</span>${station.id >= 16 ? `<span class="zoom-code local">SL<br>${pad(station.id)}</span>` : ""}</div>`;
    zoomMap.appendChild(row);
  });

  const airportTop = top + stations.length * rowHeight + 80;
  zoomMap.style.minHeight = `${airportTop + 430}px`;
  zoomPoints.set("TA0", { x: center, y: airportTop + 70 });
  zoomPoints.set("TA1", { x: center, y: airportTop + 160 });
  zoomPoints.set("TA2", { x: center, y: airportTop + 250 });
  zoomPoints.set("TA3", { x: center, y: airportTop + 340 });

  drawOffsetCenterLine(zoomMap, zoomPoints, mainIds(16, 36), "emerald faint", 8, 18, "zoom-line");
  drawCenterLine(zoomMap, zoomPoints, mainIds(1, 42), "magenta faint", 8, "zoom-line");
  drawSegment(zoomMap, zoomPoints.get("TA0"), zoomPoints.get("TA1"), "airport", 10, "zoom-line");
  drawSegment(zoomMap, zoomPoints.get("TA1"), zoomPoints.get("TA2"), "airport", 10, "zoom-line");
  drawSegment(zoomMap, zoomPoints.get("TA2"), zoomPoints.get("TA3"), "airport", 10, "zoom-line");

  renderPlatformsAligned(zoomMap, zoomPoints, true);

  [...stations, ...branchStations].forEach((station) => {
    const point = zoomPoints.get(station.id);
    const dot = document.createElement("div");
    dot.className = `station ${station.major ? "major" : ""}`;
    dot.style.left = `${point.x}px`;
    dot.style.top = `${point.y}px`;
    dot.innerHTML = `<div class="station-dot"></div>`;
    zoomMap.appendChild(dot);
    if (typeof station.id === "string") {
      const label = document.createElement("div");
      label.className = "branch-label";
      label.style.left = `${point.x + 26}px`;
      label.style.top = `${point.y - 18}px`;
      label.textContent = station.name;
      zoomMap.appendChild(label);
    }
  });

  const airportBox = document.createElement("div");
  airportBox.className = "airport-box";
  airportBox.style.top = `${airportTop}px`;
  airportBox.innerHTML = "<strong>戸羽空港線</strong><span>船戸から分岐する直通列車を別枠で表示</span>";
  zoomMap.appendChild(airportBox);
}

function currentCars(train, progress) {
  const ids = [progress.from, progress.to].filter((id) => typeof id === "number");
  const minId = ids.length ? Math.min(...ids) : 99;
  if (train.cars === 15 && minId <= 8) return "11両";
  return `${train.cars}両`;
}

function statusText(progress) {
  if (progress.dwelling && progress.stopIndex != null && progress.stopIndex >= 0 && progress.dwellSeconds === 30) return "当駅止まり・回送";
  return progress.dwelling ? "停車中" : "走行中";
}

function trainDisplay(train, progress) {
  if (isDepotAfterArrival(train, progress)) {
    return { label: "回送", destination: "当駅止まり" };
  }
  if (isTerminalDwell(train, progress) && train.terminalLayover) {
    return { label: train.label, destination: stationById(train.start).name };
  }
  return { label: train.label, destination: train.destination };
}

function displayDirection(train, progress) {
  if (progress.dwelling && progress.stopIndex === train.stops.length - 1 && train.terminalLayover) {
    return train.direction === "down" ? "up" : "down";
  }
  return train.direction;
}

function displayCars(train, progress) {
  const ids = [progress.from, progress.to].filter((id) => typeof id === "number");
  const minId = ids.length ? Math.min(...ids) : 99;
  if (train.cars === 15 && minId <= 8) return "11両";
  return `${train.cars}両`;
}

function displayStatus(train, progress) {
  if (isDepotAfterArrival(train, progress)) return "当駅止まり・回送";
  return progress.dwelling ? "停車中" : "走行中";
}

function displayTrain(train, progress) {
  if (isDepotAfterArrival(train, progress)) return { label: "回送", destination: "当駅止まり", isDepot: true };
  if (isTerminalDwell(train, progress) && train.terminalLayover) {
    return { label: train.label, destination: train.nextDestination || stationById(train.start).name };
  }
  return { label: train.label, destination: train.destination };
}

function renderTrains(container, pointMap, zoomed) {
  container.querySelectorAll(".train").forEach((node) => node.remove());
  const visualSlots = [];
  trains.forEach((train) => {
    const p = trainPoint(train, pointMap, zoomed);
    const minVisualGap = zoomed ? 280 : 42;
    const minVisualX = zoomed ? 170 : 84;
    if (visualSlots.some((slot) => Math.abs(slot.y - p.y) < minVisualGap && Math.abs(slot.x - p.x) < minVisualX)) return;
    visualSlots.push({ x: p.x, y: p.y });
    const visualDirection = displayDirection(train, p.progress);
    const display = trainDisplay(train, p.progress);
    const btn = document.createElement("button");
    btn.className = `train ${train.color} ${visualDirection} ${p.progress.dwelling ? "dwelling" : "moving"}`;
    btn.type = "button";
    btn.style.left = `${p.x}px`;
    btn.style.top = `${p.y}px`;
    btn.innerHTML = `<div class="head">${display.label}・${display.destination}<br>${currentCars(train, p.progress)}</div><div class="run-state">${statusText(p.progress)}</div><div class="face"></div>`;
    const cleanDisplay = displayTrain(train, p.progress);
    btn.innerHTML = `<div class="head">${cleanDisplay.label}・${cleanDisplay.destination}<br>${displayCars(train, p.progress)}</div><div class="run-state">${displayStatus(train, p.progress)}</div><div class="face"></div>`;
    btn.addEventListener("click", () => showTrain(train));
    container.appendChild(btn);
    if (zoomed && train.line === "airport" && p.progress.dwelling && p.progress.from === 22) {
      const branchPoint = pointMap.get("TA0");
      const branchBtn = btn.cloneNode(true);
      branchBtn.style.left = `${branchPoint.x}px`;
      branchBtn.style.top = `${branchPoint.y}px`;
      branchBtn.addEventListener("click", () => showTrain(train));
      container.appendChild(branchBtn);
    }
  });
}

function arrivalRows(train) {
  const progress = trainProgress(train);
  if (isTerminalDwell(train, progress) && train.terminalLayover && train.nextStops) {
    const now = new Date();
    const rows = [];
    let elapsedAtArrival = 0;
    for (let i = 0; i < train.nextStops.length; i += 1) {
      const station = stationById(train.nextStops[i]);
      const date = new Date(now.getTime() + elapsedAtArrival * 1000);
      const nextTrain = { ...train, direction: train.nextDirection || train.direction };
      rows.push({ id: train.nextStops[i], name: station.name, time: formatTime(date), platform: platformFor(nextTrain, train.nextStops[i]), departed: false });
      elapsedAtArrival += stopDwell(train, train.nextStops[i], i) + (i < train.nextStops.length - 1 ? travelSecondsForTrain(train, train.nextStops[i], train.nextStops[i + 1]) : 0);
    }
    return rows;
  }
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const rows = [];
  let elapsedAtArrival = 0;
  const passedIndex = progress.dwelling ? progress.stopIndex : progress.stopIndex;
  const rowStops = displayStopsForTrain(train);
  for (let i = 0; i < rowStops.length; i += 1) {
    const station = stationById(rowStops[i]);
    const date = new Date(midnight.getTime() + (train.departure + elapsedAtArrival) * 1000);
    const platform = platformFor(train, rowStops[i]);
    const departed = progress.dwelling ? i < passedIndex : i <= passedIndex;
    rows.push({ id: rowStops[i], name: station.name, time: formatTime(date), platform, departed });
    elapsedAtArrival += stopDwell(train, rowStops[i], i) + (i < rowStops.length - 1 ? travelSecondsForTrain(train, rowStops[i], rowStops[i + 1]) : 0);
  }
  return rows;
}

function displayStopsForTrain(train) {
  const destinationStation = [...stationMap.values()].find((station) => station.name === train.destination);
  if (!destinationStation) return train.stops;
  const index = train.stops.indexOf(destinationStation.id);
  if (index < 0) return train.stops;
  return train.stops.slice(0, index + 1);
}

function passengerNote(train) {
  if (train.line === "limited") return train.note;
  if (train.key.includes("rapid-akashimabara")) return train.note;
  return "";
}

function meetInfo(train, stopId) {
  if (train.line !== "miyano" && train.line !== "local") return "";
  const stationsForPassing = new Set([5, 8, 10, 12, 15]);
  if (!stationsForPassing.has(stopId)) return "";
  if (train.direction === "down") {
    if (stopId === 8 || stopId === 12) return "快速と接続・快速が先発";
    if (stopId === 15) return "特急通過待ち・2分後発車";
  } else {
    if (stopId === 10 || stopId === 5) return "快速通過待ち・2分後発車";
    if (stopId === 8) return "快速と接続・快速が先発";
  }
  return "";
}

function showTrain(train) {
  const rows = arrivalRows(train);
  const progress = trainProgress(train);
  const currentPlatform = progress.dwelling ? platformFor(train, progress.from) : "";
  const display = trainDisplay(train, progress);
  const note = passengerNote(train);
  dialogBody.innerHTML = `
    <h2 class="dialog-title">${display.label} ${display.destination}行</h2>
    <div class="dialog-meta">${currentCars(train, progress)}・${stationById(train.start).name}発・${statusText(progress)}${currentPlatform ? `・${currentPlatform}番線` : ""}</div>
    ${note ? `<p class="dialog-note">${note}</p>` : ""}
    <div class="stop-list">
      ${rows.map((row) => `<div class="stop-row ${row.departed ? "departed" : ""}"><strong>${row.name}${row.platform ? ` ${row.platform}番線` : ""}</strong><span>${row.departed ? "発車済み" : `${row.time} 着`}</span>${meetInfo(train, row.id) ? `<em>${meetInfo(train, row.id)}</em>` : ""}</div>`).join("")}
    </div>
  `;
  const cleanDisplay = displayTrain(train, progress);
  const cleanTitle = cleanDisplay.isDepot ? `${cleanDisplay.label} ${cleanDisplay.destination}` : `${cleanDisplay.label} ${cleanDisplay.destination}行`;
  dialogBody.innerHTML = `
    <h2 class="dialog-title">${cleanTitle}</h2>
    <div class="dialog-meta">${displayCars(train, progress)}・${stationById(train.start).name}発・${displayStatus(train, progress)}${currentPlatform ? `・${currentPlatform}番線` : ""}</div>
    ${note ? `<p class="dialog-note">${note}</p>` : ""}
    <div class="stop-list">
      ${rows.map((row) => `<div class="stop-row ${row.departed ? "departed" : ""}"><strong>${row.name}${row.platform ? ` ${row.platform}番線` : ""}</strong><span>${row.departed ? "発車済み" : `${row.time} 着`}</span>${meetInfo(train, row.id) ? `<em>${meetInfo(train, row.id)}</em>` : ""}</div>`).join("")}
    </div>
  `;
  dialog.showModal();
}

function render() {
  const now = new Date();
  document.getElementById("dateText").textContent = `${now.getMonth() + 1}月${now.getDate()}日 現在`;
  document.getElementById("timeText").textContent = formatTime(now);
  trains = generateTrains(now);
  renderTrains(overviewMap, mapPoints, false);
  renderTrains(zoomMap, zoomPoints, true);
}

function setMode(zoomed) {
  railPanel.classList.toggle("zoomed", zoomed);
  document.getElementById("zoomBtn").classList.toggle("active", zoomed);
  document.getElementById("overviewBtn").classList.toggle("active", !zoomed);
  applyZoomScale();
  if (zoomed) renderTrains(zoomMap, zoomPoints, true);
}

function applyZoomScale() {
  const scale = window.matchMedia("(max-width: 720px)").matches && railPanel.classList.contains("zoomed") ? 0.58 : 1;
  zoomMap.style.transform = scale === 1 ? "" : `scale(${scale})`;
  zoomMap.style.transformOrigin = "top left";
  zoomMap.style.marginLeft = scale === 1 ? "" : "0";
}

function switchView(view) {
  document.querySelectorAll(".tab").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  const isPosition = view === "position";
  document.querySelectorAll(".position-view").forEach((node) => { node.style.display = isPosition ? "" : "none"; });
  document.querySelectorAll(".app-view").forEach((node) => node.classList.remove("active"));
  const panel = document.getElementById(`${view}View`);
  if (panel) panel.classList.add("active");
  if (isPosition) {
    renderOverviewBase();
    renderZoomBase();
    render();
  }
}

function boot() {
  renderOverviewBase();
  renderZoomBase();
  render();
  setInterval(render, 1000);
  document.getElementById("overviewBtn").addEventListener("click", () => setMode(false));
  document.getElementById("zoomBtn").addEventListener("click", () => setMode(true));
  document.getElementById("refreshBtn").addEventListener("click", render);
  document.getElementById("closeDialog").addEventListener("click", () => dialog.close());
  document.querySelectorAll(".tab").forEach((tabButton) => {
    tabButton.addEventListener("click", () => switchView(tabButton.dataset.view));
  });
  document.querySelectorAll("[data-jump='position']").forEach((button) => {
    button.addEventListener("click", () => switchView("position"));
  });
  window.addEventListener("resize", () => {
    renderOverviewBase();
    renderZoomBase();
    applyZoomScale();
    render();
  });
}

boot();
