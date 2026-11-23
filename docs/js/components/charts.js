/* ==========================================================================
   Endo-App UI-Komponenten: Jahres-Heatmap, HTML5 Canvas Labor-Chart, Dossier
   ========================================================================== */
(function (global) {
  "use strict";

  function escapeHtml(str) {
    return String(str === null || str === undefined ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderAnnualHeatmap(containerEl, dailyLogs) {
    if (!containerEl) return;
    const heatItems = global.EndoLogic.getAnnualHeatmapData(dailyLogs);
    const byDate = new Map();
    heatItems.forEach((item) => byDate.set(item.date, item));

    // Referenzdatum: letztes Log-Datum oder heute
    let latestDt = new Date();
    if (heatItems.length) {
      const lastIso = heatItems[heatItems.length - 1].date;
      const parts = lastIso.split("-").map(Number);
      latestDt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    } else {
      latestDt = new Date(Date.UTC(latestDt.getFullYear(), latestDt.getMonth(), latestDt.getDate()));
    }

    const totalDays = 52 * 7; // 364 Tage Raster
    const startDt = new Date(latestDt.getTime() - (totalDays - 1) * 86400000);

    const cellsHtml = [];
    for (let i = 0; i < totalDays; i++) {
      const cur = new Date(startDt.getTime() + i * 86400000);
      const y = cur.getUTCFullYear();
      const m = String(cur.getUTCMonth() + 1).padStart(2, "0");
      const d = String(cur.getUTCDate()).padStart(2, "0");
      const iso = `${y}-${m}-${d}`;
      const found = byDate.get(iso);
      const bucket = found ? found.bucket : 0;
      const title = found
        ? `${iso}: Schmerz ${found.pain_score}/10, Entzündung ${found.inflammation_score}/10, Energie ${found.energy_score}/10`
        : `${iso}: Kein Eintrag`;
      cellsHtml.push(
        `<div class="heat-cell" data-bucket="${bucket}" data-date="${iso}" title="${escapeHtml(title)}"></div>`
      );
    }

    containerEl.innerHTML = cellsHtml.join("");
  }

  function renderLabCanvas(canvasEl, labEntries, selectedParameter) {
    if (!canvasEl) return;
    const ctx = canvasEl.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvasEl.getBoundingClientRect();
    const width = Math.max(280, Math.floor(rect.width || 560));
    const height = Math.max(180, Math.floor(rect.height || 210));

    canvasEl.width = width * dpr;
    canvasEl.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const bgColor = isDark ? "#2C2722" : "#FAF7F0";
    const gridColor = isDark ? "#3B342E" : "#DFD7C8";
    const textColor = isDark ? "#B8AEA2" : "#655C53";
    const mainColor = isDark ? "#F3EFE6" : "#241F1B";
    const lineColor = isDark ? "#82AC8F" : "#3A5443";
    const dotColor = isDark ? "#D46F5D" : "#8A392B";

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);

    const filtered = (Array.isArray(labEntries) ? labEntries : [])
      .filter((x) => !selectedParameter || x.parameter === selectedParameter)
      .slice()
      .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));

    if (!filtered.length) {
      ctx.fillStyle = textColor;
      ctx.font = "13px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Keine Messwerte für diesen Parameter vorhanden.", width / 2, height / 2);
      return;
    }

    const padLeft = 48;
    const padRight = 24;
    const padTop = 28;
    const padBottom = 36;
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    const values = filtered.map((x) => Number(x.value) || 0);
    const minVal = Math.min(0, ...values);
    const maxVal = Math.max(...values, 1) * 1.15;
    const unit = filtered[0].unit || "";

    // Horizontale Hilfslinien
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.fillStyle = textColor;
    ctx.font = "11px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "right";

    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      const ratio = i / steps;
      const y = padTop + plotH - ratio * plotH;
      const val = minVal + ratio * (maxVal - minVal);
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(width - padRight, y);
      ctx.stroke();
      ctx.fillText(val.toFixed(1), padLeft - 8, y + 4);
    }

    const points = filtered.map((entry, idx) => {
      const xRatio = filtered.length === 1 ? 0.5 : idx / (filtered.length - 1);
      const yRatio = (Number(entry.value) - minVal) / (maxVal - minVal || 1);
      return {
        x: padLeft + xRatio * plotW,
        y: padTop + plotH - yRatio * plotH,
        entry,
      };
    });

    // Linie zeichnen
    if (points.length > 1) {
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      points.forEach((pt, i) => {
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.stroke();
    }

    // Punkte und Beschriftungen zeichnen
    ctx.textAlign = "center";
    points.forEach((pt) => {
      ctx.fillStyle = dotColor;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 4.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = mainColor;
      ctx.font = "bold 11px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(`${pt.entry.value} ${unit}`.trim(), pt.x, pt.y - 10);

      ctx.fillStyle = textColor;
      ctx.font = "11px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(String(pt.entry.date || "").slice(5), pt.x, height - 12);
    });
  }

  function renderDoctorDossier(containerEl, state) {
    if (!containerEl || !state) return;

    const logs = (state.daily_logs || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const last30 = logs.slice(-30);
    const last90 = logs.slice(-90);

    function calcSummary(list) {
      if (!list.length) return { count: 0, pain: "0.0", infl: "0.0", energy: "0.0", highDays: 0 };
      const count = list.length;
      const pain = list.reduce((s, x) => s + Number(x.pain_score || 0), 0) / count;
      const infl = list.reduce((s, x) => s + Number(x.inflammation_score || 0), 0) / count;
      const energy = list.reduce((s, x) => s + Number(x.energy_score || 0), 0) / count;
      const highDays = list.filter((x) => Number(x.pain_score || 0) >= 7 || Number(x.inflammation_score || 0) >= 7).length;
      return {
        count,
        pain: pain.toFixed(1),
        infl: infl.toFixed(1),
        energy: energy.toFixed(1),
        highDays,
      };
    }

    const s30 = calcSummary(last30);
    const s90 = calcSummary(last90);
    const cycleStats = global.EndoLogic.calculateCycleStats(
      logs,
      state.settings && state.settings.cycle_average_length ? state.settings.cycle_average_length : 28
    );
    const correlations = global.EndoLogic.analyzeLagCorrelations(logs, 3).slice(0, 6);
    const experiments = (state.self_experiments || []).map((exp) =>
      global.EndoLogic.evaluateExperiment(exp, logs)
    );
    const flares = (state.flare_ups || []).slice(0, 5);
    const labs = (state.lab_entries || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const openQuestions = (state.doctor_questions || []).filter((q) => !q.is_resolved);
    const todayStr = new Date().toISOString().slice(0, 10);

    const corrRows = correlations.length
      ? correlations
          .map(
            (c) => `
          <tr>
            <td><strong>${escapeHtml(c.tag)}</strong></td>
            <td>${escapeHtml(c.offset_label)}</td>
            <td>n=${c.n}</td>
            <td>${c.pain_delta >= 0 ? "+" : ""}${c.pain_delta.toFixed(1)}</td>
            <td>${c.inflammation_delta >= 0 ? "+" : ""}${c.inflammation_delta.toFixed(1)}</td>
          </tr>`
          )
          .join("")
      : `<tr><td colspan="5">Noch nicht genügend Einträge für statistische Verzögerungsmuster.</td></tr>`;

    const expRows = experiments.length
      ? experiments
          .map((e) => {
            const d = e.deltas || { pain_delta: 0, inflammation_delta: 0, energy_delta: 0 };
            return `
            <tr>
              <td><strong>${escapeHtml(e.title)}</strong> (${escapeHtml(e.status)})</td>
              <td>${escapeHtml(e.start_date)} bis ${escapeHtml(e.end_date || "laufend")}</td>
              <td>Schmerz ${d.pain_delta >= 0 ? "+" : ""}${Number(d.pain_delta).toFixed(1)} | Entzündung ${d.inflammation_delta >= 0 ? "+" : ""}${Number(d.inflammation_delta).toFixed(1)} | Energie ${d.energy_delta >= 0 ? "+" : ""}${Number(d.energy_delta).toFixed(1)}</td>
            </tr>`;
          })
          .join("")
      : `<tr><td colspan="3">Keine Selbst-Experimente dokumentiert.</td></tr>`;

    const labRows = labs.length
      ? labs
          .map(
            (l) => `
          <tr>
            <td>${escapeHtml(l.date)}</td>
            <td><strong>${escapeHtml(l.parameter)}</strong></td>
            <td>${escapeHtml(l.value)} ${escapeHtml(l.unit)}</td>
            <td>${escapeHtml(l.reference_range)}</td>
            <td>${escapeHtml(l.notes)}</td>
          </tr>`
          )
          .join("")
      : `<tr><td colspan="5">Keine Laborwerte hinterlegt.</td></tr>`;

    const flareRows = flares.length
      ? flares
          .map(
            (f) => `
          <tr>
            <td>${escapeHtml(String(f.start_timestamp || "").slice(0, 16).replace("T", " "))}</td>
            <td>Start ${escapeHtml(f.initial_pain_score)}/10, Spitze ${escapeHtml(f.peak_pain_score)}/10</td>
            <td>${escapeHtml((f.body_locations || []).join(", "))}</td>
            <td>${escapeHtml((f.applied_measures || []).join(", "))}</td>
          </tr>`
          )
          .join("")
      : `<tr><td colspan="4">Keine akuten Schübe protokolliert.</td></tr>`;

    const questionList = openQuestions.length
      ? openQuestions.map((q) => `<li>${escapeHtml(q.question)}</li>`).join("")
      : `<li>Keine offenen Fragen hinterlegt.</li>`;

    containerEl.innerHTML = `
      <div class="dossier-page">
        <div class="dossier-header">
          <div>
            <h1 style="font-size: 16pt; margin-bottom: 2pt;">Arzttermin-Dossier: Verlaufsbericht</h1>
            <p style="font-size: 9.5pt; color: #555;">Strukturierte Eigendokumentation (Hilfe zur Selbsthilfe, kein Medizinprodukt)</p>
          </div>
          <div style="text-align: right; font-size: 9.5pt;">
            <div><strong>Erstellt am:</strong> ${escapeHtml(todayStr)}</div>
            <div><strong>Zyklustag aktuell:</strong> ${escapeHtml(cycleStats.current_cycle_day || "-")} (${escapeHtml(cycleStats.current_phase_label || "-")})</div>
          </div>
        </div>

        <div class="dossier-block card">
          <h2 style="font-size: 11.5pt; margin-bottom: 4pt;">1. Symptom- & Belastungsübersicht (30 / 90 Tage)</h2>
          <table class="dossier-table">
            <thead>
              <tr>
                <th>Zeitraum</th>
                <th>Dokumentierte Tage</th>
                <th>Schmerz (Schnitt)</th>
                <th>Entzündung (Schnitt)</th>
                <th>Energie (Schnitt)</th>
                <th>Tage mit Score &ge; 7</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Letzte 30 Tage</td>
                <td>${s30.count}</td>
                <td>${s30.pain} / 10</td>
                <td>${s30.infl} / 10</td>
                <td>${s30.energy} / 10</td>
                <td>${s30.highDays} Tage</td>
              </tr>
              <tr>
                <td>Letzte 90 Tage</td>
                <td>${s90.count}</td>
                <td>${s90.pain} / 10</td>
                <td>${s90.infl} / 10</td>
                <td>${s90.energy} / 10</td>
                <td>${s90.highDays} Tage</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="dossier-block card">
          <h2 style="font-size: 11.5pt; margin-bottom: 4pt;">2. Protokollierte Akut-Schübe (Flare-Ups)</h2>
          <table class="dossier-table">
            <thead>
              <tr>
                <th>Zeitpunkt</th>
                <th>Schmerzverlauf</th>
                <th>Lokalisation</th>
                <th>Ergriffene Maßnahmen</th>
              </tr>
            </thead>
            <tbody>${flareRows}</tbody>
          </table>
        </div>

        <div class="dossier-block card">
          <h2 style="font-size: 11.5pt; margin-bottom: 4pt;">3. Beobachtete Verzögerungs-Korrelationen (+0h bis +72h)</h2>
          <table class="dossier-table">
            <thead>
              <tr>
                <th>Faktor / Tag</th>
                <th>Zeitversatz</th>
                <th>Stichprobe</th>
                <th>Schmerz-Differenz</th>
                <th>Entzündungs-Differenz</th>
              </tr>
            </thead>
            <tbody>${corrRows}</tbody>
          </table>
        </div>

        <div class="dossier-block card">
          <h2 style="font-size: 11.5pt; margin-bottom: 4pt;">4. Selbst-Experimente (Vorher / Nachher)</h2>
          <table class="dossier-table">
            <thead>
              <tr>
                <th>Experiment</th>
                <th>Zeitraum</th>
                <th>Veränderung gegenüber Baseline</th>
              </tr>
            </thead>
            <tbody>${expRows}</tbody>
          </table>
        </div>

        <div class="dossier-block card">
          <h2 style="font-size: 11.5pt; margin-bottom: 4pt;">5. Dokumentierte Laborwerte</h2>
          <table class="dossier-table">
            <thead>
              <tr>
                <th>Datum</th>
                <th>Parameter</th>
                <th>Wert</th>
                <th>Referenz</th>
                <th>Notiz</th>
              </tr>
            </thead>
            <tbody>${labRows}</tbody>
          </table>
        </div>

        <div class="dossier-block card">
          <h2 style="font-size: 11.5pt; margin-bottom: 4pt;">6. Offene Fragen für das Arztgespräch</h2>
          <ul style="padding-left: 18pt; margin-top: 4pt;">${questionList}</ul>
        </div>
      </div>
    `;
  }

  global.EndoCharts = {
    escapeHtml,
    renderAnnualHeatmap,
    renderLabCanvas,
    renderDoctorDossier,
  };
})(window);
