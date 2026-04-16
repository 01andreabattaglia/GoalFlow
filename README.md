# Sport Tech Project

Web app React + Vite per visualizzare tracking calcistico su radar 2D, video sincronizzato e dashboard analitiche (physical e pitch-control).

## Avvio rapido

```bash
npm install
npm run dev
```

Apri `http://localhost:5173`.

## Dati usati

I file principali sono in `public/data/`:

- `1886347_tracking_extrapolated.jsonl`
- `1886347_enriched_tracking.jsonl`
- `1886347_pitch_control.jsonl`
- `1886347_pitch_control_sw_average.jsonl`
- `1886347_pitch_control_minute_control.jsonl`
- `1886347_ball_touch_map_sw.jsonl`
- `1886347_match.json`
- `video_sync.json`

## Componenti principali

- `src/components/TrackingRadarWithDataLoader.jsx`: componente principale con canvas, controlli tempo, what-if e dashboard.
- `src/components/VideoPlayer.jsx`: player video con sync su timestamp radar.
- `src/components/TrackingRadar.jsx`: versione mock semplificata.

## Script utili

Cartella `scripts/`:

- calcolo pitch control
- creazione enriched tracking
- sincronizzazione timestamp video
- export parametri velocita/accelerazione giocatori

## Note

- FPS di default: `10`
- Pitch di default: `104m x 68m`
- Per dettagli: vedi documentazione in `docs/`
