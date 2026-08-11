G23 PLAYER — ANDROID (via GitHub Actions)
============================================

COME OTTENERE L'APK (nessun Android Studio, nessuna build locale)
1. Crea un account GitHub gratuito se non ce l'hai (github.com)
2. Crea un nuovo repository (può essere privato)
3. Carica TUTTI i file di questa cartella nel repository (trascina
   tutto nella pagina web di GitHub con "Add file > Upload files",
   oppure con git se lo conosci — mantieni la struttura delle cartelle,
   incluso .github/workflows/)
4. Vai sulla tab "Actions" del repository — dovrebbe partire da solo
   un workflow chiamato "Build Android APK" (altrimenti: tab Actions >
   "Build Android APK" > "Run workflow")
5. Aspetta (10-15 minuti circa la prima volta — sta scaricando Android
   SDK sui server di GitHub, gratis, non sul tuo PC)
6. Quando finisce (spunta verde), apri quella run > in fondo alla
   pagina c'è "Artifacts" > scarica "G23Player-debug-apk"
7. È uno zip che contiene app-debug.apk — quello è l'app. Copialo sul
   telefono e installalo (Android chiederà di autorizzare "installa da
   fonti sconosciute" la prima volta, è normale per un apk non dal
   Play Store)

COSA C'È
- Stessa estetica HUD (colori, font, layout)
- LIBRARY: selezioni uno o più file audio dal telefono, riproduzione
  con play/pausa/avanti/indietro/±10s/shuffle/repeat
- S+R: lo stesso motore che su desktop — velocità, riverbero (5 tipi
  di stanza), bass boost, Nostalgia, loop A→B, preset, stima BPM
  (AUTO SPEED), render e download come WAV
- INFO: crediti

COSA MANCA RISPETTO A DESKTOP (limiti reali di Android, non pigrizia)
- Niente widget schermata Home — richiede codice nativo Kotlin/Java
  che va oltre questo primo giro; fattibile come aggiunta separata se
  vuoi, ma è codice che non posso testare io stesso finché non prova
  a compilarlo GitHub Actions
- Niente scansione automatica di cartelle — selezioni i file ogni
  volta che apri l'app (Android non lascia alle app tenere accesso
  permanente alle cartelle senza permessi avanzati)
- Niente copertine/metadata (titolo/artista) — uso solo il nome del
  file, per tenere la prima versione semplice e affidabile

TUTTO OFFLINE
Nessuna parte dell'app si connette a internet — l'unica cosa che usa
la rete è la build su GitHub (che gira sui LORO server, una volta),
non l'app finale sul telefono.

SE LA BUILD FALLISCE
Non posso testare questa pipeline io stesso (nessun accesso a GitHub
Actions da qui). Se il workflow fallisce, apri la run fallita, apri lo
step rosso, e incollami l'errore — lo sistemo dal log, esattamente
come abbiamo fatto per la versione desktop.
