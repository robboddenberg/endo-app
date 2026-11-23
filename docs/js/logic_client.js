/* ==========================================================================
   Endo-App Client-Side Analyse-Engine & 90-Tage Demo-Generator (ES6)
   1:1 Spiegelung von backend/app/logic.py fuer den serverlosen PWA-Betrieb.
   ========================================================================== */
(function (global) {
  "use strict";

  const LAG_OFFSETS = [
    { hours: 0, days: 0, label: "t+0h" },
    { hours: 24, days: 1, label: "t+24h" },
    { hours: 48, days: 2, label: "t+48h" },
    { hours: 72, days: 3, label: "t+72h" },
  ];

  const PHASE_IMPULSES = {
    menstruation:
      "Zyklusphase Menstruation: In den ersten Zyklustagen zeigen sich häufiger höhere Schmerz- und Entzündungsscores. Plane wenn möglich ruhige Phasen und Wärme ein.",
    follicular:
      "Zyklusphase Follikelphase: Erfahrungsgemäß steigen die Energiewerte in diesem Abschnitt häufig wieder an. Gut geeignet für gleichmäßige, moderate Bewegung.",
    ovulation:
      "Zyklusphase Ovulation: Rund um die Zyklusmitte treten teilweise punktuelle Unterbauch-Signale auf. Beobachte dein eigenes Belastungsgefühl aufmerksam.",
    luteal:
      "Zyklusphase Lutealphase: In der zweiten Zyklushälfte nehmen Spannung und Wärmebedürfnis oft zu. Pacing und regelmäßige Pausen können entlastend wirken.",
  };

  const PHASE_LABELS_DE = {
    menstruation: "Menstruation",
    follicular: "Follikelphase",
    ovulation: "Ovulation",
    luteal: "Lutealphase",
  };

  function toIsoDateStr(dateObj) {
    const y = dateObj.getUTCFullYear();
    const m = String(dateObj.getUTCMonth() + 1).padStart(2, "0");
    const d = String(dateObj.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function parseIsoDateUTC(str) {
    if (!str || typeof str !== "string") return null;
    const part = str.slice(0, 10);
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(part);
    if (!match) return null;
    const dt = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  function addDaysIso(isoStr, days) {
    const dt = parseIsoDateUTC(isoStr);
    if (!dt) return null;
    dt.setUTCDate(dt.getUTCDate() + days);
    return toIsoDateStr(dt);
  }

  function safeNum(val, fallback = 0) {
    const n = Number(val);
    return Number.isFinite(n) ? n : fallback;
  }

  function mean(arr) {
    if (!arr || !arr.length) return 0;
    return arr.reduce((acc, v) => acc + v, 0) / arr.length;
  }

  function round2(val) {
    return Math.round((val + Number.EPSILON) * 100) / 100;
  }

  function formatSigned(val, decimals = 1) {
    const num = Number(val) || 0;
    const sign = num >= 0 ? "+" : "";
    return `${sign}${num.toFixed(decimals)}`;
  }

  function extractTags(log) {
    const seen = new Set();
    const out = [];
    ["nutrition_tags", "digestion_tags", "tags"].forEach((field) => {
      const list = log && Array.isArray(log[field]) ? log[field] : [];
      list.forEach((raw) => {
        if (typeof raw === "string" && raw.trim()) {
          const norm = raw.trim().toLowerCase();
          if (!seen.has(norm)) {
            seen.add(norm);
            out.push(norm);
          }
        }
      });
    });
    if (log && typeof log.activity_type === "string" && log.activity_type.trim()) {
      const act = log.activity_type.trim().toLowerCase();
      if (!seen.has(act)) {
        seen.add(act);
        out.push(act);
      }
    }
    return out;
  }

  function analyzeLagCorrelations(dailyLogs, minOccurrences = 3) {
    if (!Array.isArray(dailyLogs) || !dailyLogs.length) return [];

    const logsByDate = new Map();
    dailyLogs.forEach((entry) => {
      const dt = parseIsoDateUTC(entry && entry.date);
      if (dt) {
        logsByDate.set(toIsoDateStr(dt), entry);
      }
    });
    if (!logsByDate.size) return [];

    const sortedDates = Array.from(logsByDate.keys()).sort();
    const allLogs = sortedDates.map((d) => logsByDate.get(d));
    const tagsByDate = new Map();
    const uniqueTagsSet = new Set();

    sortedDates.forEach((d) => {
      const tags = extractTags(logsByDate.get(d));
      tagsByDate.set(d, tags);
      tags.forEach((t) => uniqueTagsSet.add(t));
    });

    const uniqueTags = Array.from(uniqueTagsSet).sort();
    const results = [];

    uniqueTags.forEach((tag) => {
      const triggerDates = sortedDates.filter((d) => tagsByDate.get(d).includes(tag));

      LAG_OFFSETS.forEach((offset) => {
        const exposedDates = new Set();
        const exposedLogs = [];

        triggerDates.forEach((trigDate) => {
          const targetDate = addDaysIso(trigDate, offset.days);
          if (targetDate && logsByDate.has(targetDate) && !exposedDates.has(targetDate)) {
            exposedDates.add(targetDate);
            exposedLogs.push(logsByDate.get(targetDate));
          }
        });

        const nCount = exposedLogs.length;
        if (nCount < minOccurrences) return;

        let baselineLogs = sortedDates
          .filter((d) => !exposedDates.has(d))
          .map((d) => logsByDate.get(d));
        if (!baselineLogs.length) {
          baselineLogs = allLogs;
        }

        const avgPain = round2(mean(exposedLogs.map((x) => safeNum(x.pain_score))));
        const avgInfl = round2(mean(exposedLogs.map((x) => safeNum(x.inflammation_score))));
        const avgEnergy = round2(mean(exposedLogs.map((x) => safeNum(x.energy_score))));

        const basePain = round2(mean(baselineLogs.map((x) => safeNum(x.pain_score))));
        const baseInfl = round2(mean(baselineLogs.map((x) => safeNum(x.inflammation_score))));
        const baseEnergy = round2(mean(baselineLogs.map((x) => safeNum(x.energy_score))));

        const painDelta = round2(avgPain - basePain);
        const inflDelta = round2(avgInfl - baseInfl);
        const energyDelta = round2(avgEnergy - baseEnergy);
        const maxAbsDelta = round2(Math.max(Math.abs(painDelta), Math.abs(inflDelta)));

        const neutralHint =
          `Verzögerungs-Detektiv: An Tagen (${offset.label}) nach '${tag}' lag dein ` +
          `Schmerzscore im Schnitt ${formatSigned(painDelta, 1)} Punkte und dein Entzündungsscore ` +
          `${formatSigned(inflDelta, 1)} Punkte im Vergleich zur Baseline (n=${nCount} Einträge). ` +
          "Beobachte dies weiter.";

        results.push({
          tag,
          offset_hours: offset.hours,
          offset_days: offset.days,
          offset_label: offset.label,
          n: nCount,
          avg_pain: avgPain,
          baseline_pain: basePain,
          pain_delta: painDelta,
          avg_inflammation: avgInfl,
          baseline_inflammation: baseInfl,
          inflammation_delta: inflDelta,
          avg_energy: avgEnergy,
          baseline_energy: baseEnergy,
          energy_delta: energyDelta,
          max_abs_delta: maxAbsDelta,
          neutral_hint: neutralHint,
        });
      });
    });

    results.sort((a, b) => {
      if (b.max_abs_delta !== a.max_abs_delta) return b.max_abs_delta - a.max_abs_delta;
      if (b.n !== a.n) return b.n - a.n;
      if (a.tag !== b.tag) return a.tag.localeCompare(b.tag);
      return a.offset_hours - b.offset_hours;
    });

    return results;
  }

  function determineCyclePhase(cycleDay, cycleLength = 28) {
    const normLen = Math.max(15, Math.min(60, Math.round(safeNum(cycleLength, 28) || 28)));
    const day = Math.max(1, Math.round(safeNum(cycleDay, 1) || 1));

    if (day <= 5) return "menstruation";
    const ovuCenter = Math.max(7, normLen - 14);
    if (day >= ovuCenter - 1 && day <= ovuCenter + 1) return "ovulation";
    if (day < ovuCenter - 1) return "follicular";
    return "luteal";
  }

  function calculateCycleStats(dailyLogs, cycleAverageLength = 28) {
    const cycleLength = Math.max(15, Math.min(60, Math.round(safeNum(cycleAverageLength, 28) || 28)));
    const valid = [];

    (Array.isArray(dailyLogs) ? dailyLogs : []).forEach((entry) => {
      const dt = parseIsoDateUTC(entry && entry.date);
      if (dt) {
        valid.push({ iso: toIsoDateStr(dt), log: entry });
      }
    });

    valid.sort((a, b) => a.iso.localeCompare(b.iso));

    if (!valid.length) {
      return {
        cycle_average_length: cycleLength,
        current_cycle_day: null,
        current_phase: null,
        current_phase_label: "Keine Daten",
        latest_date: null,
        per_cycle_day_averages: {},
        phase_averages: {},
        daily_impulse:
          "Noch keine täglichen Einträge vorhanden. Erfasse deinen ersten Tag, um persönliche Zyklusmuster sichtbar zu machen.",
      };
    }

    const latest = valid[valid.length - 1];
    const currentCycleDay = Math.max(1, Math.round(safeNum(latest.log.cycle_day, 1) || 1));
    const currentPhase = determineCyclePhase(currentCycleDay, cycleLength);

    const byDay = {};
    const byPhase = { menstruation: [], follicular: [], ovulation: [], luteal: [] };

    valid.forEach(({ log }) => {
      const dInt = Math.max(1, Math.round(safeNum(log.cycle_day, 1) || 1));
      const ph = determineCyclePhase(dInt, cycleLength);
      if (!byDay[dInt]) byDay[dInt] = [];
      byDay[dInt].push(log);
      if (!byPhase[ph]) byPhase[ph] = [];
      byPhase[ph].push(log);
    });

    const perCycleDayAverages = {};
    Object.keys(byDay)
      .map(Number)
      .sort((a, b) => a - b)
      .forEach((dInt) => {
        const bucket = byDay[dInt];
        perCycleDayAverages[dInt] = {
          cycle_day: dInt,
          phase: determineCyclePhase(dInt, cycleLength),
          count: bucket.length,
          avg_pain: round2(mean(bucket.map((x) => safeNum(x.pain_score)))),
          avg_inflammation: round2(mean(bucket.map((x) => safeNum(x.inflammation_score)))),
          avg_energy: round2(mean(bucket.map((x) => safeNum(x.energy_score)))),
        };
      });

    const phaseAverages = {};
    ["menstruation", "follicular", "ovulation", "luteal"].forEach((ph) => {
      const bucket = byPhase[ph] || [];
      if (bucket.length) {
        phaseAverages[ph] = {
          count: bucket.length,
          avg_pain: round2(mean(bucket.map((x) => safeNum(x.pain_score)))),
          avg_inflammation: round2(mean(bucket.map((x) => safeNum(x.inflammation_score)))),
          avg_energy: round2(mean(bucket.map((x) => safeNum(x.energy_score)))),
        };
      }
    });

    const pStat = phaseAverages[currentPhase];
    const baseImpulse = PHASE_IMPULSES[currentPhase] || "";
    const dailyImpulse = pStat
      ? `${baseImpulse} Bisheriger Schnitt in dieser Phase (n=${pStat.count}): Schmerz ${pStat.avg_pain.toFixed(1)}/10, Entzündung ${pStat.avg_inflammation.toFixed(1)}/10, Energie ${pStat.avg_energy.toFixed(1)}/10.`
      : baseImpulse;

    return {
      cycle_average_length: cycleLength,
      current_cycle_day: currentCycleDay,
      current_phase: currentPhase,
      current_phase_label: PHASE_LABELS_DE[currentPhase] || currentPhase,
      latest_date: latest.iso,
      per_cycle_day_averages: perCycleDayAverages,
      phase_averages: phaseAverages,
      daily_impulse: dailyImpulse,
    };
  }

  function evaluateExperiment(experiment, dailyLogs) {
    if (!experiment || typeof experiment !== "object") return {};
    const startDt = parseIsoDateUTC(experiment.start_date);
    if (!startDt) return Object.assign({}, experiment);

    const datedLogs = [];
    (Array.isArray(dailyLogs) ? dailyLogs : []).forEach((entry) => {
      const dt = parseIsoDateUTC(entry && entry.date);
      if (dt) datedLogs.push({ dt, iso: toIsoDateStr(dt), log: entry });
    });
    datedLogs.sort((a, b) => a.dt - b.dt);

    const latestDt = datedLogs.length ? datedLogs[datedLogs.length - 1].dt : new Date();
    const rawEndDt = parseIsoDateUTC(experiment.end_date);
    let effectiveEndDt = rawEndDt && rawEndDt >= startDt ? rawEndDt : latestDt;
    if (effectiveEndDt < startDt) effectiveEndDt = new Date(startDt.getTime());

    const msPerDay = 86400000;
    const durationDays = Math.max(1, Math.round((effectiveEndDt - startDt) / msPerDay) + 1);

    const baselineEnd = new Date(startDt.getTime() - msPerDay);
    const baselineStart = new Date(startDt.getTime() - durationDays * msPerDay);

    const baselineLogs = datedLogs
      .filter((x) => x.dt >= baselineStart && x.dt <= baselineEnd)
      .map((x) => x.log);
    const expLogs = datedLogs
      .filter((x) => x.dt >= startDt && x.dt <= effectiveEndDt)
      .map((x) => x.log);

    const fbBase = experiment.baseline_metrics || {};
    const fbExp = experiment.experiment_metrics || {};

    const baselineMetrics = baselineLogs.length
      ? {
          avg_pain: round2(mean(baselineLogs.map((x) => safeNum(x.pain_score)))),
          avg_inflammation: round2(mean(baselineLogs.map((x) => safeNum(x.inflammation_score)))),
          avg_energy: round2(mean(baselineLogs.map((x) => safeNum(x.energy_score)))),
        }
      : {
          avg_pain: round2(safeNum(fbBase.avg_pain)),
          avg_inflammation: round2(safeNum(fbBase.avg_inflammation)),
          avg_energy: round2(safeNum(fbBase.avg_energy)),
        };

    const experimentMetrics = expLogs.length
      ? {
          avg_pain: round2(mean(expLogs.map((x) => safeNum(x.pain_score)))),
          avg_inflammation: round2(mean(expLogs.map((x) => safeNum(x.inflammation_score)))),
          avg_energy: round2(mean(expLogs.map((x) => safeNum(x.energy_score)))),
        }
      : {
          avg_pain: round2(safeNum(fbExp.avg_pain)),
          avg_inflammation: round2(safeNum(fbExp.avg_inflammation)),
          avg_energy: round2(safeNum(fbExp.avg_energy)),
        };

    const painDelta = round2(experimentMetrics.avg_pain - baselineMetrics.avg_pain);
    const inflDelta = round2(experimentMetrics.avg_inflammation - baselineMetrics.avg_inflammation);
    const energyDelta = round2(experimentMetrics.avg_energy - baselineMetrics.avg_energy);

    const title = experiment.title || "Experiment";
    const neutralSummary =
      `Experiment '${title}' (${durationDays} Tage): Schmerz ${formatSigned(painDelta, 2)}, ` +
      `Entzündung ${formatSigned(inflDelta, 2)}, Energie ${formatSigned(energyDelta, 2)} ` +
      "gegenüber dem Vergleichszeitraum davor.";

    return Object.assign({}, experiment, {
      duration_days: durationDays,
      baseline_window: {
        start_date: toIsoDateStr(baselineStart),
        end_date: toIsoDateStr(baselineEnd),
        count: baselineLogs.length,
      },
      experiment_window: {
        start_date: toIsoDateStr(startDt),
        end_date: toIsoDateStr(effectiveEndDt),
        count: expLogs.length,
      },
      baseline_metrics: baselineMetrics,
      experiment_metrics: experimentMetrics,
      deltas: {
        pain_delta: painDelta,
        inflammation_delta: inflDelta,
        energy_delta: energyDelta,
      },
      neutral_summary: neutralSummary,
    });
  }

  function getAnnualHeatmapData(dailyLogs, year = null) {
    const items = [];
    (Array.isArray(dailyLogs) ? dailyLogs : []).forEach((entry) => {
      const dt = parseIsoDateUTC(entry && entry.date);
      if (!dt) return;
      if (year !== null && year !== undefined && dt.getUTCFullYear() !== Number(year)) return;

      const pain = safeNum(entry.pain_score);
      const infl = safeNum(entry.inflammation_score);
      const energy = safeNum(entry.energy_score);
      const combined = Math.max(pain, infl);

      let bucket = 0;
      let severity = "none";
      if (combined <= 0) {
        bucket = 0;
        severity = "none";
      } else if (combined <= 3) {
        bucket = 1;
        severity = "mild";
      } else if (combined <= 6) {
        bucket = 2;
        severity = "moderate";
      } else {
        bucket = 3;
        severity = "severe";
      }

      items.push({
        date: toIsoDateStr(dt),
        pain_score: Math.round(pain),
        inflammation_score: Math.round(infl),
        energy_score: Math.round(energy),
        score: Math.round(combined),
        bucket,
        severity,
        cycle_phase: entry.cycle_phase || null,
      });
    });

    items.sort((a, b) => a.date.localeCompare(b.date));
    return items;
  }

  function generateClientDemoData(referenceDateStr = null) {
    const refDt = parseIsoDateUTC(referenceDateStr) || new Date();
    const todayUtc = new Date(Date.UTC(refDt.getUTCFullYear(), refDt.getUTCMonth(), refDt.getUTCDate()));
    const startDt = new Date(todayUtc.getTime() - 89 * 86400000);

    // Deterministischer LCG Zufallsgenerator (Seed 42)
    let seed = 42;
    function nextRand() {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    }
    function randUniform(min, max) {
      return min + nextRand() * (max - min);
    }
    function clampInt(val, low = 0, high = 10) {
      return Math.max(low, Math.min(high, Math.round(val)));
    }

    const nutritionPool = [
      "antientzündlich",
      "warmes Frühstück",
      "hafer",
      "beeren",
      "gemüsesuppe",
      "fencheltee",
    ];
    const activityPool = [
      ["Spaziergang", "mild"],
      ["Yoga", "mild"],
      ["Dehnen", "mild"],
      ["Pilates", "moderat"],
      ["Ruhetag", "none"],
    ];
    const wellbeingNotes = {
      menstruation: "Ruhiger Tag mit Wärmflasche und viel Ruhe.",
      follicular: "Leichteres Körpergefühl und spürbar mehr Fokus.",
      ovulation: "Mittleres Energielevel, leichtes Ziehen im Unterbauch.",
      luteal: "Höheres Wärmebedürfnis, bewusstes Pacing eingeplant.",
    };

    const glutenTriggerDays = new Set();
    const stressTriggerDays = new Set();
    for (let i = 0; i < 85; i++) {
      if (i % 8 === 2) glutenTriggerDays.add(i);
      if (i % 9 === 4) stressTriggerDays.add(i);
    }

    const dailyLogs = [];
    for (let idx = 0; idx < 90; idx++) {
      const curDt = new Date(startDt.getTime() + idx * 86400000);
      const dateIso = toIsoDateStr(curDt);
      const cycleDay = (idx % 28) + 1;
      const cyclePhase = determineCyclePhase(cycleDay, 28);

      let basePain = 3;
      let baseInfl = 3;
      let baseEnergy = 6;

      if (cyclePhase === "menstruation") {
        basePain = 5.5 + randUniform(-0.6, 0.9);
        baseInfl = 5.0 + randUniform(-0.5, 0.8);
        baseEnergy = 4.0 + randUniform(-0.6, 0.8);
      } else if (cyclePhase === "follicular") {
        basePain = 2.0 + randUniform(-0.5, 0.7);
        baseInfl = 2.2 + randUniform(-0.4, 0.7);
        baseEnergy = 7.4 + randUniform(-0.6, 0.7);
      } else if (cyclePhase === "ovulation") {
        basePain = 3.2 + randUniform(-0.4, 0.7);
        baseInfl = 3.3 + randUniform(-0.4, 0.7);
        baseEnergy = 7.0 + randUniform(-0.5, 0.6);
      } else {
        const prog = (cycleDay - 16) / 12.0;
        basePain = 3.1 + prog * 1.6 + randUniform(-0.4, 0.6);
        baseInfl = 3.3 + prog * 1.5 + randUniform(-0.4, 0.6);
        baseEnergy = 5.6 - prog * 1.1 + randUniform(-0.5, 0.5);
      }

      const nutritionTags = [
        nutritionPool[idx % nutritionPool.length],
        nutritionPool[(idx + 2) % nutritionPool.length],
      ];
      let digestionTags = ["regelmäßig"];
      let digestionScore = "normal";
      let nutritionNote = "Bekömmliche, warme Mahlzeiten über den Tag verteilt.";

      if (glutenTriggerDays.has(idx)) {
        nutritionTags.push("glutenhaltig");
        nutritionNote = "Unterwegs Weizenbrötchen gegessen.";
      }
      if (stressTriggerDays.has(idx)) {
        nutritionTags.push("stress");
        digestionTags.push("stress");
      }

      if (idx >= 45 && idx <= 65) {
        if (!nutritionTags.includes("omega3")) nutritionTags.push("omega3");
        if (!nutritionTags.includes("antientzündlich")) nutritionTags.push("antientzündlich");
        basePain -= 1.4;
        baseInfl -= 1.5;
        baseEnergy += 1.3;
      }

      const inActiveWindow = idx >= 76;
      const magnesiumTaken = inActiveWindow || idx % 3 === 0;
      if (inActiveWindow) {
        basePain -= 0.7;
        baseInfl -= 0.6;
        baseEnergy += 0.6;
      }

      let bloatingLevel = clampInt(baseInfl * 0.8 + randUniform(-0.5, 0.8), 0, 10);
      if (glutenTriggerDays.has(idx - 1)) {
        basePain += 3.2;
        bloatingLevel = 8;
        digestionScore = "unruhig";
        digestionTags = ["blähbauch", "träge"];
      }
      if (stressTriggerDays.has(idx - 2)) {
        baseInfl += 3.3;
        digestionTags.push("verspannt");
      }

      let [activityType, activityIntensity] = activityPool[(idx + cycleDay) % activityPool.length];
      if (cyclePhase === "menstruation" && activityIntensity === "moderat") {
        activityType = "Ruhetag";
        activityIntensity = "none";
      }

      const painScore = clampInt(basePain, 0, 10);
      const inflScore = clampInt(baseInfl, 0, 10);
      const energyScore = clampInt(baseEnergy, 1, 10);

      dailyLogs.push({
        id: `log_${dateIso}`,
        date: dateIso,
        cycle_day: cycleDay,
        cycle_phase: cyclePhase,
        pain_score: painScore,
        inflammation_score: inflScore,
        energy_score: energyScore,
        nutrition_tags: Array.from(new Set(nutritionTags)),
        nutrition_note: nutritionNote,
        activity_type: activityType,
        activity_intensity: activityIntensity,
        digestion_score: digestionScore,
        digestion_tags: Array.from(new Set(digestionTags)),
        wellbeing_note: wellbeingNotes[cyclePhase],
        general_note: `Zyklustag ${cycleDay}: Schmerz ${painScore}/10, Entzündung ${inflScore}/10.`,
        custom_values: {
          cf_bloating_level: bloatingLevel,
          cf_magnesium: magnesiumTaken,
        },
      });
    }

    function dateAtIndex(i) {
      return dailyLogs[Math.max(0, Math.min(dailyLogs.length - 1, i))].date;
    }

    const flareUps = [
      {
        id: `flare_${dateAtIndex(15)}_01`,
        start_timestamp: `${dateAtIndex(15)}T07:45:00Z`,
        end_timestamp: `${dateAtIndex(15)}T13:15:00Z`,
        initial_pain_score: 8,
        peak_pain_score: 9,
        body_locations: ["Unterleib zentriert", "Rücken lendenübergreifend"],
        applied_measures: ["Wärmflasche", "Kamillentee", "Flachlegen"],
        notes: "Starker Schub am Morgen während der späten Lutealphase.",
      },
      {
        id: `flare_${dateAtIndex(41)}_02`,
        start_timestamp: `${dateAtIndex(41)}T14:20:00Z`,
        end_timestamp: `${dateAtIndex(41)}T19:00:00Z`,
        initial_pain_score: 7,
        peak_pain_score: 8,
        body_locations: ["Unterleib rechts", "Beckenboden"],
        applied_measures: ["Wärmepflaster", "Atemübung", "Kurzer Spaziergang danach"],
        notes: "Deutliches Ziehen am Nachmittag, mit Wärme gut begleitet.",
      },
      {
        id: `flare_${dateAtIndex(78)}_03`,
        start_timestamp: `${dateAtIndex(78)}T09:10:00Z`,
        end_timestamp: `${dateAtIndex(78)}T15:30:00Z`,
        initial_pain_score: 7,
        peak_pain_score: 9,
        body_locations: ["Unterleib komplett", "Unterer Rücken", "Oberschenkel"],
        applied_measures: ["Wärmflasche", "Fencheltee", "Beine hochlagern"],
        notes: "Stärkeres Druckgefühl am ersten Zyklustag.",
      },
    ];

    const rawExperiments = [
      {
        id: "exp_omega3_01",
        title: "3 Wochen Omega-3 (Algenöl)",
        target_hypothesis: "Beobachtung der Schmerz- und Entzündungswerte während 21 Tagen Omega-3-Betonung",
        start_date: dateAtIndex(45),
        end_date: dateAtIndex(65),
        status: "completed",
      },
      {
        id: "exp_waerme_02",
        title: "Abendliche Wärme- und Magnesium-Routine",
        target_hypothesis: "Beobachtung von Abendspannung und Energieverlauf über 14 Tage",
        start_date: dateAtIndex(76),
        end_date: null,
        status: "active",
      },
    ];

    const selfExperiments = rawExperiments.map((exp) => evaluateExperiment(exp, dailyLogs));

    return {
      version: "1.0.0",
      revision: 1,
      last_updated: new Date().toISOString(),
      settings: {
        pin_hash: null,
        pin_enabled: false,
        cycle_average_length: 28,
        theme_mode: "light",
        custom_fields: [
          {
            id: "cf_bloating_level",
            label: "Blähbauch-Intensität",
            type: "scale_10",
            enabled: true,
          },
          {
            id: "cf_magnesium",
            label: "Magnesium genommen",
            type: "boolean",
            enabled: true,
          },
        ],
        study_radar: {
          topic_clusters: [
            "endometriosis",
            "inflammation",
            "peritoneal_abdominal",
            "diagnostic_gap",
          ],
          custom_queries: [],
        },
      },
      daily_logs: dailyLogs,
      flare_ups: flareUps,
      self_experiments: selfExperiments,
      ampel_items: [
        {
          id: "amp_1",
          category: "nutrition",
          name: "Glutenhaltiges Brot",
          status: "red",
          notes: "In eigenen Notizen häufig 24h danach mit Blähbauch und erhöhtem Schmerzscore dokumentiert.",
        },
        {
          id: "amp_2",
          category: "nutrition",
          name: "Gekochtes Gemüse & Kurkuma-Suppe",
          status: "green",
          notes: "Im Alltag durchgehend gut verträglich dokumentiert.",
        },
        {
          id: "amp_3",
          category: "activity",
          name: "Intensives HIIT-Training",
          status: "yellow",
          notes: "In der Follikelphase gut verträglich, in der späten Lutealphase oft anstrengender.",
        },
        {
          id: "amp_4",
          category: "activity",
          name: "Sanftes Yin-Yoga & Spaziergang",
          status: "green",
          notes: "Über alle Zyklusphasen hinweg angenehm und ausgleichend.",
        },
        {
          id: "amp_5",
          category: "nutrition",
          name: "Stark verarbeitete Fertigsnacks",
          status: "red",
          notes: "Häufig mit unruhiger Verdauung am Folgetag vermerkt.",
        },
      ],
      lab_entries: [
        {
          id: "lab_1",
          date: dateAtIndex(12),
          parameter: "CRP",
          value: 6.8,
          unit: "mg/l",
          reference_range: "< 5.0",
          notes: "Leicht über Referenzbereich während einer akuten Phase.",
        },
        {
          id: "lab_2",
          date: dateAtIndex(72),
          parameter: "CRP",
          value: 2.4,
          unit: "mg/l",
          reference_range: "< 5.0",
          notes: "Im Referenzbereich.",
        },
        {
          id: "lab_3",
          date: dateAtIndex(12),
          parameter: "Ferritin",
          value: 18.0,
          unit: "µg/l",
          reference_range: "30 - 200",
          notes: "Erniedrigt dokumentiert, beim nächsten Termin ansprechen.",
        },
        {
          id: "lab_4",
          date: dateAtIndex(72),
          parameter: "Ferritin",
          value: 29.0,
          unit: "µg/l",
          reference_range: "30 - 200",
          notes: "Anstieg gegenüber Vorwert sichtbar.",
        },
        {
          id: "lab_5",
          date: dateAtIndex(12),
          parameter: "Vitamin D",
          value: 22.0,
          unit: "ng/ml",
          reference_range: "30 - 60",
          notes: "Niedriger Ausgangswert im Spätherbst.",
        },
        {
          id: "lab_6",
          date: dateAtIndex(72),
          parameter: "Vitamin D",
          value: 36.0,
          unit: "ng/ml",
          reference_range: "30 - 60",
          notes: "Innerhalb des Referenzbereichs.",
        },
      ],
      medical_notes: [
        {
          id: "doc_1",
          date: dateAtIndex(20),
          doctor_type: "Gynäkologie",
          summary:
            "Ultraschallkontrolle unauffällig. Hinweis erhalten, zyklische Beschwerdespitzen strukturiert zu dokumentieren und Beckenbodentherapie zu prüfen.",
          file_ref: null,
        },
        {
          id: "doc_2",
          date: dateAtIndex(68),
          doctor_type: "Endometriose-Sprechstunde",
          summary:
            "Ausführliches Anamnesegespräch anhand des eigenen Symptomverlaufs. Verlaufskontrolle in 3 Monaten vereinbart.",
          file_ref: null,
        },
      ],
      doctor_questions: [
        {
          id: "q_1",
          created_date: dateAtIndex(75),
          question: "Ist ein Rezept für spezialisierte Beckenboden-Physiotherapie sinnvoll?",
          is_resolved: false,
        },
        {
          id: "q_2",
          created_date: dateAtIndex(80),
          question: "Wann sollte der Ferritin-Wert zur Verlaufskontrolle erneut bestimmt werden?",
          is_resolved: false,
        },
        {
          id: "q_3",
          created_date: dateAtIndex(84),
          question:
            "Welche diagnostischen Schritte sind bei wiederkehrenden Schüben trotz unauffälligem Ultraschall üblich?",
          is_resolved: false,
        },
      ],
      studies: [
        {
          id: "pub_3459102",
          pmid: "3459102",
          pub_date: "2023-08-15",
          title: "Anti-inflammatory dietary interventions in endometriosis management",
          summary_de:
            "Beobachtungsstudie zu Omega-3-Fettsäuren und Polyphenolen im Zusammenhang mit dokumentierten Schmerz- und Entzündungswerten bei Endometriose.",
          url: "https://pubmed.ncbi.nlm.nih.gov/3459102/",
          is_bookmarked: true,
          matched_keywords: ["endometriosis", "chronic inflammation endometriosis"],
          topic_cluster: "inflammation",
        },
        {
          id: "pub_36874219",
          pmid: "36874219",
          pub_date: "2024-02-10",
          title: "Peritoneal immune environment and visceral pain mechanisms in chronic pelvic pain",
          summary_de:
            "Übersichtsarbeit über peritoneale Entzündungsprozesse, Bauchfellreizungen und viszerale Schmerzweiterleitung im kleinen Becken.",
          url: "https://pubmed.ncbi.nlm.nih.gov/36874219/",
          is_bookmarked: true,
          matched_keywords: ["peritoneal inflammation abdominal pain", "visceral hypersensitivity"],
          topic_cluster: "peritoneal_abdominal",
        },
        {
          id: "pub_35124890",
          pmid: "35124890",
          pub_date: "2023-11-03",
          title: "Diagnostic delay and negative routine imaging in superficial and deep pelvic pain",
          summary_de:
            "Analyse zur Diagnostik-Lücke bei chronischem Beckenschmerz trotz unauffälliger Standardbildgebung und zur Rolle strukturierter Symptomtagebücher.",
          url: "https://pubmed.ncbi.nlm.nih.gov/35124890/",
          is_bookmarked: false,
          matched_keywords: ["diagnostic delay endometriosis", "negative imaging endometriosis"],
          topic_cluster: "diagnostic_gap",
        },
        {
          id: "pub_37219045",
          pmid: "37219045",
          pub_date: "2024-05-19",
          title: "Gut microbiome patterns, mast cell activity, and abdominal bloating",
          summary_de:
            "Explorative Untersuchung zu Zusammenhängen zwischen Darmmikrobiom, Mastzell-Aktivierung und zyklusabhängigem Blähbauch.",
          url: "https://pubmed.ncbi.nlm.nih.gov/37219045/",
          is_bookmarked: false,
          matched_keywords: ["mast cell gut microbiome", "chronic inflammation endometriosis"],
          topic_cluster: "inflammation",
        },
        {
          id: "pub_33981452",
          pmid: "33981452",
          pub_date: "2023-06-28",
          title: "Cycle-adapted movement and autonomic stress regulation in pelvic pain",
          summary_de:
            "Vergleichsbeobachtung zu moderater Bewegung, Entspannungsroutinen und zyklusabhängigem Belastungsempfinden.",
          url: "https://pubmed.ncbi.nlm.nih.gov/33981452/",
          is_bookmarked: true,
          matched_keywords: ["endometriosis", "pelvic pain luteal phase"],
          topic_cluster: "endometriosis",
        },
      ],
      appointment_profiles: [
        {
          id: "app_prof_1",
          service_name: "Osteopathie / Lymphdrainage",
          zip_code: "10115",
          radius_km: 15,
          booking_url: "https://beispiel-praxis.de/termin",
          active: true,
        },
        {
          id: "app_prof_2",
          service_name: "Spezialsprechstunde Endometriose & Beckenboden",
          zip_code: "10115",
          radius_km: 25,
          booking_url: "https://beispiel-zentrum.de/sprechstunde",
          active: true,
        },
      ],
    };
  }

  global.EndoLogic = {
    PHASE_LABELS_DE,
    analyzeLagCorrelations,
    determineCyclePhase,
    calculateCycleStats,
    evaluateExperiment,
    getAnnualHeatmapData,
    generateClientDemoData,
  };
})(window);
