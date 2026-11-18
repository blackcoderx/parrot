# Parrot browser extension

Save passages and notes from any web page into your Parrot library, filed under a subject or
left Unsorted, and use **Ask Parrot** on them, all from a side panel. Works in Chrome and Edge.

## Install

1. Start Parrot (`bun run dev` in `app/`, or the Windows package's **Start Parrot**).
2. Open `chrome://extensions` (or `edge://extensions`) and turn on **Developer mode**.
3. Click **Load unpacked** and pick this `extension` folder.
4. If Parrot isn't on `http://localhost:3000` (the Windows package uses
   `http://localhost:3737`), open the extension's **Details → Extension options** and set the
   address.

## Use

- Select text on a page, right-click, and choose **Save to Parrot** (write a note) or
  **Ask Parrot** (chat about it). With nothing selected, the clip is the whole page.
- The toolbar button, or **Alt+Shift+P**, does the same as Save to Parrot.
- In the panel, pick a subject (or Unsorted), then **Save note** / **Save thread**
  (Ctrl+Enter). A clip can have both a note and a thread.
- Find your clips in Parrot under **Web clips** on the home screen, and in each subject's
  **Web clips** tab. A clip's title takes you back to the passage on the page.

## How it works

The panel shows Parrot's own `/ext` page in a frame and passes it the page address, title and
selected text. That page saves through Parrot's API and chats with your configured AI provider,
exactly like Ask Parrot in the reader. Nothing goes anywhere except your own Parrot (and, when
you ask, your AI provider). Only extension pages can frame `/ext`, and it only accepts messages
from an extension.
