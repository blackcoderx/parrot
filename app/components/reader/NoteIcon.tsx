interface Props {
  size?: number;
}

/** A small lined-note glyph, shared by the Note-pen button and note-highlight badge. */
export function NoteIcon({ size = 18 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 3.5h14a1.5 1.5 0 0 1 1.5 1.5v10.5L15 21H5A1.5 1.5 0 0 1 3.5 19.5v-15A1.5 1.5 0 0 1 5 3.5z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M14.5 20.5V16a1 1 0 0 1 1-1h4.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M7 8h10M7 11.5h10M7 15h4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
