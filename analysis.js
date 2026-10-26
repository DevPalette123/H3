/* analysis.js — حسابات اللوحة (تعمل في المتصفح وفي Node للاختبار) */
(function (root) {
  "use strict";

  function flat(C) {
    var out = [];
    C.AXES.forEach(function (ax, ai) {
      ax.statements.forEach(function (t) { out.push({ text: t, axis: ai, axisKey: ax.key }); });
    });
    return out;
  }

  function validRow(r, C) {
    if (!r || !Array.isArray(r.q)) return false;
    if (r.q.length !== flat(C).length) return false;
    for (var i = 0; i < r.q.length; i++) { if (!(r.q[i] >= 1 && r.q[i] <= 5)) return false; }
    return !!r.domain && !!r.role;
  }

  function mean(arr) {
    var v = arr.filter(function (x) { return typeof x === "number" && isFinite(x); });
    return v.length ? v.reduce(function (a, b) { return a + b; }, 0) / v.length : null;
  }

  function countBy(rows, key, codes) {
    var o = {}; codes.forEach(function (c) { o[c] = 0; });
    rows.forEach(function (r) { if (o[r[key]] != null) o[r[key]]++; });
    return o;
  }

  /* program: اسم برنامج للتصفية، أو "" لكل البرامج */
  function compute(rows, C, domain) {
    var all = (rows || []).filter(function (r) { return validRow(r, C); });
    var list = domain ? all.filter(function (r) { return r.domain === domain; }) : all;
    var S = flat(C);

    var statements = S.map(function (s, i) {
      var counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, vals = [];
      list.forEach(function (r) { counts[r.q[i]]++; vals.push(r.q[i]); });
      var n = vals.length;
      return { index: i, text: s.text, axis: s.axis, n: n, counts: counts, mean: mean(vals),
               agreePct: n ? Math.round((counts[4] + counts[5]) / n * 100) : 0 };
    });

    var axes = C.AXES.map(function (ax, ai) {
      var ms = statements.filter(function (s) { return s.axis === ai; }).map(function (s) { return s.mean; });
      return { key: ax.key, label: ax.label, icon: ax.icon, mean: mean(ms) };
    });

    var overallMean = list.length ? mean(list.map(function (r) { return mean(r.q); })) : null;
    var satisfaction = mean(list.map(function (r) { return r.overall; }));

    var recCodes = C.RECOMMEND.map(function (x) { return x.code; });
    var rec = countBy(list, "rec", recCodes);
    var roleCounts = countBy(list, "role", C.ROLES.map(function (x) { return x.code; }));
    var expCounts = countBy(list, "exp", C.EXPERIENCE.map(function (x) { return x.code; }));

    /* مقارنة البرامج (دائمًا على كل الإجابات، ولا تتأثر بالتصفية) */
    var progMap = {};
    all.forEach(function (r) { (progMap[r.domain] = progMap[r.domain] || []).push(r); });
    var domLabel = {}; C.DOMAINS.forEach(function (x) { domLabel[x.code] = x.label; });
    var programs = Object.keys(progMap).map(function (code) {
      var rs = progMap[code];
      return {
        code: code, name: domLabel[code] || code, n: rs.length,
        mean: mean(rs.map(function (r) { return mean(r.q); })),
        satisfaction: mean(rs.map(function (r) { return r.overall; })),
        recYesPct: Math.round(rs.filter(function (r) { return r.rec === "yes"; }).length / rs.length * 100),
        axes: C.AXES.map(function (ax, ai) {
          var idx = []; S.forEach(function (s, i) { if (s.axis === ai) idx.push(i); });
          return mean(rs.map(function (r) { return mean(idx.map(function (i) { return r.q[i]; })); }));
        })
      };
    }).sort(function (a, b) { return (b.mean || 0) - (a.mean || 0); });

    var days = {};
    list.forEach(function (r) { var d = String(r.t).slice(0, 10); days[d] = (days[d] || 0) + 1; });
    var perDay = Object.keys(days).sort().map(function (d) { return { day: d, count: days[d] }; });

    var withData = statements.filter(function (s) { return s.mean != null; });
    var top = withData.slice().sort(function (a, b) { return b.mean - a.mean; });
    var bottom = withData.slice().sort(function (a, b) { return a.mean - b.mean; });

    return {
      n: list.length, total: all.length, statements: statements, axes: axes,
      overallMean: overallMean, satisfaction: satisfaction, rec: rec,
      roleCounts: roleCounts, expCounts: expCounts, programs: programs, perDay: perDay,
      top: top, bottom: bottom,
      lastTime: list.length ? list.map(function (r) { return String(r.t); }).sort().pop() : ""
    };
  }

  function csvCell(v) {
    var s = String(v == null ? "" : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;           // حماية من الصيغ
    return '"' + s.replace(/"/g, '""') + '"';
  }

  function toCSV(rows, C) {
    var S = flat(C);
    var domL = {}, roleL = {}, expL = {}, recL = {};
    C.DOMAINS.forEach(function (x) { domL[x.code] = x.label; });
    C.ROLES.forEach(function (x) { roleL[x.code] = x.label; });
    C.EXPERIENCE.forEach(function (x) { expL[x.code] = x.label; });
    C.RECOMMEND.forEach(function (x) { recL[x.code] = x.label; });
    var head = ["التاريخ", "مجال البرنامج", "نوع البرنامج (آخر)", "الوظيفة", "الخبرة"]
      .concat(S.map(function (s, i) { return "س" + (i + 1) + ": " + s.text; }))
      .concat(["التقييم العام", "التوصية"])
      .concat(C.OPEN_QUESTIONS.map(function (q) { return q.label; }));
    var lines = [head.map(csvCell).join(",")];
    (rows || []).filter(function (r) { return validRow(r, C); }).forEach(function (r) {
      var line = [r.t, domL[r.domain] || r.domain, r.other || "", roleL[r.role] || r.role, expL[r.exp] || r.exp]
        .concat(r.q).concat([r.overall, recL[r.rec] || r.rec])
        .concat(C.OPEN_QUESTIONS.map(function (q, i) { return (r.open && r.open[i]) || ""; }));
      lines.push(line.map(csvCell).join(","));
    });
    return "﻿" + lines.join("\r\n");
  }

  var api = { flat: flat, validRow: validRow, compute: compute, toCSV: toCSV, mean: mean };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SurveyAnalysis = api;
})(typeof window !== "undefined" ? window : this);
