PARROT
======

Parrot is a PDF reader with highlights, notes, flashcards and an AI assistant.
It runs on your own computer and opens in your normal web browser. Nothing to install.


START
-----
1. Unzip this folder somewhere you'll keep it (e.g. Documents\parrot).
   Don't run it from inside the zip.
2. Double-click "Start Parrot.bat".
   A black window opens, then Parrot opens in your browser at http://localhost:3737

Keep the black window open while you use Parrot. Close it to stop Parrot.
If Windows shows "Windows protected your PC", click "More info" -> "Run anyway".

Tip: in Chrome or Edge, use the browser menu -> "Cast, save and share" -> "Install page as app"
(or "Apps" -> "Install this site as an app") to get a Parrot icon and its own window.
You still need to start "Start Parrot.bat" first.


TURN ON THE AI ("Ask Parrot", AI flashcards)
--------------------------------------------
The AI features use your own API key, so usage is billed to your account.

1. Get a key from a provider, e.g.
     Anthropic:  https://console.anthropic.com
     OpenAI:     https://platform.openai.com
     Google:     https://aistudio.google.com
2. Open the folder  %USERPROFILE%\.parrot
   (paste that into the File Explorer address bar; it appears after Parrot's first start).
3. Create a file there named  config.json  containing, for example:

     {
       "anthropic": { "apiKey": "paste-your-key-here" }
     }

   Other names you can use instead of "anthropic": "openai", "google", "xai", "groq",
   "openrouter". You can list several.
4. In Parrot, open Settings and pick that provider.

Keep config.json private. It is never sent anywhere except to that provider.


YOUR DATA
---------
Your PDFs, highlights, notes and flashcards are stored only on this computer, in
%USERPROFILE%\.parrot . Back up that folder to keep them safe.


UPDATING
--------
Delete the old Parrot folder and unzip the new one. Your data in %USERPROFILE%\.parrot
is kept.


PORT IN USE?
------------
If something else uses port 3737, set a different one before starting, e.g. in a
Command Prompt opened in this folder:
    set PARROT_PORT=3838
    "Start Parrot.bat"
