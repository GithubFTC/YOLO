

@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');

:root {
  /* ---- Palette: deep navy ops console ---- */
  --navy-950:        #060d18;   /* page bg */
  --navy-900:        #0a1422;   /* primary panels */
  --navy-850:        #0e1a2c;   /* secondary panels */
  --navy-800:        #142239;   /* raised surfaces */
  --navy-700:        #1c2d49;   /* inputs, controls */
  --navy-600:        #2a3d5c;   /* hover states */
  --navy-500:        #3b5278;   /* dividers, borders strong */

  --hairline:        rgba(140, 175, 220, 0.10);
  --hairline-strong: rgba(140, 175, 220, 0.18);
  --hairline-accent: rgba(140, 175, 220, 0.32);

  /* Text */
  --text-100:        #e8eef7;   /* primary readout */
  --text-200:        #c4cfdf;   /* body */
  --text-400:        #8a99b3;   /* secondary labels */
  --text-500:        #5e6e8a;   /* tertiary, dim */
  --text-600:        #44526b;   /* muted */

  /* Functional colors — restrained, like SCADA / nav charts */
  --accent:          #4aa8c4;   /* maritime cyan-teal (NOAA bathy chart) */
  --accent-dim:      #2c7a91;
  --accent-bright:   #6bc8e0;
  --signal-ok:       #5ba872;   /* muted forest green, like buoy indicator */
  --signal-warn:     #d4a04a;   /* amber, hazard buoy */
  --signal-alert:    #c45a4a;   /* deep red, port-side */
  --signal-info:     #6b8bb5;

  /* Layout */
  --radius-sm:       3px;
  --radius:          4px;
  --radius-lg:       6px;

  --sans:            'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --mono:            'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace;

  --shadow-panel:    0 1px 0 rgba(255,255,255,0.02) inset,
                     0 0 0 0.5px var(--hairline);
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  background:
    /* faint grid, like a chart overlay */
    linear-gradient(rgba(74, 168, 196, 0.015) 1px, transparent 1px) 0 0 / 32px 32px,
    linear-gradient(90deg, rgba(74, 168, 196, 0.015) 1px, transparent 1px) 0 0 / 32px 32px,
    var(--navy-950);
  color: var(--text-200);
  font-family: var(--sans);
  font-size: 13px;
  line-height: 1.5;
  min-height: 100vh;
  letter-spacing: 0.01em;
  -webkit-font-smoothing: antialiased;
}

.app {
  max-width: 1100px;
  margin: 0 auto;
  padding: 20px;
}

/*   
   HEADER — operations bar
      */
.app-header {
  display: flex;
  justify-content: space-between;
  align-items: stretch;
  background: var(--navy-900);
  border: 0.5px solid var(--hairline-strong);
  border-radius: var(--radius);
  margin-bottom: 14px;
  overflow: hidden;
}

.brand {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 18px;
  border-right: 0.5px solid var(--hairline-strong);
  background: var(--navy-850);
}

.brand-mark {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--accent);
  color: var(--accent);
  font-size: 14px;
  font-family: var(--mono);
  font-weight: 600;
  border-radius: 2px;
}

.brand-name {
  font-family: var(--mono);
  font-size: 12px;
  font-weight: 600;
  color: var(--text-100);
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.brand-version {
  font-family: var(--mono);
  font-size: 10px;
  color: var(--text-500);
  letter-spacing: 0.1em;
  padding: 2px 6px;
  border: 0.5px solid var(--hairline-strong);
  border-radius: 2px;
}

.stats {
  display: flex;
  align-items: stretch;
}

.stat {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 8px 18px;
  border-left: 0.5px solid var(--hairline-strong);
  min-width: 80px;
}

.stat-label {
  font-family: var(--mono);
  font-size: 9px;
  color: var(--text-500);
  letter-spacing: 0.18em;
  text-transform: uppercase;
  margin-bottom: 2px;
}

.stat-val {
  font-family: var(--mono);
  font-size: 16px;
  font-weight: 500;
  color: var(--text-100);
  font-variant-numeric: tabular-nums;
}

/*   
   MODE TABS
      */
.mode-tabs {
  display: flex;
  gap: 0;
  margin-bottom: 12px;
  background: var(--navy-900);
  border: 0.5px solid var(--hairline-strong);
  border-radius: var(--radius);
  padding: 3px;
}

.mode-tab {
  flex: 1;
  background: transparent;
  border: none;
  color: var(--text-400);
  font-family: var(--sans);
  font-size: 12px;
  font-weight: 500;
  padding: 9px 16px;
  cursor: pointer;
  border-radius: 2px;
  letter-spacing: 0.04em;
  transition: background 0.15s, color 0.15s;
}

.mode-tab:hover {
  color: var(--text-100);
}

.mode-tab.active {
  background: var(--navy-700);
  color: var(--text-100);
}

/*   
   STATUS BAR
      */
.status-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--navy-900);
  border: 0.5px solid var(--hairline-strong);
  border-radius: var(--radius);
  padding: 8px 14px;
  margin-bottom: 12px;
  font-family: var(--mono);
  font-size: 11px;
  color: var(--text-400);
}

.status-bar::before {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 2px rgba(74, 168, 196, 0.18);
  flex-shrink: 0;
}

#status {
  flex: 1;
}

/*   
   VIEWPORT — the main video display
      */
.viewport {
  position: relative;
  background: #020912;
  border: 0.5px solid var(--hairline-strong);
  border-radius: var(--radius);
  overflow: hidden;
  aspect-ratio: 4 / 3;
}

.viewport video,
.viewport canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.viewport canvas {
  pointer-events: none;
}

/* corner brackets — like a tactical display */
.viewport::before,
.viewport::after {
  content: '';
  position: absolute;
  width: 16px;
  height: 16px;
  border: 1px solid var(--accent);
  opacity: 0.6;
  pointer-events: none;
  z-index: 4;
}
.viewport::before {
  top: 8px; left: 8px;
  border-right: none; border-bottom: none;
}
.viewport::after {
  bottom: 8px; right: 8px;
  border-left: none; border-top: none;
}

/* HUD — overlay text */
.hud {
  position: absolute;
  top: 14px;
  left: 14px;
  font-family: var(--mono);
  font-size: 10px;
  color: var(--accent);
  line-height: 1.7;
  pointer-events: none;
  letter-spacing: 0.1em;
  z-index: 5;
}
.hud > div:first-child {
  color: var(--text-100);
  font-weight: 600;
  margin-bottom: 2px;
}

.hud-rec {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--signal-alert) !important;
  font-weight: 600;
  margin-top: 6px;
  padding: 2px 8px;
  background: rgba(196, 90, 74, 0.15);
  border: 0.5px solid var(--signal-alert);
  border-radius: 2px;
  width: fit-content;
}
.hud-rec::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--signal-alert);
  animation: rec-pulse 1.2s ease-in-out infinite;
}
@keyframes rec-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%      { opacity: 0.3; transform: scale(0.8); }
}

/* Offline message */
.overlay-msg {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 20px;
  color: var(--text-400);
  font-family: var(--mono);
  z-index: 3;
}
.overlay-msg-title {
  font-size: 13px;
  color: var(--accent);
  margin-bottom: 8px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
}
.overlay-msg-sub {
  font-size: 11px;
  color: var(--text-500);
  letter-spacing: 0.05em;
}

/* Upload progress */
.progress-bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 2px;
  background: rgba(74, 168, 196, 0.12);
  z-index: 6;
}
.progress-fill {
  height: 100%;
  background: var(--accent);
  width: 0;
  transition: width 0.15s linear;
}

/*   
   CONTROLS
      */
.controls {
  display: flex;
  gap: 6px;
  margin-top: 12px;
  flex-wrap: wrap;
  align-items: center;
  background: var(--navy-900);
  border: 0.5px solid var(--hairline-strong);
  border-radius: var(--radius);
  padding: 10px 12px;
}

.btn {
  font-family: var(--sans);
  font-size: 12px;
  font-weight: 500;
  padding: 8px 14px;
  background: var(--navy-700);
  color: var(--text-100);
  border: 0.5px solid var(--hairline-strong);
  border-radius: var(--radius-sm);
  cursor: pointer;
  letter-spacing: 0.02em;
  transition: background 0.12s, border-color 0.12s, transform 0.05s;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.btn:hover:not(:disabled) {
  background: var(--navy-600);
  border-color: var(--hairline-accent);
}

.btn:active:not(:disabled) {
  transform: translateY(0.5px);
}

.btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.btn-primary {
  background: var(--accent-dim);
  color: var(--text-100);
  border-color: var(--accent);
}
.btn-primary:hover:not(:disabled) {
  background: var(--accent);
  border-color: var(--accent-bright);
}

.btn-rec {
  background: rgba(196, 90, 74, 0.25);
  border-color: var(--signal-alert);
  color: #f0c8c0;
}
.btn-rec:hover:not(:disabled) {
  background: rgba(196, 90, 74, 0.4);
}

.toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  margin-left: auto;
  cursor: pointer;
  color: var(--text-400);
  font-family: var(--mono);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 6px 10px;
  border: 0.5px solid var(--hairline);
  border-radius: var(--radius-sm);
  transition: color 0.12s, border-color 0.12s;
}
.toggle:hover { color: var(--text-100); border-color: var(--hairline-strong); }
.toggle input {
  margin: 0;
  accent-color: var(--accent);
  width: 12px;
  height: 12px;
}

/*   
   SLIDERS PANEL
      */
.sliders {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px 16px;
  margin-top: 12px;
  padding: 14px 16px;
  background: var(--navy-900);
  border: 0.5px solid var(--hairline-strong);
  border-radius: var(--radius);
}

@media (max-width: 800px) {
  .sliders { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 480px) {
  .sliders { grid-template-columns: 1fr; }
  .stats   { display: none; }
}

.slider-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 10px;
  margin-bottom: 6px;
  color: var(--text-500);
  font-family: var(--mono);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.slider-head span:last-child {
  color: var(--accent);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  font-size: 11px;
  letter-spacing: 0;
}

/* custom slider styling */
input[type="range"] {
  width: 100%;
  -webkit-appearance: none;
  appearance: none;
  height: 18px;
  background: transparent;
  cursor: pointer;
}
input[type="range"]::-webkit-slider-runnable-track {
  height: 2px;
  background: var(--navy-700);
  border-radius: 1px;
}
input[type="range"]::-moz-range-track {
  height: 2px;
  background: var(--navy-700);
  border-radius: 1px;
}
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 12px;
  height: 12px;
  background: var(--accent);
  border-radius: 50%;
  margin-top: -5px;
  border: 2px solid var(--navy-900);
  box-shadow: 0 0 0 1px var(--accent);
  transition: transform 0.1s;
}
input[type="range"]::-moz-range-thumb {
  width: 10px;
  height: 10px;
  background: var(--accent);
  border-radius: 50%;
  border: 2px solid var(--navy-900);
  box-shadow: 0 0 0 1px var(--accent);
}
input[type="range"]:hover::-webkit-slider-thumb {
  transform: scale(1.15);
}

/*   
   DATASET PANEL — captured frames overview
      */
.dataset-panel {
  margin-top: 12px;
  background: var(--navy-900);
  border: 0.5px solid var(--hairline-strong);
  border-radius: var(--radius);
}

.dataset-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  border-bottom: 0.5px solid var(--hairline);
}

.dataset-title {
  font-family: var(--mono);
  font-size: 10px;
  font-weight: 600;
  color: var(--text-100);
  letter-spacing: 0.15em;
  text-transform: uppercase;
}

.dataset-folders {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 8px;
  padding: 12px 14px;
  min-height: 30px;
}

.folder-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--navy-850);
  border: 0.5px solid var(--hairline);
  border-left: 2px solid var(--accent);
  border-radius: 2px;
  transition: background 0.12s;
}
.folder-card:hover {
  background: var(--navy-800);
}

.folder-icon {
  font-size: 16px;
  line-height: 1;
  opacity: 0.85;
}

.folder-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.folder-name {
  font-family: var(--mono);
  font-size: 12px;
  font-weight: 500;
  color: var(--text-100);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.folder-count {
  font-family: var(--mono);
  font-size: 10px;
  color: var(--text-500);
  margin-top: 2px;
  letter-spacing: 0.05em;
}

.muted {
  color: var(--text-500);
  font-family: var(--mono);
  font-size: 11px;
}

/*   
   DETECTIONS LOG
      */
.detections {
  margin-top: 12px;
  font-family: var(--mono);
  font-size: 11px;
  line-height: 1.7;
  background: var(--navy-900);
  border: 0.5px solid var(--hairline-strong);
  border-radius: var(--radius);
  padding: 12px 14px;
  min-height: 80px;
  max-height: 180px;
  overflow-y: auto;
  position: relative;
}
.detections::before {
  content: 'DETECTION LOG';
  display: block;
  font-size: 9px;
  color: var(--text-500);
  letter-spacing: 0.18em;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 0.5px solid var(--hairline);
}

.detections::-webkit-scrollbar {
  width: 6px;
}
.detections::-webkit-scrollbar-track {
  background: transparent;
}
.detections::-webkit-scrollbar-thumb {
  background: var(--navy-700);
  border-radius: 3px;
}

/*   
   FOOTER
      */
.app-footer {
  display: flex;
  justify-content: space-between;
  font-family: var(--mono);
  font-size: 10px;
  color: var(--text-500);
  margin-top: 16px;
  padding: 10px 14px;
  border-top: 0.5px solid var(--hairline);
  letter-spacing: 0.05em;
}

.app-footer a {
  color: var(--accent);
  text-decoration: none;
}
.app-footer a:hover { color: var(--accent-bright); }
