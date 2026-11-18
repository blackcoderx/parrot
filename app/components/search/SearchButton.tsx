"use client";

import { useSyncExternalStore } from "react";
import { openSearch, SearchIcon } from "./SearchDialog";
import styles from "./SearchDialog.module.css";

const noSubscribe = () => () => {};

/** "Search  Ctrl K" (⌘K on a Mac): opens the global search. */
export function SearchButton({ className }: { className?: string }) {
  // Which modifier to show depends on the browser, so it's only known after hydration.
  const shortcut = useSyncExternalStore(
    noSubscribe,
    () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K"),
    () => null,
  );
  return (
    <button className={`${className ?? ""} ${styles.trigger}`} onClick={openSearch}>
      <SearchIcon size={14} />
      Search
      {shortcut && <kbd>{shortcut}</kbd>}
    </button>
  );
}
