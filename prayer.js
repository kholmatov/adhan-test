/* Prayer times calculated offline from coordinates (standard astronomical method, as in PrayTimes.org).
 *
 *   PrayerTimes.compute(date, lat, lng, {method, asr, highLat})
 *     → { fajr, sunrise, dhuhr, asr, maghrib, isha }  as Date objects (absolute moments)
 *
 * Times come out as absolute moments, so they display correctly in the device's own time zone.
 * Mosques often round or shift times by a few minutes, so the app adds per-prayer offsets on top.
 */
(function (root) {
  "use strict";

  const METHODS = {
    MWL:     { name: "Muslim World League",            fajr: 18,   isha: 17 },
    ISNA:    { name: "ISNA (North America)",           fajr: 15,   isha: 15 },
    Egypt:   { name: "Egyptian General Authority",     fajr: 19.5, isha: 17.5 },
    Makkah:  { name: "Umm al-Qura, Makkah",            fajr: 18.5, ishaMin: 90 },
    Karachi: { name: "University of Islamic Sciences, Karachi", fajr: 18, isha: 18 },
    Turkey:  { name: "Diyanet (Turkey)",               fajr: 18,   isha: 17 },
    Russia:  { name: "Spiritual Administration of Muslims of Russia", fajr: 16, isha: 15 },
    Tehran:  { name: "Institute of Geophysics, Tehran", fajr: 17.7, isha: 14, maghrib: 4.5 },
  };

  const D2R = Math.PI / 180;
  const sin = d => Math.sin(d * D2R), cos = d => Math.cos(d * D2R), tan = d => Math.tan(d * D2R);
  const asin = x => Math.asin(x) / D2R, acos = x => Math.acos(x) / D2R;
  const atan2 = (y, x) => Math.atan2(y, x) / D2R, acot = x => Math.atan(1 / x) / D2R;
  const fix = (a, b) => { a = a - b * Math.floor(a / b); return a < 0 ? a + b : a; };
  const fixAngle = a => fix(a, 360), fixHour = h => fix(h, 24);

  function julian(y, m, d) {
    if (m <= 2) { y -= 1; m += 12; }
    const A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
  }

  // sun declination and equation of time for a Julian date
  function sunPosition(jd) {
    const D = jd - 2451545.0;
    const g = fixAngle(357.529 + 0.98560028 * D);
    const q = fixAngle(280.459 + 0.98564736 * D);
    const L = fixAngle(q + 1.915 * sin(g) + 0.020 * sin(2 * g));
    const e = 23.439 - 0.00000036 * D;
    const RA = atan2(cos(e) * sin(L), cos(L)) / 15;
    return { decl: asin(sin(e) * sin(L)), eqt: q / 15 - fixHour(RA) };
  }

  function compute(date, lat, lng, opt = {}) {
    const m = METHODS[opt.method] || METHODS.MWL;
    const asrFactor = opt.asr === "hanafi" ? 2 : 1;
    const y = date.getFullYear(), mo = date.getMonth() + 1, d = date.getDate();
    const jd = julian(y, mo, d) - lng / (15 * 24);

    const midDay = t => fixHour(12 - sunPosition(jd + t).eqt);
    const sunAngleTime = (angle, t, ccw) => {
      const decl = sunPosition(jd + t).decl, noon = midDay(t);
      const T = acos((-sin(angle) - sin(decl) * sin(lat)) / (cos(decl) * cos(lat))) / 15;
      return noon + (ccw ? -T : T);
    };
    const asrTime = (factor, t) => {
      const decl = sunPosition(jd + t).decl;
      return sunAngleTime(-acot(factor + tan(Math.abs(lat - decl))), t);
    };

    // hours in local solar time; two passes refine the sun position at each moment
    let t = { fajr: 5, sunrise: 6, dhuhr: 12, asr: 13, sunset: 18, maghrib: 18, isha: 18 };
    for (let pass = 0; pass < 2; pass++) {
      const p = k => t[k] / 24;
      t = {
        fajr: sunAngleTime(m.fajr, p("fajr"), true),
        sunrise: sunAngleTime(0.833, p("sunrise"), true),
        dhuhr: midDay(p("dhuhr")),
        asr: asrTime(asrFactor, p("asr")),
        sunset: sunAngleTime(0.833, p("sunset")),
        maghrib: m.maghrib ? sunAngleTime(m.maghrib, p("maghrib")) : sunAngleTime(0.833, p("sunset")),
        isha: m.ishaMin ? 0 : sunAngleTime(m.isha, p("isha")),
      };
    }
    if (m.ishaMin) t.isha = t.maghrib + m.ishaMin / 60;

    // high latitudes: when the sun never reaches the angle (or is far too late), use a part of the night
    const night = 24 - (t.sunset - t.sunrise);
    const portion = a => (opt.highLat === "seventh" ? 1 / 7 : opt.highLat === "middle" ? 1 / 2 : a / 60) * night;
    const fp = portion(m.fajr);
    if (isNaN(t.fajr) || t.sunrise - t.fajr > fp) t.fajr = t.sunrise - fp;
    if (!m.ishaMin) {
      const ip = portion(m.isha);
      if (isNaN(t.isha) || t.isha - t.sunset > ip) t.isha = t.sunset + ip;
    }

    // local solar hours → absolute moments (UTC hours = solar hours − longitude/15)
    const base = Date.UTC(y, mo - 1, d);
    const out = {};
    for (const k of ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"]) {
      out[k] = isNaN(t[k]) ? null : new Date(base + (t[k] - lng / 15) * 3600e3);
    }
    return out;
  }

  root.PrayerTimes = { compute, METHODS };
})(typeof window !== "undefined" ? window : globalThis);
