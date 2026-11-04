"use client";

import { useEffect, useMemo, useState } from "react";
import { Autocomplete } from "@base-ui-components/react/autocomplete";
import { Popover } from "@base-ui-components/react/popover";
import { Select } from "@base-ui-components/react/select";
import { getJson, sendJson } from "@/components/api";
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
    getJson<{ prefs: Prefs; providers: ProviderMeta[]; searchProviders: SearchProviderMeta[] }>(
      "/api/settings",
    )
      .then((d) => {
        setPrefs(d.prefs);
        setProviders(d.providers);
        setSearchProviders(d.searchProviders ?? []);
      })
      .catch(() => {});
  }, []);

  // Auto-fetch available models when the active provider changes.
  useEffect(() => {
    const provider = prefs?.activeProvider;
    if (!provider) return;
    let cancelled = false;
    getJson<{ models: string[] }>(`/api/models?provider=${provider}`)
      .then((d) => !cancelled && setModels(d.models ?? []))
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
    const res = await sendJson("/api/settings", "PUT", prefs).catch(() => null);
    if (res?.ok) setSaved(true);
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

                <ModelField
                  models={models}
                  value={prefs.models[prefs.activeProvider] ?? ""}
                  placeholder={active?.defaultModel || "model id"}
                  onChange={(model) =>
                    update({ models: { ...prefs.models, [prefs.activeProvider]: model } })
                  }
                />

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

/**
 * The model id: free text, with the provider's models suggested as you type (or all of them
 * from the chevron). The one in use is checked; anything typed is kept as-is.
 */
function ModelField({
  models,
  value,
  placeholder,
  onChange,
}: {
  models: string[];
  value: string;
  placeholder: string;
  onChange: (model: string) => void;
}) {
  // What you've typed since the list opened; null shows every model (e.g. when the field
  // already holds a full id, opening the list shouldn't narrow it to that one).
  const [query, setQuery] = useState<string | null>(null);
  const shown = useMemo(() => {
    const q = query?.trim().toLowerCase();
    return q ? models.filter((m) => m.toLowerCase().includes(q)) : models;
  }, [models, query]);

  return (
    <div className={styles.field}>
      <span className={styles.label}>Model</span>
      <Autocomplete.Root
        items={models}
        filteredItems={shown}
        value={value}
        onValueChange={(model, details) => {
          onChange(model);
          setQuery(details.reason === "input-change" ? model : null);
        }}
        // Opening by click or chevron shows everything; opening by typing keeps the query.
        onOpenChange={(open, details) => {
          if (open && details.reason !== "input-change") setQuery(null);
        }}
        openOnInputClick
      >
        <div className={styles.combo}>
          <Autocomplete.Input
            className={`${styles.control} ${styles.comboInput}`}
            placeholder={placeholder}
            aria-label="Model"
          />
          <Autocomplete.Trigger className={styles.comboTrigger} aria-label="Show models">
            <ChevronIcon />
          </Autocomplete.Trigger>
        </div>
        <Autocomplete.Portal>
          <Autocomplete.Positioner
            className={styles.selectPositioner}
            side="bottom"
            align="start"
            sideOffset={6}
          >
            <Autocomplete.Popup className={`${styles.selectPopup} ${styles.modelPopup}`}>
              <Autocomplete.Empty className={styles.modelEmpty}>
                {models.length === 0
                  ? "No model list for this provider. Type a model id."
                  : "No matching models. The id you typed will be used."}
              </Autocomplete.Empty>
              <Autocomplete.List className={styles.modelList}>
                {(model: string) => (
                  <Autocomplete.Item
                    key={model}
                    value={model}
                    className={`${styles.selectItem} ${styles.modelItem}`}
                    data-current={model === value || undefined}
                  >
                    <span className={styles.modelName}>{model}</span>
                    {model === value && <CheckIcon />}
                  </Autocomplete.Item>
                )}
              </Autocomplete.List>
            </Autocomplete.Popup>
          </Autocomplete.Positioner>
        </Autocomplete.Portal>
      </Autocomplete.Root>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12l5 5l10 -10" />
    </svg>
  );
}

/** A cog: Tabler's outline "settings" (MIT). */
function GearIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z" />
      <path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
    </svg>
  );
}
