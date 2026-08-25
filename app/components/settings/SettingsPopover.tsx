"use client";

import { useEffect, useState } from "react";
import { Popover } from "@base-ui-components/react/popover";
import styles from "./SettingsPopover.module.css";

interface ProviderMeta {
  id: string;
  label: string;
  needsKey: boolean;
  editableBaseURL: boolean;
  defaultModel: string;
  keyDetected: boolean;
  baseURL: string;
}

interface Prefs {
  activeProvider: string;
  models: Record<string, string>;
  baseURLs: Record<string, string>;
}

/**
 * Settings popover: pick the active AI provider + model (and base URL for local
 * runtimes). API keys are NOT entered here — they come from env vars / config file;
 * we only show whether a key was detected.
 */
export function SettingsPopover() {
  const [providers, setProviders] = useState<ProviderMeta[]>([]);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d: { prefs: Prefs; providers: ProviderMeta[] }) => {
        setPrefs(d.prefs);
        setProviders(d.providers);
      })
      .catch(() => {});
  }, []);

  // Auto-fetch available models when the active provider changes.
  useEffect(() => {
    const provider = prefs?.activeProvider;
    if (!provider) return;
    let cancelled = false;
    fetch(`/api/models?provider=${provider}`)
      .then((r) => r.json())
      .then((d: { models: string[] }) => !cancelled && setModels(d.models ?? []))
      .catch(() => !cancelled && setModels([]));
    return () => {
      cancelled = true;
    };
  }, [prefs?.activeProvider]);

  const active = providers.find((p) => p.id === prefs?.activeProvider);

  function update(patch: Partial<Prefs>) {
    setPrefs((prev) => (prev ? { ...prev, ...patch } : prev));
    setSaved(false);
  }

  async function save() {
    if (!prefs) return;
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(prefs),
    });
    setSaved(true);
  }

  return (
    <Popover.Root>
      <Popover.Trigger className={styles.trigger} aria-label="Settings">
        <GearIcon />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="top" align="start" sideOffset={8}>
          <Popover.Popup className={styles.popup}>
            <Popover.Title className={styles.title}>AI provider</Popover.Title>

            {!prefs ? (
              <p className={styles.hint}>Loading…</p>
            ) : (
              <>
                <label className={styles.field}>
                  <span className={styles.label}>Provider</span>
                  <select
                    className={styles.control}
                    value={prefs.activeProvider}
                    onChange={(e) => update({ activeProvider: e.target.value })}
                  >
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>

                {active && (
                  <p className={styles.keyStatus}>
                    {active.keyDetected ? (
                      <span className={styles.ok}>● key detected</span>
                    ) : (
                      <span className={styles.warn}>● no key — set it in app/.env.local</span>
                    )}
                  </p>
                )}

                <label className={styles.field}>
                  <span className={styles.label}>Model</span>
                  <input
                    className={styles.control}
                    list={`models-${prefs.activeProvider}`}
                    value={prefs.models[prefs.activeProvider] ?? ""}
                    placeholder={active?.defaultModel || "model id"}
                    onChange={(e) =>
                      update({
                        models: { ...prefs.models, [prefs.activeProvider]: e.target.value },
                      })
                    }
                  />
                  <datalist id={`models-${prefs.activeProvider}`}>
                    {models.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                </label>

                {active?.editableBaseURL && (
                  <label className={styles.field}>
                    <span className={styles.label}>Base URL</span>
                    <input
                      className={styles.control}
                      value={prefs.baseURLs[prefs.activeProvider] ?? ""}
                      placeholder={active.baseURL}
                      onChange={(e) =>
                        update({
                          baseURLs: { ...prefs.baseURLs, [prefs.activeProvider]: e.target.value },
                        })
                      }
                    />
                  </label>
                )}

                <button className={styles.save} onClick={save}>
                  {saved ? "Saved" : "Save"}
                </button>
              </>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function GearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M12 2.5v2M12 19.5v2M21.5 12h-2M4.5 12h-2M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4M18.7 18.7l-1.4-1.4M6.7 6.7 5.3 5.3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
