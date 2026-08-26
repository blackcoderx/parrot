"use client";

import { useEffect, useMemo, useState } from "react";
import { Popover } from "@base-ui-components/react/popover";
import { Select } from "@base-ui-components/react/select";
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

interface SearchProviderMeta {
  id: string;
  label: string;
  keyDetected: boolean;
}

interface Prefs {
  activeProvider: string;
  models: Record<string, string>;
  baseURLs: Record<string, string>;
  search: { enabled: boolean; provider: string };
}

/**
 * Settings popover: pick the active AI provider + model (and base URL for local
 * runtimes). API keys are NOT entered here — they come from env vars / config file;
 * we only show whether a key was detected.
 */
export function SettingsPopover() {
  const [providers, setProviders] = useState<ProviderMeta[]>([]);
  const [searchProviders, setSearchProviders] = useState<SearchProviderMeta[]>([]);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then(
        (d: { prefs: Prefs; providers: ProviderMeta[]; searchProviders: SearchProviderMeta[] }) => {
          setPrefs(d.prefs);
          setProviders(d.providers);
          setSearchProviders(d.searchProviders ?? []);
        },
      )
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
  const activeSearch = searchProviders.find((s) => s.id === prefs?.search.provider);

  // Map id -> label so the Select trigger shows the provider name.
  const providerItems = useMemo(
    () => Object.fromEntries(providers.map((p) => [p.id, p.label] as const)),
    [providers],
  );
  const searchProviderItems = useMemo(
    () => Object.fromEntries(searchProviders.map((s) => [s.id, s.label] as const)),
    [searchProviders],
  );

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
                  <Select.Root
                    items={providerItems}
                    value={prefs.activeProvider}
                    onValueChange={(v) => update({ activeProvider: v as string })}
                  >
                    <Select.Trigger className={styles.select}>
                      <Select.Value />
                      <Select.Icon className={styles.selectIcon}>
                        <ChevronIcon />
                      </Select.Icon>
                    </Select.Trigger>
                    <Select.Portal>
                      <Select.Positioner
                        className={styles.selectPositioner}
                        side="bottom"
                        align="start"
                        sideOffset={6}
                        alignItemWithTrigger={false}
                      >
                        <Select.Popup className={styles.selectPopup}>
                          {providers.map((p) => (
                            <Select.Item key={p.id} value={p.id} className={styles.selectItem}>
                              <Select.ItemText>{p.label}</Select.ItemText>
                            </Select.Item>
                          ))}
                        </Select.Popup>
                      </Select.Positioner>
                    </Select.Portal>
                  </Select.Root>
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

                <div className={styles.divider} />

                <div className={styles.toggleRow}>
                  <span className={styles.label}>Web search</span>
                  <input
                    type="checkbox"
                    className={styles.checkbox}
                    checked={prefs.search.enabled}
                    aria-label="Enable web search"
                    onChange={(e) =>
                      update({ search: { ...prefs.search, enabled: e.target.checked } })
                    }
                  />
                </div>

                {prefs.search.enabled && (
                  <>
                    <label className={styles.field}>
                      <span className={styles.label}>Search provider</span>
                      <Select.Root
                        items={searchProviderItems}
                        value={prefs.search.provider}
                        onValueChange={(v) =>
                          update({ search: { ...prefs.search, provider: v as string } })
                        }
                      >
                        <Select.Trigger className={styles.select}>
                          <Select.Value />
                          <Select.Icon className={styles.selectIcon}>
                            <ChevronIcon />
                          </Select.Icon>
                        </Select.Trigger>
                        <Select.Portal>
                          <Select.Positioner
                            className={styles.selectPositioner}
                            side="bottom"
                            align="start"
                            sideOffset={6}
                            alignItemWithTrigger={false}
                          >
                            <Select.Popup className={styles.selectPopup}>
                              {searchProviders.map((s) => (
                                <Select.Item key={s.id} value={s.id} className={styles.selectItem}>
                                  <Select.ItemText>{s.label}</Select.ItemText>
                                </Select.Item>
                              ))}
                            </Select.Popup>
                          </Select.Positioner>
                        </Select.Portal>
                      </Select.Root>
                    </label>

                    {activeSearch && (
                      <p className={styles.keyStatus}>
                        {activeSearch.keyDetected ? (
                          <span className={styles.ok}>● key detected</span>
                        ) : (
                          <span className={styles.warn}>● no key — set it in app/.env.local</span>
                        )}
                      </p>
                    )}
                  </>
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

function ChevronIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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
