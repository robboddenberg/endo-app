/* ==========================================================================
   Endo-App Main Controller & Router (5-Tab Mobile-First PWA)
   ========================================================================== */
(function (global) {
  "use strict";

  const NUTRITION_PRESET_TAGS = [
    "antientzündlich",
    "warmes Frühstück",
    "hafer",
    "gemüsesuppe",
    "omega3",
    "fencheltee",
    "glutenhaltig",
    "zuckerreich",
    "kaffee",
    "stress",
  ];

  const DIGESTION_PRESET_TAGS = [
    "regelmäßig",
    "blähbauch",
    "träge",
    "krämpfe",
    "unruhig",
    "verspannt",
  ];

  const FLARE_LOCATIONS = [
    "Unterleib zentriert",
    "Unterleib links",
    "Unterleib rechts",
    "Unterer Rücken",
    "Beckenboden",
    "Oberschenkel",
  ];

  const FLARE_MEASURES = [
    "Wärmflasche",
    "Wärmepflaster",
    "Kamillentee / Fencheltee",
    "Flachlegen & Ruhe",
    "Atemübung",
    "Beine hochlagern",
  ];

  const CLUSTER_LABELS = {
    all: "Alle Themen",
    bookmarked: "Lesezeichen",
    endometriosis: "Endometriose & Zyklus",
    inflammation: "Entzündung & Darm",
    peritoneal_abdominal: "Bauchfell & Abdomen",
    diagnostic_gap: "Diagnostik-Lücke",
  };

  class EndoAppController {
    constructor() {
      this.db = new global.EndoDB();
      this.state = null;
      this.activeTab = "heute";
      this.ampelFilter = "all";
      this.ampelSearch = "";
      this.studyClusterFilter = "all";
      this.studySearch = "";
      this.selectedLabParam = "CRP";
      this.selectedNutritionTags = new Set(["antientzündlich", "warmes Frühstück"]);
      this.selectedDigestionTags = new Set(["regelmäßig"]);
      this.selectedFlareLocations = new Set(["Unterleib zentriert"]);
      this.selectedFlareMeasures = new Set(["Wärmflasche", "Flachlegen & Ruhe"]);
      this.focusMode = false;
    }

    async init() {
      this.state = await this.db.init();
      this.applyTheme((this.state.settings && this.state.settings.theme_mode) || "light");
      this.bindGlobalEvents();
      this.prefillTodayForm();
      this.renderAll();
      this.checkPinGateOnStart();
      this.registerServiceWorker();
    }

    registerServiceWorker() {
      if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
        navigator.serviceWorker.register("./sw.js").catch(() => {});
      }
    }

    applyTheme(mode) {
      const clean = mode === "dark" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", clean);
      const btn = document.getElementById("btn-theme-toggle");
      if (btn) {
        btn.textContent = clean === "dark" ? "Tag" : "Nacht";
      }
    }

    toggleFocusMode() {
      this.focusMode = !this.focusMode;
      document.body.classList.toggle("focus-mode", this.focusMode);
      const btn = document.getElementById("btn-focus-toggle");
      if (btn) {
        btn.textContent = this.focusMode ? "Fokus: An" : "Fokus";
        btn.classList.toggle("btn-primary", this.focusMode);
      }
    }

    switchTab(tabName) {
      this.activeTab = tabName;
      document.querySelectorAll(".tab-panel").forEach((el) => {
        el.classList.toggle("active", el.id === `tab-${tabName}`);
      });
      document.querySelectorAll(".tab-btn").forEach((btn) => {
        btn.classList.toggle("active", btn.getAttribute("data-tab") === tabName);
      });
      if (tabName === "muster") {
        this.renderMusterTab();
      } else if (tabName === "tresor") {
        this.renderTresorTab();
      }
    }

    prefillTodayForm() {
      const logs = (this.state.daily_logs || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
      const latest = logs.length ? logs[logs.length - 1] : null;
      const todayIso = new Date().toISOString().slice(0, 10);

      const dateInput = document.getElementById("log-date");
      const cycleInput = document.getElementById("log-cycle-day");
      const painInput = document.getElementById("log-pain");
      const inflInput = document.getElementById("log-infl");
      const energyInput = document.getElementById("log-energy");
      const activityInput = document.getElementById("log-activity-type");
      const intensityInput = document.getElementById("log-activity-intensity");
      const noteInput = document.getElementById("log-general-note");

      if (dateInput) dateInput.value = latest ? latest.date : todayIso;
      if (cycleInput) cycleInput.value = latest ? latest.cycle_day : 14;
      if (painInput) painInput.value = latest ? latest.pain_score : 3;
      if (inflInput) inflInput.value = latest ? latest.inflammation_score : 3;
      if (energyInput) energyInput.value = latest ? latest.energy_score : 7;
      if (activityInput) activityInput.value = latest ? latest.activity_type || "Spaziergang" : "Spaziergang";
      if (intensityInput) intensityInput.value = latest ? latest.activity_intensity || "mild" : "mild";
      if (noteInput) noteInput.value = latest ? latest.general_note || "" : "";

      if (latest && Array.isArray(latest.nutrition_tags)) {
        this.selectedNutritionTags = new Set(latest.nutrition_tags);
      }
      if (latest && Array.isArray(latest.digestion_tags)) {
        this.selectedDigestionTags = new Set(latest.digestion_tags);
      }
      this.updateSliderBadges();
    }

    updateSliderBadges() {
      const pairs = [
        ["log-pain", "badge-log-pain", false],
        ["log-infl", "badge-log-infl", false],
        ["log-energy", "badge-log-energy", true],
        ["flare-init-pain", "badge-flare-init", false],
        ["flare-peak-pain", "badge-flare-peak", false],
      ];
      pairs.forEach(([inputId, badgeId, isEnergy]) => {
        const input = document.getElementById(inputId);
        const badge = document.getElementById(badgeId);
        if (!input || !badge) return;
        const val = Number(input.value || 0);
        badge.textContent = `${val} / 10`;
        badge.classList.remove("score-warn", "score-critical");
        input.classList.remove("high-alert");
        if (!isEnergy) {
          if (val >= 7) {
            badge.classList.add("score-critical");
            input.classList.add("high-alert");
          } else if (val >= 4) {
            badge.classList.add("score-warn");
          }
        }
      });
    }

    renderAll() {
      this.updateModeBadge();
      this.renderHeuteTab();
      this.renderMusterTab();
      this.renderTresorTab();
      this.renderRadarTab();
      this.renderMehrTab();
      global.EndoCharts.renderDoctorDossier(document.getElementById("print-dossier-root"), this.state);
    }

    updateModeBadge() {
      const el = document.getElementById("mode-indicator");
      if (!el) return;
      el.textContent = this.db.mode === "hybrid" ? "Hybrid-Sync" : "Lokal (PWA)";
    }

    /* ==================== TAB 1: HEUTE ==================== */
    renderHeuteTab() {
      const logs = this.state.daily_logs || [];
      const avgLen = (this.state.settings && this.state.settings.cycle_average_length) || 28;
      const stats = global.EndoLogic.calculateCycleStats(logs, avgLen);

      const dayEl = document.getElementById("compass-cycle-day");
      const phaseEl = document.getElementById("compass-phase-label");
      const painAvgEl = document.getElementById("compass-phase-pain");
      const inflAvgEl = document.getElementById("compass-phase-infl");
      const energyAvgEl = document.getElementById("compass-phase-energy");
      const impulseEl = document.getElementById("compass-daily-impulse");

      if (dayEl) dayEl.textContent = stats.current_cycle_day ? `Tag ${stats.current_cycle_day}` : "Start";
      if (phaseEl) phaseEl.textContent = stats.current_phase_label || "Bereit";

      const pAvg = (stats.phase_averages && stats.phase_averages[stats.current_phase]) || null;
      if (painAvgEl) painAvgEl.textContent = pAvg ? `${pAvg.avg_pain.toFixed(1)}` : "0.0";
      if (inflAvgEl) inflAvgEl.textContent = pAvg ? `${pAvg.avg_inflammation.toFixed(1)}` : "0.0";
      if (energyAvgEl) energyAvgEl.textContent = pAvg ? `${pAvg.avg_energy.toFixed(1)}` : "0.0";
      if (impulseEl) impulseEl.textContent = stats.daily_impulse;

      this.renderTagSelector("nutrition-tag-cloud", NUTRITION_PRESET_TAGS, this.selectedNutritionTags);
      this.renderTagSelector("digestion-tag-cloud", DIGESTION_PRESET_TAGS, this.selectedDigestionTags);
      this.renderCustomFieldsInputs();
      this.renderRecentFlaresSummary();
    }

    renderTagSelector(containerId, allTags, selectedSet) {
      const container = document.getElementById(containerId);
      if (!container) return;
      const union = Array.from(new Set([...allTags, ...Array.from(selectedSet)]));
      container.innerHTML = union
        .map((tag) => {
          const isSel = selectedSet.has(tag);
          return `<button type="button" class="tag-chip ${isSel ? "selected" : ""}" data-tag="${global.EndoCharts.escapeHtml(tag)}">${global.EndoCharts.escapeHtml(tag)}</button>`;
        })
        .join("");

      container.querySelectorAll(".tag-chip").forEach((btn) => {
        btn.addEventListener("click", () => {
          const t = btn.getAttribute("data-tag");
          if (selectedSet.has(t)) selectedSet.delete(t);
          else selectedSet.add(t);
          this.renderTagSelector(containerId, allTags, selectedSet);
        });
      });
    }

    renderCustomFieldsInputs() {
      const container = document.getElementById("custom-fields-form-area");
      if (!container) return;
      const fields = ((this.state.settings && this.state.settings.custom_fields) || []).filter(
        (f) => f.enabled
      );
      if (!fields.length) {
        container.innerHTML = `<p class="card-subtitle">Keine aktiven Zusatzfelder (konfigurierbar im Tab "Mehr").</p>`;
        return;
      }

      const logs = this.state.daily_logs || [];
      const latest = logs.length ? logs[logs.length - 1] : null;
      const latestCustom = (latest && latest.custom_values) || {};

      container.innerHTML = fields
        .map((f) => {
          const id = global.EndoCharts.escapeHtml(f.id);
          const label = global.EndoCharts.escapeHtml(f.label);
          if (f.type === "boolean") {
            const checked = Boolean(latestCustom[f.id]) ? "checked" : "";
            return `
              <div class="form-group">
                <label class="form-label" for="cf_input_${id}">
                  <span>${label}</span>
                  <input type="checkbox" id="cf_input_${id}" data-cf-id="${id}" data-cf-type="boolean" ${checked} style="width:20px;height:20px;accent-color:var(--primary-accent);" />
                </label>
              </div>`;
          }
          const val = latestCustom[f.id] !== undefined ? Number(latestCustom[f.id]) : 2;
          return `
            <div class="form-group">
              <div class="form-label">
                <span>${label} (0 bis 10)</span>
              </div>
              <input type="number" min="0" max="10" class="input" id="cf_input_${id}" data-cf-id="${id}" data-cf-type="scale_10" value="${val}" />
            </div>`;
        })
        .join("");
    }

    renderRecentFlaresSummary() {
      const container = document.getElementById("recent-flares-list");
      if (!container) return;
      const flares = (this.state.flare_ups || []).slice(0, 3);
      if (!flares.length) {
        container.innerHTML = `<p class="card-subtitle">Keine protokollierten Akut-Schübe.</p>`;
        return;
      }
      container.innerHTML = flares
        .map((f) => {
          const ts = String(f.start_timestamp || "").slice(0, 16).replace("T", " ");
          const locs = (f.body_locations || []).join(", ");
          const meas = (f.applied_measures || []).join(", ");
          return `
            <div class="list-row">
              <div>
                <div class="list-row-title">${global.EndoCharts.escapeHtml(ts)} Uhr</div>
                <div class="list-row-meta">Ort: ${global.EndoCharts.escapeHtml(locs || "-")} | geholfen: ${global.EndoCharts.escapeHtml(meas || "-")}</div>
              </div>
              <span class="badge badge-red">Spitze ${global.EndoCharts.escapeHtml(f.peak_pain_score)}/10</span>
            </div>`;
        })
        .join("");
    }

    async saveDailyLogFromForm(event) {
      if (event) event.preventDefault();
      const dateVal = document.getElementById("log-date").value || new Date().toISOString().slice(0, 10);
      const cycleDay = Math.max(1, Math.min(60, Number(document.getElementById("log-cycle-day").value || 1)));
      const painScore = Number(document.getElementById("log-pain").value || 0);
      const inflScore = Number(document.getElementById("log-infl").value || 0);
      const energyScore = Number(document.getElementById("log-energy").value || 5);
      const actType = document.getElementById("log-activity-type").value.trim() || "Spaziergang";
      const actIntensity = document.getElementById("log-activity-intensity").value || "mild";
      const note = document.getElementById("log-general-note").value.trim();

      const customValues = {};
      document.querySelectorAll("[data-cf-id]").forEach((el) => {
        const cfId = el.getAttribute("data-cf-id");
        const cfType = el.getAttribute("data-cf-type");
        if (cfType === "boolean") {
          customValues[cfId] = Boolean(el.checked);
        } else {
          customValues[cfId] = Math.max(0, Math.min(10, Number(el.value || 0)));
        }
      });

      const avgLen = (this.state.settings && this.state.settings.cycle_average_length) || 28;
      const phase = global.EndoLogic.determineCyclePhase(cycleDay, avgLen);

      const newLog = {
        id: `log_${dateVal}`,
        date: dateVal,
        cycle_day: cycleDay,
        cycle_phase: phase,
        pain_score: painScore,
        inflammation_score: inflScore,
        energy_score: energyScore,
        nutrition_tags: Array.from(this.selectedNutritionTags),
        nutrition_note: "",
        activity_type: actType,
        activity_intensity: actIntensity,
        digestion_score: this.selectedDigestionTags.has("blähbauch") ? "unruhig" : "normal",
        digestion_tags: Array.from(this.selectedDigestionTags),
        wellbeing_note: "",
        general_note: note,
        custom_values: customValues,
      };

      const logs = this.state.daily_logs || [];
      const existingIdx = logs.findIndex((x) => x.id === newLog.id || x.date === newLog.date);
      if (existingIdx >= 0) {
        logs[existingIdx] = newLog;
      } else {
        logs.push(newLog);
      }
      logs.sort((a, b) => String(a.date).localeCompare(String(b.date)));
      this.state.daily_logs = logs;

      await this.db.saveState(this.state);
      this.renderAll();
      this.showToast(`Tages-Log für ${dateVal} gespeichert.`);
    }

    openFlareModal() {
      const modal = document.getElementById("flare-modal");
      if (!modal) return;
      this.renderTagSelector("flare-locations-cloud", FLARE_LOCATIONS, this.selectedFlareLocations);
      this.renderTagSelector("flare-measures-cloud", FLARE_MEASURES, this.selectedFlareMeasures);
      this.updateSliderBadges();
      modal.classList.add("open");
    }

    closeFlareModal() {
      const modal = document.getElementById("flare-modal");
      if (modal) modal.classList.remove("open");
    }

    async saveFlareEpisode(event) {
      if (event) event.preventDefault();
      const initPain = Number(document.getElementById("flare-init-pain").value || 7);
      const peakPain = Number(document.getElementById("flare-peak-pain").value || 8);
      const notes = document.getElementById("flare-notes").value.trim();
      const nowIso = new Date().toISOString().replace(/\.\d+Z$/, "Z");

      const flare = {
        id: `flare_${nowIso.slice(0, 10)}_${Date.now().toString().slice(-4)}`,
        start_timestamp: nowIso,
        end_timestamp: nowIso,
        initial_pain_score: initPain,
        peak_pain_score: Math.max(initPain, peakPain),
        body_locations: Array.from(this.selectedFlareLocations),
        applied_measures: Array.from(this.selectedFlareMeasures),
        notes: notes || "Akuter Schub über 1-Tap Notfall-Modus protokolliert.",
      };

      this.state.flare_ups = [flare, ...(this.state.flare_ups || [])];
      await this.db.saveState(this.state);
      this.closeFlareModal();
      this.renderAll();
      this.showToast("Akut-Schub wurde im Tresor protokolliert.");
    }

    /* ==================== TAB 2: MUSTER ==================== */
    renderMusterTab() {
      const logs = this.state.daily_logs || [];
      global.EndoCharts.renderAnnualHeatmap(document.getElementById("heatmap-grid"), logs);

      const corrContainer = document.getElementById("correlations-list");
      if (corrContainer) {
        const correlations = global.EndoLogic.analyzeLagCorrelations(logs, 3).slice(0, 8);
        if (!correlations.length) {
          corrContainer.innerHTML = `<p class="card-subtitle">Noch nicht genügend Datenpunkte (mindestens 3 Wiederholungen pro Tag erforderlich).</p>`;
        } else {
          corrContainer.innerHTML = correlations
            .map((c) => {
              const pDelta = c.pain_delta;
              const iDelta = c.inflammation_delta;
              const isAlert = pDelta >= 1.2 || iDelta >= 1.2;
              const isGood = pDelta <= -0.8 && iDelta <= -0.8;
              const badgeClass = isAlert ? "badge-red" : isGood ? "badge-green" : "";
              return `
                <div class="list-row">
                  <div>
                    <div class="list-row-title">
                      ${global.EndoCharts.escapeHtml(c.tag)}
                      <span class="badge" style="margin-left:6px;">${global.EndoCharts.escapeHtml(c.offset_label)}</span>
                      <span class="badge" style="margin-left:4px;">n=${c.n}</span>
                    </div>
                    <div class="list-row-meta">${global.EndoCharts.escapeHtml(c.neutral_hint)}</div>
                  </div>
                  <div style="text-align:right;white-space:nowrap;">
                    <span class="badge ${badgeClass}">Schmerz ${pDelta >= 0 ? "+" : ""}${pDelta.toFixed(1)}</span>
                    <div style="margin-top:4px;">
                      <span class="badge ${badgeClass}">Entz. ${iDelta >= 0 ? "+" : ""}${iDelta.toFixed(1)}</span>
                    </div>
                  </div>
                </div>`;
            })
            .join("");
        }
      }

      this.renderAmpelSection();
      this.renderExperimentsSection();
    }

    renderAmpelSection() {
      const container = document.getElementById("ampel-list");
      if (!container) return;
      const items = (this.state.ampel_items || []).filter((item) => {
        if (this.ampelFilter !== "all" && item.status !== this.ampelFilter) return false;
        if (this.ampelSearch) {
          const q = this.ampelSearch.toLowerCase();
          return (
            String(item.name || "").toLowerCase().includes(q) ||
            String(item.notes || "").toLowerCase().includes(q)
          );
        }
        return true;
      });

      const statusMeta = {
        green: { label: "Grün (Gut verträglich)", cls: "badge-green" },
        yellow: { label: "Gelb (Zyklusabhängig)", cls: "badge-yellow" },
        red: { label: "Rot (Häufiger Trigger)", cls: "badge-red" },
      };

      if (!items.length) {
        container.innerHTML = `<p class="card-subtitle">Keine passenden Einträge in der Ampel-Liste.</p>`;
        return;
      }

      container.innerHTML = items
        .map((item) => {
          const meta = statusMeta[item.status] || statusMeta.green;
          const catLabel = item.category === "activity" ? "Aktivität" : "Ernährung";
          return `
            <div class="list-row">
              <div>
                <div class="list-row-title">${global.EndoCharts.escapeHtml(item.name)} <span class="badge">${catLabel}</span></div>
                <div class="list-row-meta">${global.EndoCharts.escapeHtml(item.notes)}</div>
              </div>
              <div style="display:flex;align-items:center;gap:8px;">
                <span class="badge ${meta.cls}">${meta.label}</span>
                <button type="button" class="btn btn-sm btn-ghost" data-del-ampel="${global.EndoCharts.escapeHtml(item.id)}" title="Eintrag entfernen">&times;</button>
              </div>
            </div>`;
        })
        .join("");

      container.querySelectorAll("[data-del-ampel]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const id = btn.getAttribute("data-del-ampel");
          this.state.ampel_items = (this.state.ampel_items || []).filter((x) => x.id !== id);
          await this.db.saveState(this.state);
          this.renderAmpelSection();
        });
      });
    }

    renderExperimentsSection() {
      const container = document.getElementById("experiments-list");
      if (!container) return;
      const logs = this.state.daily_logs || [];
      const exps = (this.state.self_experiments || []).map((e) =>
        global.EndoLogic.evaluateExperiment(e, logs)
      );

      if (!exps.length) {
        container.innerHTML = `<p class="card-subtitle">Noch keine Selbst-Experimente angelegt.</p>`;
        return;
      }

      container.innerHTML = exps
        .map((exp) => {
          const d = exp.deltas || { pain_delta: 0, inflammation_delta: 0, energy_delta: 0 };
          const b = exp.baseline_metrics || { avg_pain: 0, avg_inflammation: 0, avg_energy: 0 };
          const m = exp.experiment_metrics || { avg_pain: 0, avg_inflammation: 0, avg_energy: 0 };
          const statusBadge =
            exp.status === "completed"
              ? `<span class="badge badge-green">Abgeschlossen</span>`
              : `<span class="badge badge-accent">Aktiv</span>`;
          return `
            <div class="card-subtle" style="margin-bottom:10px;">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
                <div>
                  <div class="list-row-title">${global.EndoCharts.escapeHtml(exp.title)}</div>
                  <div class="list-row-meta">${global.EndoCharts.escapeHtml(exp.start_date)} bis ${global.EndoCharts.escapeHtml(exp.end_date || "laufend")} (${exp.duration_days || 1} Tage)</div>
                </div>
                ${statusBadge}
              </div>
              <p class="list-row-meta" style="margin-top:6px;">${global.EndoCharts.escapeHtml(exp.target_hypothesis || "")}</p>
              <div class="kpi-grid" style="margin-top:10px;">
                <div class="kpi-box">
                  <div class="kpi-value" style="font-size:1rem;">${Number(b.avg_pain).toFixed(1)} &rarr; ${Number(m.avg_pain).toFixed(1)}</div>
                  <div class="kpi-label">Schmerz (${d.pain_delta >= 0 ? "+" : ""}${Number(d.pain_delta).toFixed(1)})</div>
                </div>
                <div class="kpi-box">
                  <div class="kpi-value" style="font-size:1rem;">${Number(b.avg_inflammation).toFixed(1)} &rarr; ${Number(m.avg_inflammation).toFixed(1)}</div>
                  <div class="kpi-label">Entzündung (${d.inflammation_delta >= 0 ? "+" : ""}${Number(d.inflammation_delta).toFixed(1)})</div>
                </div>
                <div class="kpi-box">
                  <div class="kpi-value" style="font-size:1rem;">${Number(b.avg_energy).toFixed(1)} &rarr; ${Number(m.avg_energy).toFixed(1)}</div>
                  <div class="kpi-label">Energie (${d.energy_delta >= 0 ? "+" : ""}${Number(d.energy_delta).toFixed(1)})</div>
                </div>
              </div>
            </div>`;
        })
        .join("");
    }

    /* ==================== TAB 3: TRESOR ==================== */
    renderTresorTab() {
      const labs = this.state.lab_entries || [];
      const params = Array.from(new Set(["CRP", "Ferritin", "Vitamin D", ...labs.map((x) => x.parameter)]));
      if (!params.includes(this.selectedLabParam)) {
        this.selectedLabParam = params[0] || "CRP";
      }

      const paramBar = document.getElementById("lab-param-bar");
      if (paramBar) {
        paramBar.innerHTML = params
          .map(
            (p) =>
              `<button type="button" class="seg-btn ${p === this.selectedLabParam ? "active" : ""}" data-lab-param="${global.EndoCharts.escapeHtml(p)}">${global.EndoCharts.escapeHtml(p)}</button>`
          )
          .join("");
        paramBar.querySelectorAll("[data-lab-param]").forEach((btn) => {
          btn.addEventListener("click", () => {
            this.selectedLabParam = btn.getAttribute("data-lab-param");
            this.renderTresorTab();
          });
        });
      }

      global.EndoCharts.renderLabCanvas(
        document.getElementById("lab-chart-canvas"),
        labs,
        this.selectedLabParam
      );

      const labList = document.getElementById("lab-entries-list");
      if (labList) {
        const sortedLabs = labs.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
        labList.innerHTML = sortedLabs
          .map(
            (l) => `
            <div class="list-row">
              <div>
                <div class="list-row-title">${global.EndoCharts.escapeHtml(l.parameter)}: ${global.EndoCharts.escapeHtml(l.value)} ${global.EndoCharts.escapeHtml(l.unit)}</div>
                <div class="list-row-meta">${global.EndoCharts.escapeHtml(l.date)} | Referenz: ${global.EndoCharts.escapeHtml(l.reference_range || "-")} | ${global.EndoCharts.escapeHtml(l.notes || "")}</div>
              </div>
              <button type="button" class="btn btn-sm btn-ghost" data-del-lab="${global.EndoCharts.escapeHtml(l.id)}">&times;</button>
            </div>`
          )
          .join("");

        labList.querySelectorAll("[data-del-lab]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const id = btn.getAttribute("data-del-lab");
            this.state.lab_entries = (this.state.lab_entries || []).filter((x) => x.id !== id);
            await this.db.saveState(this.state);
            this.renderTresorTab();
          });
        });
      }

      const notesList = document.getElementById("medical-notes-list");
      if (notesList) {
        const notes = (this.state.medical_notes || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
        notesList.innerHTML = notes.length
          ? notes
              .map(
                (n) => `
              <div class="list-row">
                <div>
                  <div class="list-row-title">${global.EndoCharts.escapeHtml(n.doctor_type)} <span class="badge">${global.EndoCharts.escapeHtml(n.date)}</span></div>
                  <div class="list-row-meta">${global.EndoCharts.escapeHtml(n.summary)}</div>
                </div>
                <button type="button" class="btn btn-sm btn-ghost" data-del-note="${global.EndoCharts.escapeHtml(n.id)}">&times;</button>
              </div>`
              )
              .join("")
          : `<p class="card-subtitle">Keine Befunde hinterlegt.</p>`;

        notesList.querySelectorAll("[data-del-note]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const id = btn.getAttribute("data-del-note");
            this.state.medical_notes = (this.state.medical_notes || []).filter((x) => x.id !== id);
            await this.db.saveState(this.state);
            this.renderTresorTab();
          });
        });
      }

      const qList = document.getElementById("doctor-questions-list");
      if (qList) {
        const questions = this.state.doctor_questions || [];
        qList.innerHTML = questions.length
          ? questions
              .map(
                (q) => `
              <div class="list-row">
                <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;flex:1;">
                  <input type="checkbox" data-toggle-question="${global.EndoCharts.escapeHtml(q.id)}" ${q.is_resolved ? "checked" : ""} style="margin-top:3px;width:18px;height:18px;accent-color:var(--primary-accent);" />
                  <div>
                    <div class="list-row-title" style="${q.is_resolved ? "text-decoration:line-through;color:var(--text-muted);" : ""}">${global.EndoCharts.escapeHtml(q.question)}</div>
                    <div class="list-row-meta">Erstellt am ${global.EndoCharts.escapeHtml(q.created_date || "-")}</div>
                  </div>
                </label>
                <button type="button" class="btn btn-sm btn-ghost" data-del-question="${global.EndoCharts.escapeHtml(q.id)}">&times;</button>
              </div>`
              )
              .join("")
          : `<p class="card-subtitle">Keine Fragen in der Checkliste.</p>`;

        qList.querySelectorAll("[data-toggle-question]").forEach((chk) => {
          chk.addEventListener("change", async () => {
            const id = chk.getAttribute("data-toggle-question");
            const found = (this.state.doctor_questions || []).find((x) => x.id === id);
            if (found) {
              found.is_resolved = Boolean(chk.checked);
              await this.db.saveState(this.state);
              this.renderAll();
            }
          });
        });

        qList.querySelectorAll("[data-del-question]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const id = btn.getAttribute("data-del-question");
            this.state.doctor_questions = (this.state.doctor_questions || []).filter((x) => x.id !== id);
            await this.db.saveState(this.state);
            this.renderAll();
          });
        });
      }
    }

    /* ==================== TAB 4: RADAR ==================== */
    renderRadarTab() {
      const clusterBar = document.getElementById("study-cluster-bar");
      if (clusterBar) {
        clusterBar.innerHTML = Object.keys(CLUSTER_LABELS)
          .map(
            (key) =>
              `<button type="button" class="seg-btn ${key === this.studyClusterFilter ? "active" : ""}" data-study-cluster="${key}">${global.EndoCharts.escapeHtml(CLUSTER_LABELS[key])}</button>`
          )
          .join("");
        clusterBar.querySelectorAll("[data-study-cluster]").forEach((btn) => {
          btn.addEventListener("click", () => {
            this.studyClusterFilter = btn.getAttribute("data-study-cluster");
            this.renderRadarTab();
          });
        });
      }

      const studiesContainer = document.getElementById("studies-list");
      if (studiesContainer) {
        const filtered = (this.state.studies || []).filter((s) => {
          if (this.studyClusterFilter === "bookmarked" && !s.is_bookmarked) return false;
          if (
            this.studyClusterFilter !== "all" &&
            this.studyClusterFilter !== "bookmarked" &&
            s.topic_cluster !== this.studyClusterFilter
          ) {
            return false;
          }
          if (this.studySearch) {
            const q = this.studySearch.toLowerCase();
            const text = `${s.title || ""} ${s.summary_de || ""} ${(s.matched_keywords || []).join(" ")}`.toLowerCase();
            return text.includes(q);
          }
          return true;
        });

        studiesContainer.innerHTML = filtered.length
          ? filtered
              .map((s) => {
                const clusterLabel = CLUSTER_LABELS[s.topic_cluster] || s.topic_cluster || "Allgemein";
                const kwBadges = (s.matched_keywords || [])
                  .map((kw) => `<span class="badge">${global.EndoCharts.escapeHtml(kw)}</span>`)
                  .join(" ");
                return `
                  <div class="card-subtle" style="margin-bottom:10px;">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
                      <div>
                        <span class="badge badge-accent">${global.EndoCharts.escapeHtml(clusterLabel)}</span>
                        <span class="badge">PMID: ${global.EndoCharts.escapeHtml(s.pmid)}</span>
                        <span class="badge">${global.EndoCharts.escapeHtml(s.pub_date)}</span>
                      </div>
                      <button type="button" class="btn btn-sm ${s.is_bookmarked ? "btn-primary" : "btn-ghost"}" data-bookmark-study="${global.EndoCharts.escapeHtml(s.id)}">
                        ${s.is_bookmarked ? "Gemerkt" : "Merken"}
                      </button>
                    </div>
                    <div class="list-row-title" style="margin-top:8px;">${global.EndoCharts.escapeHtml(s.title)}</div>
                    <p class="list-row-meta" style="margin-top:4px;">${global.EndoCharts.escapeHtml(s.summary_de)}</p>
                    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-top:10px;">
                      <div style="display:flex;gap:4px;flex-wrap:wrap;">${kwBadges}</div>
                      <a href="${global.EndoCharts.escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-ghost">PubMed Quelle &rarr;</a>
                    </div>
                  </div>`;
              })
              .join("")
          : `<p class="card-subtitle">Keine Studien für diesen Filter gefunden.</p>`;

        studiesContainer.querySelectorAll("[data-bookmark-study]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const id = btn.getAttribute("data-bookmark-study");
            const study = (this.state.studies || []).find((x) => x.id === id);
            if (study) {
              study.is_bookmarked = !study.is_bookmarked;
              await this.db.saveState(this.state);
              this.renderRadarTab();
            }
          });
        });
      }

      const appContainer = document.getElementById("appointments-list");
      if (appContainer) {
        const profiles = this.state.appointment_profiles || [];
        appContainer.innerHTML = profiles.length
          ? profiles
              .map(
                (p) => `
              <div class="list-row">
                <div>
                  <div class="list-row-title">${global.EndoCharts.escapeHtml(p.service_name)}</div>
                  <div class="list-row-meta">PLZ ${global.EndoCharts.escapeHtml(p.zip_code)} | Umkreis ${global.EndoCharts.escapeHtml(p.radius_km)} km</div>
                </div>
                <div style="display:flex;gap:6px;align-items:center;">
                  ${
                    p.booking_url
                      ? `<a href="${global.EndoCharts.escapeHtml(p.booking_url)}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-ghost">Portal öffnen</a>`
                      : ""
                  }
                  <button type="button" class="btn btn-sm btn-ghost" data-del-profile="${global.EndoCharts.escapeHtml(p.id)}">&times;</button>
                </div>
              </div>`
              )
              .join("")
          : `<p class="card-subtitle">Keine Termin-Suchprofile hinterlegt.</p>`;

        appContainer.querySelectorAll("[data-del-profile]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const id = btn.getAttribute("data-del-profile");
            this.state.appointment_profiles = (this.state.appointment_profiles || []).filter(
              (x) => x.id !== id
            );
            await this.db.saveState(this.state);
            this.renderRadarTab();
          });
        });
      }
    }

    /* ==================== TAB 5: MEHR ==================== */
    renderMehrTab() {
      const cycleLenInput = document.getElementById("setting-cycle-length");
      if (cycleLenInput && this.state.settings) {
        cycleLenInput.value = this.state.settings.cycle_average_length || 28;
      }

      const cfList = document.getElementById("custom-fields-config-list");
      if (cfList) {
        const fields = (this.state.settings && this.state.settings.custom_fields) || [];
        cfList.innerHTML = fields.length
          ? fields
              .map(
                (f) => `
              <div class="list-row">
                <div>
                  <div class="list-row-title">${global.EndoCharts.escapeHtml(f.label)}</div>
                  <div class="list-row-meta">Typ: ${f.type === "boolean" ? "Ja / Nein" : "Skala 0 bis 10"}</div>
                </div>
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                  <input type="checkbox" data-toggle-cf="${global.EndoCharts.escapeHtml(f.id)}" ${f.enabled ? "checked" : ""} style="width:18px;height:18px;accent-color:var(--primary-accent);" />
                  <span style="font-size:0.8rem;">Aktiv</span>
                </label>
              </div>`
              )
              .join("")
          : `<p class="card-subtitle">Keine benutzerdefinierten Felder vorhanden.</p>`;

        cfList.querySelectorAll("[data-toggle-cf]").forEach((chk) => {
          chk.addEventListener("change", async () => {
            const id = chk.getAttribute("data-toggle-cf");
            const found = ((this.state.settings && this.state.settings.custom_fields) || []).find(
              (x) => x.id === id
            );
            if (found) {
              found.enabled = Boolean(chk.checked);
              await this.db.saveState(this.state);
              this.renderHeuteTab();
            }
          });
        });
      }

      const pinStatusEl = document.getElementById("pin-status-badge");
      if (pinStatusEl) {
        const storedHash = this.db.getStoredPinHash(this.state);
        const active = Boolean(storedHash);
        pinStatusEl.textContent = active ? "Aktiviert" : "Deaktiviert";
        pinStatusEl.className = `badge ${active ? "badge-green" : ""}`;
      }
    }

    /* ==================== PIN-SPERRE ==================== */
    checkPinGateOnStart() {
      const storedHash = this.db.getStoredPinHash(this.state);
      if (!storedHash) return;
      const modal = document.getElementById("pin-lock-modal");
      if (modal) modal.classList.add("open");
    }

    /* ==================== EVENT BINDINGS ==================== */
    bindGlobalEvents() {
      // Bottom Tabs
      document.querySelectorAll(".tab-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          this.switchTab(btn.getAttribute("data-tab"));
        });
      });

      // Top Bar Actions
      const themeBtn = document.getElementById("btn-theme-toggle");
      if (themeBtn) {
        themeBtn.addEventListener("click", async () => {
          const cur = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
          const next = cur === "dark" ? "light" : "dark";
          this.applyTheme(next);
          if (this.state && this.state.settings) {
            this.state.settings.theme_mode = next;
            await this.db.saveState(this.state);
          }
          if (this.activeTab === "tresor") this.renderTresorTab();
        });
      }

      const focusBtn = document.getElementById("btn-focus-toggle");
      if (focusBtn) {
        focusBtn.addEventListener("click", () => this.toggleFocusMode());
      }

      // Slider Live-Updates
      ["log-pain", "log-infl", "log-energy", "flare-init-pain", "flare-peak-pain"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener("input", () => this.updateSliderBadges());
      });

      // Daily Log Formular
      const logForm = document.getElementById("daily-log-form");
      if (logForm) {
        logForm.addEventListener("submit", (e) => this.saveDailyLogFromForm(e));
      }

      // Eigenen Tag zu Ernaehrung hinzufuegen
      const addTagBtn = document.getElementById("btn-add-custom-tag");
      if (addTagBtn) {
        addTagBtn.addEventListener("click", () => {
          const inp = document.getElementById("input-custom-tag");
          if (!inp || !inp.value.trim()) return;
          const t = inp.value.trim().toLowerCase();
          this.selectedNutritionTags.add(t);
          inp.value = "";
          this.renderTagSelector("nutrition-tag-cloud", NUTRITION_PRESET_TAGS, this.selectedNutritionTags);
        });
      }

      // Flare-Up Modal
      const openFlareBtn = document.getElementById("btn-open-flare-modal");
      if (openFlareBtn) openFlareBtn.addEventListener("click", () => this.openFlareModal());
      const closeFlareBtn = document.getElementById("btn-close-flare-modal");
      if (closeFlareBtn) closeFlareBtn.addEventListener("click", () => this.closeFlareModal());
      const flareForm = document.getElementById("flare-up-form");
      if (flareForm) flareForm.addEventListener("submit", (e) => this.saveFlareEpisode(e));

      // Ampel Filter & Suche & Formular
      document.querySelectorAll("[data-ampel-filter]").forEach((btn) => {
        btn.addEventListener("click", () => {
          this.ampelFilter = btn.getAttribute("data-ampel-filter");
          document.querySelectorAll("[data-ampel-filter]").forEach((b) =>
            b.classList.toggle("active", b === btn)
          );
          this.renderAmpelSection();
        });
      });

      const ampelSearchInput = document.getElementById("ampel-search-input");
      if (ampelSearchInput) {
        ampelSearchInput.addEventListener("input", () => {
          this.ampelSearch = ampelSearchInput.value.trim();
          this.renderAmpelSection();
        });
      }

      const ampelForm = document.getElementById("ampel-add-form");
      if (ampelForm) {
        ampelForm.addEventListener("submit", async (e) => {
          e.preventDefault();
          const name = document.getElementById("ampel-name").value.trim();
          if (!name) return;
          const category = document.getElementById("ampel-category").value;
          const status = document.getElementById("ampel-status").value;
          const notes = document.getElementById("ampel-notes").value.trim();
          this.state.ampel_items = this.state.ampel_items || [];
          this.state.ampel_items.unshift({
            id: `amp_${Date.now()}`,
            category,
            name,
            status,
            notes,
          });
          ampelForm.reset();
          await this.db.saveState(this.state);
          this.renderAmpelSection();
          this.showToast("Ampel-Eintrag hinzugefügt.");
        });
      }

      // Selbst-Experiment Formular
      const expForm = document.getElementById("experiment-add-form");
      if (expForm) {
        expForm.addEventListener("submit", async (e) => {
          e.preventDefault();
          const title = document.getElementById("exp-title").value.trim();
          if (!title) return;
          const startDate = document.getElementById("exp-start").value || new Date().toISOString().slice(0, 10);
          const endDate = document.getElementById("exp-end").value || null;
          const hypo = document.getElementById("exp-hypothesis").value.trim();
          this.state.self_experiments = this.state.self_experiments || [];
          this.state.self_experiments.unshift({
            id: `exp_${Date.now()}`,
            title,
            target_hypothesis: hypo,
            start_date: startDate,
            end_date: endDate,
            status: endDate ? "completed" : "active",
          });
          expForm.reset();
          await this.db.saveState(this.state);
          this.renderMusterTab();
          this.showToast("Selbst-Experiment gespeichert.");
        });
      }

      // Tresor: Arzttermin-Dossier Drucken
      const printBtn = document.getElementById("btn-print-dossier");
      if (printBtn) {
        printBtn.addEventListener("click", () => {
          global.EndoCharts.renderDoctorDossier(
            document.getElementById("print-dossier-root"),
            this.state
          );
          window.print();
        });
      }

      // Tresor: Laborwert Formular
      const labForm = document.getElementById("lab-add-form");
      if (labForm) {
        labForm.addEventListener("submit", async (e) => {
          e.preventDefault();
          const param = document.getElementById("lab-parameter").value.trim();
          const val = Number(document.getElementById("lab-value").value);
          if (!param || Number.isNaN(val)) return;
          const dateVal = document.getElementById("lab-date").value || new Date().toISOString().slice(0, 10);
          const unit = document.getElementById("lab-unit").value.trim();
          const ref = document.getElementById("lab-ref").value.trim();
          const notes = document.getElementById("lab-notes").value.trim();
          this.state.lab_entries = this.state.lab_entries || [];
          this.state.lab_entries.push({
            id: `lab_${Date.now()}`,
            date: dateVal,
            parameter: param,
            value: val,
            unit,
            reference_range: ref,
            notes,
          });
          this.selectedLabParam = param;
          labForm.reset();
          await this.db.saveState(this.state);
          this.renderTresorTab();
          this.showToast("Laborwert gespeichert.");
        });
      }

      // Tresor: Befund Formular
      const noteForm = document.getElementById("medical-note-form");
      if (noteForm) {
        noteForm.addEventListener("submit", async (e) => {
          e.preventDefault();
          const docType = document.getElementById("note-doctor-type").value.trim();
          const summary = document.getElementById("note-summary").value.trim();
          if (!docType || !summary) return;
          const dateVal = document.getElementById("note-date").value || new Date().toISOString().slice(0, 10);
          this.state.medical_notes = this.state.medical_notes || [];
          this.state.medical_notes.unshift({
            id: `doc_${Date.now()}`,
            date: dateVal,
            doctor_type: docType,
            summary,
            file_ref: null,
          });
          noteForm.reset();
          await this.db.saveState(this.state);
          this.renderTresorTab();
          this.showToast("Befund-Notiz gespeichert.");
        });
      }

      // Tresor: Arztfrage Formular
      const qForm = document.getElementById("question-add-form");
      if (qForm) {
        qForm.addEventListener("submit", async (e) => {
          e.preventDefault();
          const qText = document.getElementById("question-input").value.trim();
          if (!qText) return;
          this.state.doctor_questions = this.state.doctor_questions || [];
          this.state.doctor_questions.push({
            id: `q_${Date.now()}`,
            created_date: new Date().toISOString().slice(0, 10),
            question: qText,
            is_resolved: false,
          });
          qForm.reset();
          await this.db.saveState(this.state);
          this.renderAll();
          this.showToast("Frage für den Arztbesuch notiert.");
        });
      }

      // Radar: Studien-Suche & Terminprofil Formular
      const studySearchInput = document.getElementById("study-search-input");
      if (studySearchInput) {
        studySearchInput.addEventListener("input", () => {
          this.studySearch = studySearchInput.value.trim();
          this.renderRadarTab();
        });
      }

      const appForm = document.getElementById("appointment-add-form");
      if (appForm) {
        appForm.addEventListener("submit", async (e) => {
          e.preventDefault();
          const serviceName = document.getElementById("app-service-name").value.trim();
          if (!serviceName) return;
          const zip = document.getElementById("app-zip").value.trim() || "10115";
          const radius = Number(document.getElementById("app-radius").value || 15);
          const url = document.getElementById("app-url").value.trim();
          this.state.appointment_profiles = this.state.appointment_profiles || [];
          this.state.appointment_profiles.push({
            id: `app_prof_${Date.now()}`,
            service_name: serviceName,
            zip_code: zip,
            radius_km: radius,
            booking_url: url,
            active: true,
          });
          appForm.reset();
          await this.db.saveState(this.state);
          this.renderRadarTab();
          this.showToast("Termin-Suchprofil gespeichert.");
        });
      }

      // Mehr: Zykluslaenge & Custom Fields
      const saveCycleBtn = document.getElementById("btn-save-cycle-length");
      if (saveCycleBtn) {
        saveCycleBtn.addEventListener("click", async () => {
          const val = Math.max(15, Math.min(60, Number(document.getElementById("setting-cycle-length").value || 28)));
          this.state.settings = this.state.settings || {};
          this.state.settings.cycle_average_length = val;
          await this.db.saveState(this.state);
          this.renderAll();
          this.showToast(`Durchschnittliche Zykluslänge auf ${val} Tage gesetzt.`);
        });
      }

      const cfAddForm = document.getElementById("custom-field-add-form");
      if (cfAddForm) {
        cfAddForm.addEventListener("submit", async (e) => {
          e.preventDefault();
          const label = document.getElementById("cf-new-label").value.trim();
          if (!label) return;
          const type = document.getElementById("cf-new-type").value;
          const id = `cf_${label.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${Date.now().toString().slice(-3)}`;
          this.state.settings = this.state.settings || {};
          this.state.settings.custom_fields = this.state.settings.custom_fields || [];
          this.state.settings.custom_fields.push({
            id,
            label,
            type,
            enabled: true,
          });
          cfAddForm.reset();
          await this.db.saveState(this.state);
          this.renderAll();
          this.showToast(`Tracking-Feld '${label}' angelegt.`);
        });
      }

      // Mehr: PIN-Sperre
      const savePinBtn = document.getElementById("btn-save-pin");
      if (savePinBtn) {
        savePinBtn.addEventListener("click", async () => {
          const pinInput = document.getElementById("setting-pin-input");
          const rawPin = pinInput ? pinInput.value.trim() : "";
          if (!/^\d{4}$/.test(rawPin)) {
            this.showToast("Bitte eine genau 4-stellige Ziffern-PIN eingeben.");
            return;
          }
          const hashed = await this.db.hashPin(rawPin);
          this.db.setStoredPinHash(hashed);
          this.state.settings = this.state.settings || {};
          this.state.settings.pin_hash = hashed;
          this.state.settings.pin_enabled = true;
          if (pinInput) pinInput.value = "";
          await this.db.saveState(this.state);
          this.renderMehrTab();
          this.showToast("4-stellige PIN-Sperre aktiviert.");
        });
      }

      const clearPinBtn = document.getElementById("btn-clear-pin");
      if (clearPinBtn) {
        clearPinBtn.addEventListener("click", async () => {
          this.db.setStoredPinHash(null);
          if (this.state.settings) {
            this.state.settings.pin_hash = null;
            this.state.settings.pin_enabled = false;
          }
          await this.db.saveState(this.state);
          this.renderMehrTab();
          this.showToast("PIN-Sperre deaktiviert.");
        });
      }

      const unlockForm = document.getElementById("pin-unlock-form");
      if (unlockForm) {
        unlockForm.addEventListener("submit", async (e) => {
          e.preventDefault();
          const inp = document.getElementById("pin-unlock-input");
          const entered = inp ? inp.value.trim() : "";
          const enteredHash = await this.db.hashPin(entered);
          const storedHash = this.db.getStoredPinHash(this.state);
          if (enteredHash === storedHash) {
            if (inp) inp.value = "";
            document.getElementById("pin-lock-modal").classList.remove("open");
          } else {
            const errEl = document.getElementById("pin-unlock-error");
            if (errEl) errEl.textContent = "PIN nicht korrekt. Bitte erneut versuchen.";
          }
        });
      }

      // Mehr: Daten-Management (Export, Import, Demo, Reset)
      const exportBtn = document.getElementById("btn-export-json");
      if (exportBtn) {
        exportBtn.addEventListener("click", () => {
          this.db.exportAsJsonFile(this.state);
          this.showToast("JSON-Backup wird heruntergeladen.");
        });
      }

      const importInput = document.getElementById("input-import-json");
      if (importInput) {
        importInput.addEventListener("change", (e) => {
          const file = e.target.files && e.target.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = async (ev) => {
            try {
              const parsed = JSON.parse(String(ev.target.result));
              if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.daily_logs)) {
                throw new Error("Ungültiges Endo-App JSON-Format.");
              }
              this.state = await this.db.saveState(parsed);
              this.prefillTodayForm();
              this.renderAll();
              this.showToast("JSON-Datensatz erfolgreich importiert.");
            } catch (err) {
              this.showToast(`Import fehlgeschlagen: ${err.message}`);
            }
          };
          reader.readAsText(file, "utf-8");
        });
      }

      const demoBtn = document.getElementById("btn-load-demo");
      if (demoBtn) {
        demoBtn.addEventListener("click", async () => {
          this.state = await this.db.loadDemoData();
          this.prefillTodayForm();
          this.renderAll();
          this.showToast("90-Tage Demo-Daten erfolgreich geladen.");
        });
      }

      const resetBtn = document.getElementById("btn-reset-all");
      if (resetBtn) {
        resetBtn.addEventListener("click", async () => {
          const confirmed = window.confirm(
            "Möchtest du wirklich alle lokalen Einträge zurücksetzen? Bitte lade vorher bei Bedarf ein JSON-Backup herunter."
          );
          if (!confirmed) return;
          this.state = await this.db.resetToEmpty();
          this.prefillTodayForm();
          this.renderAll();
          this.showToast("Alle Einträge wurden zurückgesetzt.");
        });
      }
    }

    showToast(message) {
      const toast = document.getElementById("app-toast");
      if (!toast) return;
      toast.textContent = message;
      toast.style.display = "block";
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => {
        toast.style.display = "none";
      }, 3200);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const app = new EndoAppController();
    global.endoApp = app;
    app.init();
  });
})(window);
