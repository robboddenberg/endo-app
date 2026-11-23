/* ==========================================================================
   Endo-App Dual-Mode Storage Engine (IndexedDB + LocalStorage + FastAPI Sync)
   ========================================================================== */
(function (global) {
  "use strict";

  const DB_NAME = "EndoAppDB";
  const DB_VERSION = 1;
  const STORE_NAME = "app_state";
  const STATE_KEY = "singleton";
  const LS_FALLBACK_KEY = "endo_app_state_v1";
  const LS_PIN_KEY = "endo_app_pin_hash_v1";

  class EndoDB {
    constructor() {
      this.db = null;
      this.backendAvailable = false;
      this.mode = "standalone"; // "standalone" oder "hybrid"
    }

    async openIndexedDB() {
      if (this.db) return this.db;
      if (typeof indexedDB === "undefined") return null;

      return new Promise((resolve) => {
        try {
          const request = indexedDB.open(DB_NAME, DB_VERSION);
          request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
              db.createObjectStore(STORE_NAME);
            }
          };
          request.onsuccess = (event) => {
            this.db = event.target.result;
            resolve(this.db);
          };
          request.onerror = () => resolve(null);
        } catch (_err) {
          resolve(null);
        }
      });
    }

    async readLocal() {
      const db = await this.openIndexedDB();
      if (db) {
        try {
          const fromIdb = await new Promise((resolve) => {
            const tx = db.transaction([STORE_NAME], "readonly");
            const store = tx.objectStore(STORE_NAME);
            const req = store.get(STATE_KEY);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
          });
          if (fromIdb && typeof fromIdb === "object") {
            return fromIdb;
          }
        } catch (_err) {
          // Fallback auf LocalStorage
        }
      }

      try {
        const raw = localStorage.getItem(LS_FALLBACK_KEY);
        if (raw) {
          return JSON.parse(raw);
        }
      } catch (_err) {
        // Ignorieren
      }
      return null;
    }

    async writeLocal(state) {
      const payload = Object.assign({}, state, {
        last_updated: new Date().toISOString(),
      });

      try {
        localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(payload));
      } catch (_err) {
        // Ignorieren falls Quota erreicht
      }

      const db = await this.openIndexedDB();
      if (db) {
        try {
          await new Promise((resolve) => {
            const tx = db.transaction([STORE_NAME], "readwrite");
            const store = tx.objectStore(STORE_NAME);
            store.put(payload, STATE_KEY);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => resolve(false);
          });
        } catch (_err) {
          // Fallback in LocalStorage ist bereits erfolgt
        }
      }
      return payload;
    }

    async probeBackend() {
      if (location.protocol === "file:") {
        this.backendAvailable = false;
        this.mode = "standalone";
        return false;
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1800);
      try {
        const resp = await fetch("/api/health", {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (resp.ok) {
          const data = await resp.json();
          if (data && data.status === "ok") {
            this.backendAvailable = true;
            this.mode = "hybrid";
            return true;
          }
        }
      } catch (_err) {
        clearTimeout(timer);
      }
      this.backendAvailable = false;
      this.mode = "standalone";
      return false;
    }

    async init() {
      const hasBackend = await this.probeBackend();
      if (hasBackend) {
        try {
          const resp = await fetch("/api/export", {
            headers: { Accept: "application/json" },
          });
          if (resp.ok) {
            const serverState = await resp.json();
            if (serverState && Array.isArray(serverState.daily_logs) && serverState.daily_logs.length > 0) {
              await this.writeLocal(serverState);
              return serverState;
            }
          }
        } catch (_err) {
          // Weiter mit lokalem Speicher
        }
      }

      const localState = await this.readLocal();
      if (localState && Array.isArray(localState.daily_logs) && localState.daily_logs.length > 0) {
        return localState;
      }

      // Beim allerersten Start 90-Tage Demo-Daten initialisieren
      const demo = global.EndoLogic.generateClientDemoData();
      await this.saveState(demo);
      return demo;
    }

    async saveState(nextState) {
      const savedLocal = await this.writeLocal(nextState);
      if (this.backendAvailable) {
        try {
          const resp = await fetch("/api/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(savedLocal),
          });
          if (resp.ok) {
            const res = await resp.json();
            if (res && typeof res.revision === "number") {
              savedLocal.revision = res.revision;
              await this.writeLocal(savedLocal);
            }
          }
        } catch (_err) {
          this.backendAvailable = false;
          this.mode = "standalone";
        }
      }
      return savedLocal;
    }

    async resetToEmpty() {
      const empty = {
        version: "1.0.0",
        revision: 0,
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
        daily_logs: [],
        flare_ups: [],
        self_experiments: [],
        ampel_items: [],
        lab_entries: [],
        medical_notes: [],
        doctor_questions: [],
        studies: [],
        appointment_profiles: [],
      };
      return this.saveState(empty);
    }

    async loadDemoData() {
      const demo = global.EndoLogic.generateClientDemoData();
      return this.saveState(demo);
    }

    exportAsJsonFile(state) {
      const jsonStr = JSON.stringify(state, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const dateStr = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.download = `endo-app-backup-${dateStr}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }

    async hashPin(pin) {
      const clean = String(pin || "").trim();
      if (global.crypto && global.crypto.subtle && typeof TextEncoder !== "undefined") {
        const buf = new TextEncoder().encode(`endo-salt-v1:${clean}`);
        const digest = await global.crypto.subtle.digest("SHA-256", buf);
        return Array.from(new Uint8Array(digest))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
      }
      // Deterministischer Fallback falls WebCrypto in unsicherem Kontext nicht verfuegbar ist
      let hash = 5381;
      const salted = `endo-salt-v1:${clean}`;
      for (let i = 0; i < salted.length; i++) {
        hash = (hash * 33) ^ salted.charCodeAt(i);
      }
      return `djb2_${(hash >>> 0).toString(16)}`;
    }

    getStoredPinHash(state) {
      try {
        const lsHash = localStorage.getItem(LS_PIN_KEY);
        if (lsHash) return lsHash;
      } catch (_err) {
        // Ignorieren
      }
      return state && state.settings && state.settings.pin_hash ? state.settings.pin_hash : null;
    }

    setStoredPinHash(pinHash) {
      try {
        if (pinHash) {
          localStorage.setItem(LS_PIN_KEY, pinHash);
        } else {
          localStorage.removeItem(LS_PIN_KEY);
        }
      } catch (_err) {
        // Ignorieren
      }
    }
  }

  global.EndoDB = EndoDB;
})(window);
