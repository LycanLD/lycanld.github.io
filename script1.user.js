// ==UserScript==
// @name         S1lverBack.lol
// @namespace    https://s1lverback.lol/
// @version      4.1
// @description  S1lverBack.lol — shadcn/ui styled suite for deadshot.io (ESP, aim, external input bridge).
// @author       S1lverBack.lol
// @match        *://*deadshot.io/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=deadshot.io
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// @connect      localhost
// @run-at       document-start
// @license      MIT
// ==/UserScript==

(() => {
    'use strict';

    const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
    const safe = (fn, fallback = null) => { try { return fn(); } catch (_) { return fallback; } };

    const config = {
        aimMode: 'AIPD',
        fov: 300,
        sensitivity: 0.6,
        headOffset: 1.7,
        prediction: 0,
        aimbotEnabled: true,
        aimKey: 'Mouse2',
        aimToggle: false,
        externalAim: true,
        aimMethod: 'auto',
        aimScale: 1.0,
        maxSnap: 220,
        boxScale: 1.0,
        boxWidth: 0.62,
        stickyTarget: true,
        chamsEnabled: true,
        espBoxes: true,
        espStyle: 'Normal',
        espSource: 'Hybrid',
        espLines: true,
        espSkeleton: true,
        showFov: true,
        espColor: '#d7deea',
        smoothingEnabled: true,
        smoothing: 2,
        triggerbot: false,
        triggerbotDelay: 50,
        triggerbotFov: 18,
        triggerbotHold: 35,
        triggerbotCooldown: 120,
        aimkill: false,
        rapidFire: false,
        rapidFireDelay: 55,
        autoBhop: false,
        bhopInterval: 60,
        noRecoil: false,
        fly: false,
        speedHack: false,
        godMode: false,
        skinUnlocker: false,
        menuVisible: true,
        currentTab: 'AiM'
    };

    const DEFAULT_CONFIG = JSON.parse(JSON.stringify(config));
    const STORAGE_KEY = 's1lverback.config.v4';

    safe(() => {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const saved = JSON.parse(raw);
        if (!saved || typeof saved !== 'object') return;
        for (const key of Object.keys(DEFAULT_CONFIG)) {
            if (!(key in saved)) continue;
            if (typeof saved[key] === typeof DEFAULT_CONFIG[key]) config[key] = saved[key];
        }
    });

    let persistTimer = null;
    const persistConfig = () => {
        if (persistTimer) clearTimeout(persistTimer);
        persistTimer = setTimeout(() => {
            persistTimer = null;
            safe(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(config)));
        }, 220);
    };

    let configLinkOk = false;
    let configSendTimer = null;
    const sendConfig = () => {
        if (configSendTimer) clearTimeout(configSendTimer);
        configSendTimer = setTimeout(() => {
            configSendTimer = null;
            persistConfig();
            const payload = {
                method: config.aimMethod, externalAim: config.externalAim, aimScale: config.aimScale,
                fov: config.fov, sensitivity: config.sensitivity, maxSnap: config.maxSnap,
                smoothing: config.smoothing, smoothingEnabled: config.smoothingEnabled, aimMode: config.aimMode,
                headOffset: config.headOffset, aimKey: config.aimKey, aimToggle: config.aimToggle,
                triggerbotCooldown: config.triggerbotCooldown, triggerbotHold: config.triggerbotHold,
                rapidFireDelay: config.rapidFireDelay, bhopInterval: config.bhopInterval, ts: Date.now()
            };
            safe(() => {
                if (typeof GM_xmlhttpRequest !== 'function') { configLinkOk = false; return; }
                GM_xmlhttpRequest({
                    method: 'POST', url: 'http://127.0.0.1:8686/config',
                    headers: { 'Content-Type': 'application/json' }, data: JSON.stringify(payload), timeout: 1500,
                    onload: (r) => { configLinkOk = r.status >= 200 && r.status < 300; },
                    onerror: () => { configLinkOk = false; },
                    ontimeout: () => { configLinkOk = false; }
                });
            });
        }, 120);
    };

    const MENU_STYLE = `
        #s1lverback-menu {
            --background: #09090b;
            --foreground: #fafafa;
            --card: #18181b;
            --card-foreground: #fafafa;
            --popover: #18181b;
            --primary: #e4e4e7;
            --primary-foreground: #18181b;
            --secondary: #27272a;
            --secondary-foreground: #fafafa;
            --muted: #27272a;
            --muted-foreground: #a1a1aa;
            --accent: #27272a;
            --accent-foreground: #fafafa;
            --destructive: #f87171;
            --border: rgba(255,255,255,.1);
            --input: rgba(255,255,255,.15);
            --ring: #71717a;
            --radius: 10px;
            position: fixed; top: 24px; left: 24px; width: 392px;
            max-width: calc(100vw - 32px); max-height: calc(100vh - 48px);
            pointer-events: auto; display: flex; flex-direction: column; overflow: hidden;
            background: var(--background); color: var(--foreground);
            font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif;
            border: 1px solid var(--border); border-radius: var(--radius); z-index: 2147483647;
            box-shadow: 0 10px 38px -10px rgba(0,0,0,.55), 0 10px 20px -15px rgba(0,0,0,.5);
            user-select: none; font-size: 13px;
            transition: opacity .15s ease, transform .15s ease;
        }
        #s1lverback-menu.sb-hidden { opacity: 0; transform: translateY(-4px); pointer-events: none; }

        .menu-header {
            display: flex; align-items: center; justify-content: space-between; gap: 12px;
            padding: 14px; cursor: grab; background: transparent;
            border-bottom: 1px solid var(--border);
        }
        .menu-header:active { cursor: grabbing; }
        .sb-brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
        .sb-logo {
            width: 32px; height: 32px; flex: none; display: grid; place-items: center;
            border-radius: 8px; color: var(--foreground); font-size: 11px; font-weight: 700;
            letter-spacing: -.3px; background: var(--secondary); border: 1px solid var(--border);
        }
        .sb-brandtext { display: flex; flex-direction: column; min-width: 0; }
        .sb-title { font-size: 14px; font-weight: 600; line-height: 1.2; letter-spacing: -.01em; color: var(--foreground); }
        .sb-title .sb-tld { color: var(--muted-foreground); font-weight: 500; }
        .sb-sub { margin-top: 2px; font-size: 10px; font-weight: 500; letter-spacing: .08em; text-transform: uppercase; color: var(--muted-foreground); }
        .sb-top-actions { display: flex; align-items: center; gap: 4px; }
        .sb-icon-btn {
            width: 28px; height: 28px; display: grid; place-items: center;
            border: 1px solid transparent; border-radius: 6px; cursor: pointer;
            background: transparent; color: var(--muted-foreground); font-family: inherit; font-size: 14px;
            transition: background .15s, color .15s;
        }
        .sb-icon-btn:hover { background: var(--accent); color: var(--accent-foreground); }

        .sb-tabs {
            display: grid; grid-template-columns: repeat(4, 1fr); gap: 2px;
            margin: 10px 12px 0; padding: 3px; border-radius: 8px; background: var(--muted);
        }
        .tab {
            padding: 6px 4px; text-align: center; border-radius: 6px; cursor: pointer;
            font-size: 12px; font-weight: 500; color: var(--muted-foreground);
            transition: background .15s, color .15s, box-shadow .15s;
        }
        .tab:hover { color: var(--foreground); }
        .tab.active { background: var(--background); color: var(--foreground); box-shadow: 0 1px 2px rgba(0,0,0,.25); }

        .menu-content {
            padding: 12px; max-height: calc(100vh - 220px); min-height: 0; overflow-y: auto; flex: 1;
            scrollbar-width: thin; scrollbar-color: #3f3f46 transparent;
        }
        .menu-content::-webkit-scrollbar { width: 6px; }
        .menu-content::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 999px; }
        .menu-content::-webkit-scrollbar-track { background: transparent; }
        .content-pane { display: none; }
        .content-pane.active { display: block; animation: sbIn .12s ease; }
        @keyframes sbIn { from { opacity: 0; transform: translateY(2px); } to { opacity: 1; transform: none; } }

        .sb-card {
            margin-bottom: 10px; padding: 14px; border-radius: 8px;
            background: var(--card); color: var(--card-foreground);
            border: 1px solid var(--border); box-shadow: 0 1px 2px rgba(0,0,0,.05);
        }
        .sb-card-title {
            display: flex; align-items: center; justify-content: space-between; gap: 8px;
            margin-bottom: 10px; font-size: 13px; font-weight: 600;
            letter-spacing: -.01em; color: var(--card-foreground);
        }
        .sb-badge {
            padding: 2px 7px; border-radius: 6px; font-size: 10px; font-weight: 500; line-height: 1.4;
            color: var(--muted-foreground); background: var(--secondary); border: 1px solid var(--border);
        }
        .sb-badge.muted { background: transparent; }

        .control-row {
            display: flex; align-items: center; justify-content: space-between; gap: 12px;
            min-height: 34px; padding: 1px 0; font-size: 13px; color: var(--foreground);
        }
        .control-row > span:first-child { flex: 1; min-width: 0; }

        select {
            appearance: none; -webkit-appearance: none; max-width: 180px; height: 32px;
            padding: 0 28px 0 10px; background-color: transparent; color: var(--foreground);
            border: 1px solid var(--input); border-radius: 6px; outline: none; cursor: pointer;
            font-family: inherit; font-size: 12px;
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23a1a1aa' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
            background-repeat: no-repeat; background-position: right 8px center;
        }
        select:focus { border-color: var(--ring); box-shadow: 0 0 0 2px rgba(113,113,122,.35); }

        .switch { position: relative; display: inline-block; flex: none; width: 32px; height: 18px; }
        .switch input { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; z-index: 2; }
        .slider-t {
            position: absolute; inset: 0; border-radius: 999px; background: var(--input);
            border: 1px solid transparent; transition: background .15s;
        }
        .slider-t:before {
            content: ""; position: absolute; left: 1px; top: 1px; width: 14px; height: 14px; border-radius: 50%;
            background: var(--foreground); transition: transform .15s, background .15s;
        }
        input:checked + .slider-t { background: var(--primary); }
        input:checked + .slider-t:before { transform: translateX(14px); background: var(--primary-foreground); }

        .a-row { margin: 2px 0 10px; }
        .a-label {
            display: flex; align-items: center; justify-content: space-between; gap: 8px;
            margin-bottom: 6px; font-size: 12px; color: var(--muted-foreground);
        }
        .a-val {
            min-width: 30px; padding: 0 6px; border-radius: 6px; text-align: center;
            color: var(--foreground); font-size: 11px; font-weight: 500; line-height: 18px;
            font-variant-numeric: tabular-nums; background: var(--secondary); border: 1px solid var(--border);
        }
        .a-slider {
            width: 100%; height: 4px; appearance: none; -webkit-appearance: none; outline: none;
            cursor: pointer; border-radius: 999px;
            background: linear-gradient(to right, var(--primary) 0%, var(--primary) var(--fill, 50%), var(--secondary) var(--fill, 50%), var(--secondary) 100%);
        }
        .a-slider::-webkit-slider-thumb {
            appearance: none; -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%;
            background: var(--background); border: 2px solid var(--primary); cursor: grab;
        }
        .a-slider::-moz-range-thumb {
            width: 14px; height: 14px; border-radius: 50%; background: var(--background);
            border: 2px solid var(--primary); cursor: grab;
        }

        .color-picker {
            appearance: none; -webkit-appearance: none; width: 36px; height: 24px; padding: 0;
            cursor: pointer; background: transparent; border: 1px solid var(--input); border-radius: 6px;
        }
        .color-picker::-webkit-color-swatch-wrapper { padding: 2px; }
        .color-picker::-webkit-color-swatch { border: none; border-radius: 4px; }

        button.sb-btn {
            height: 30px; border: 1px solid transparent; border-radius: 6px; padding: 0 12px;
            cursor: pointer; font-family: inherit; font-size: 12px; font-weight: 500;
            color: var(--primary-foreground); background: var(--primary);
            box-shadow: 0 1px 2px rgba(0,0,0,.15);
            transition: background .15s, color .15s, opacity .15s;
        }
        button.sb-btn:hover { opacity: .9; }
        button.sb-btn.tonal { background: var(--secondary); color: var(--secondary-foreground); box-shadow: none; }
        button.sb-btn.tonal:hover { background: #323237; opacity: 1; }
        button.sb-btn.text { background: transparent; color: var(--foreground); border-color: var(--border); box-shadow: none; }
        button.sb-btn.text:hover { background: var(--accent); }

        .sb-chips { display: flex; flex-wrap: wrap; gap: 6px; }
        .sb-chip {
            height: 28px; padding: 0 10px; border-radius: 6px; cursor: pointer;
            font-family: inherit; font-size: 12px; font-weight: 500; color: var(--foreground);
            background: transparent; border: 1px solid var(--input);
            transition: background .15s, color .15s, border-color .15s;
        }
        .sb-chip:hover { background: var(--accent); }
        .sb-chip.active { background: var(--primary); color: var(--primary-foreground); border-color: transparent; }

        .sb-kv {
            display: flex; align-items: center; justify-content: space-between; gap: 10px;
            padding: 5px 0; font-size: 12px; color: var(--muted-foreground);
        }
        .sb-kv b { color: var(--foreground); font-weight: 500; }
        .sb-kbd {
            display: inline-flex; align-items: center; height: 20px; padding: 0 5px; border-radius: 4px;
            background: var(--muted); border: 1px solid var(--border); font-size: 10px; font-weight: 500;
            color: var(--muted-foreground); font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        }
        .sb-note { font-size: 12px; line-height: 1.5; color: var(--muted-foreground); }
        .sb-note b { color: var(--foreground); font-weight: 500; }
        .sb-link { color: var(--foreground); font-weight: 500; text-decoration: underline; text-underline-offset: 2px; }

        .status-bar {
            display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 12px;
            background: transparent; border-top: 1px solid var(--border);
        }
        .status-bar span {
            display: inline-flex; align-items: center; gap: 6px; height: 22px; padding: 0 8px;
            border-radius: 6px; background: transparent; border: 1px solid var(--border);
            font-size: 10px; font-weight: 500; letter-spacing: 0; text-transform: none;
            color: var(--muted-foreground); white-space: nowrap;
        }
        .status-bar span::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--muted-foreground); }
        #stat-gl::before { background: #22c55e; }
        #stat-py[data-ok="1"]::before { background: #22c55e; }
        #stat-lock[data-ok="1"]::before { background: var(--foreground); }

        #overlay-canvas { position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 2147483646; }
        #mobile-toggle {
            --card: #18181b; --border: rgba(255,255,255,.1);
            --foreground: #fafafa; --accent: #27272a;
            position: fixed; bottom: 16px; right: 16px; width: 40px; height: 40px; display: none;
            place-items: center; background: var(--card); border: 1px solid var(--border);
            border-radius: 8px; z-index: 2147483647; cursor: pointer; color: var(--foreground);
            font-family: inherit; font-size: 11px; font-weight: 600;
            box-shadow: 0 4px 12px rgba(0,0,0,.35); pointer-events: auto;
        }
        #mobile-toggle:hover { background: var(--accent); }
        #mobile-toggle.sb-show { display: grid; }
    `;

    const MENU_MARKUP = `
        <div id="s1lverback-menu" class="${config.menuVisible === false ? 'sb-hidden' : ''}">
            <div class="menu-header" id="drag-handle">
                <div class="sb-brand">
                    <div class="sb-logo">S1</div>
                    <div class="sb-brandtext">
                        <span class="sb-title">S1lverBack<span class="sb-tld">.lol</span></span>
                        <span class="sb-sub">Deadshot.io · Local engine</span>
                    </div>
                </div>
                <div class="sb-top-actions">
                    <button id="sb-min" class="sb-icon-btn" title="Minimize">–</button>
                </div>
            </div>
            <div class="sb-tabs">
                <div class="tab ${config.currentTab === 'AiM' ? 'active' : ''}" data-tab="AiM">AiM</div>
                <div class="tab ${config.currentTab === 'eSP' ? 'active' : ''}" data-tab="eSP">eSP</div>
                <div class="tab ${config.currentTab === 'Misc' ? 'active' : ''}" data-tab="Misc">Misc</div>
                <div class="tab ${config.currentTab === 'Config' ? 'active' : ''}" data-tab="Config">Config</div>
            </div>
            <div class="menu-content">
                <div class="content-pane ${config.currentTab === 'AiM' ? 'active' : ''}" id="pane-AiM">
                    <div class="sb-card">
                        <div class="sb-card-title">Aimbot <span class="sb-badge">Core</span></div>
                        <div class="control-row"><span>Aimbot engine</span><label class="switch"><input type="checkbox" id="c-aim" ${config.aimbotEnabled ? 'checked' : ''}><span class="slider-t"></span></label></div>
                        <div class="control-row"><span>External engine</span><label class="switch"><input type="checkbox" id="c-extaim" ${config.externalAim ? 'checked' : ''}><span class="slider-t"></span></label></div>
                        <div class="control-row"><span>Input method</span><select id="s-aimmethod"><option value="handler"${config.aimMethod === 'handler' ? ' selected' : ''}>Handler (CDP)</option><option value="nudge"${config.aimMethod === 'nudge' ? ' selected' : ''}>Nudge (bridge)</option><option value="cdpInput"${config.aimMethod === 'cdpInput' ? ' selected' : ''}>CDP Input</option><option value="uinput"${config.aimMethod === 'uinput' ? ' selected' : ''}>uinput</option><option value="xdotool"${config.aimMethod === 'xdotool' ? ' selected' : ''}>xdotool (X11)</option><option value="ydotool"${config.aimMethod === 'ydotool' ? ' selected' : ''}>ydotool</option><option value="auto"${config.aimMethod === 'auto' ? ' selected' : ''}>Auto</option></select></div>
                        <div class="control-row"><span>Aim key</span><button id="b-aimkey" class="sb-btn tonal">${config.aimKey}</button></div>
                        <div class="control-row"><span>Toggle aim</span><label class="switch"><input type="checkbox" id="c-aimtoggle" ${config.aimToggle ? 'checked' : ''}><span class="slider-t"></span></label></div>
                        <div class="control-row"><span>Sticky targeting</span><label class="switch"><input type="checkbox" id="c-sticky" ${config.stickyTarget ? 'checked' : ''}><span class="slider-t"></span></label></div>
                    </div>
                    <div class="sb-card">
                        <div class="sb-card-title">Tuning</div>
                        <div class="a-row"><label class="a-label">Aim scale <span id="v-aimscale" class="a-val">${config.aimScale}</span></label><input type="range" id="i-aimscale" class="a-slider" min="0.1" max="4" step="0.05" value="${config.aimScale}"></div>
                        <div class="a-row"><label class="a-label">Aim FOV <span id="v-fov" class="a-val">${config.fov}</span></label><input type="range" id="i-fov" class="a-slider" min="10" max="1000" value="${config.fov}"></div>
                        <div class="a-row"><label class="a-label">Sensitivity <span id="v-sens" class="a-val">${config.sensitivity}</span></label><input type="range" id="i-sens" class="a-slider" min="0.05" max="1.5" step="0.05" value="${config.sensitivity}"></div>
                        <div class="control-row"><span>Smoothing</span><label class="switch"><input type="checkbox" id="c-smooth-t" ${config.smoothingEnabled ? 'checked' : ''}><span class="slider-t"></span></label></div>
                        <div class="a-row"><label class="a-label">Smooth value <span id="v-smooth" class="a-val">${config.smoothing}</span></label><input type="range" id="i-smooth" class="a-slider" min="1" max="20" value="${config.smoothing}"></div>
                        <div class="a-row"><label class="a-label">Head height <span id="v-head" class="a-val">${config.headOffset}</span></label><input type="range" id="i-head" class="a-slider" min="0.5" max="2.5" step="0.05" value="${config.headOffset}"></div>
                        <div class="a-row"><label class="a-label">Max snap <span id="v-snap" class="a-val">${config.maxSnap}</span></label><input type="range" id="i-snap" class="a-slider" min="10" max="300" step="5" value="${config.maxSnap}"></div>
                        <div class="a-row"><label class="a-label">Prediction <span id="v-pred" class="a-val">${config.prediction}</span></label><input type="range" id="i-pred" class="a-slider" min="0" max="2" step="0.1" value="${config.prediction}"></div>
                        <div class="control-row"><span>Aim mode</span><select id="s-mode"><option value="AIPD">AIPD (Adaptive)</option><option value="Rage">Rage</option><option value="Legit">Legit</option><option value="Legacy">Legacy</option></select></div>
                    </div>
                </div>

                <div class="content-pane ${config.currentTab === 'eSP' ? 'active' : ''}" id="pane-eSP">
                    <div class="sb-card">
                        <div class="sb-card-title">Overlay <span class="sb-badge">Live</span></div>
                        <div class="control-row"><span>Chams</span><label class="switch"><input type="checkbox" id="c-cham" ${config.chamsEnabled ? 'checked' : ''}><span class="slider-t"></span></label></div>
                        <div class="control-row"><span>ESP boxes</span><label class="switch"><input type="checkbox" id="c-espb" ${config.espBoxes ? 'checked' : ''}><span class="slider-t"></span></label></div>
                        <div class="control-row"><span>Skeleton</span><label class="switch"><input type="checkbox" id="c-esps" ${config.espSkeleton ? 'checked' : ''}><span class="slider-t"></span></label></div>
                        <div class="control-row"><span>Snaplines</span><label class="switch"><input type="checkbox" id="c-espl" ${config.espLines ? 'checked' : ''}><span class="slider-t"></span></label></div>
                        <div class="control-row"><span>Show FOV ring</span><label class="switch"><input type="checkbox" id="c-sfov" ${config.showFov ? 'checked' : ''}><span class="slider-t"></span></label></div>
                        <div class="control-row"><span>ESP color</span><input type="color" id="c-color" class="color-picker" value="${config.espColor}"></div>
                    </div>
                    <div class="sb-card">
                        <div class="sb-card-title">Detection</div>
                        <div class="control-row"><span>Player source</span><select id="s-espsrc"><option value="Normal"${config.espSource === 'Normal' ? ' selected' : ''}>Normal</option><option value="Hybrid"${config.espSource === 'Hybrid' ? ' selected' : ''}>Hybrid (texture)</option><option value="Bone"${config.espSource === 'Bone' ? ' selected' : ''}>Bone only</option></select></div>
                        <div class="control-row"><span>Box style</span><select id="s-esp-style"><option value="Normal">Normal</option><option value="Corner">Corner</option></select></div>
                        <div class="a-row"><label class="a-label">Box height <span id="v-boxh" class="a-val">${config.boxScale}</span></label><input type="range" id="i-boxh" class="a-slider" min="0.6" max="2" step="0.05" value="${config.boxScale}"></div>
                        <div class="a-row"><label class="a-label">Box width <span id="v-boxw" class="a-val">${config.boxWidth}</span></label><input type="range" id="i-boxw" class="a-slider" min="0.3" max="1.2" step="0.02" value="${config.boxWidth}"></div>
                    </div>
                </div>

                <div class="content-pane ${config.currentTab === 'Misc' ? 'active' : ''}" id="pane-Misc">
                    <div class="sb-card">
                        <div class="sb-card-title">Triggerbot <span class="sb-badge">Enemy only</span></div>
                        <div class="control-row"><span>Triggerbot</span><label class="switch"><input type="checkbox" id="c-trigger" ${config.triggerbot ? 'checked' : ''}><span class="slider-t"></span></label></div>
                        <div class="a-row"><label class="a-label">Trigger FOV <span id="v-tfov" class="a-val">${config.triggerbotFov}</span></label><input type="range" id="i-trigger-fov" class="a-slider" min="4" max="80" step="1" value="${config.triggerbotFov}"></div>
                        <div class="a-row"><label class="a-label">Trigger delay <span id="v-tdelay" class="a-val">${config.triggerbotDelay}</span></label><input type="range" id="i-trigger-delay" class="a-slider" min="0" max="500" step="5" value="${config.triggerbotDelay}"></div>
                        <div class="a-row"><label class="a-label">Hold <span id="v-thold" class="a-val">${config.triggerbotHold}</span></label><input type="range" id="i-trigger-hold" class="a-slider" min="10" max="200" step="5" value="${config.triggerbotHold}"></div>
                        <div class="a-row"><label class="a-label">Cooldown <span id="v-tcd" class="a-val">${config.triggerbotCooldown}</span></label><input type="range" id="i-trigger-cd" class="a-slider" min="30" max="1000" step="10" value="${config.triggerbotCooldown}"></div>
                    </div>
                    <div class="sb-card">
                        <div class="sb-card-title">Rage</div>
                        <div class="control-row"><span>Aimkill (aim + fire)</span><label class="switch"><input type="checkbox" id="c-aimkill" ${config.aimkill ? 'checked' : ''}><span class="slider-t"></span></label></div>
                        <div class="control-row"><span>Rapid fire (hold LMB)</span><label class="switch"><input type="checkbox" id="c-rapid" ${config.rapidFire ? 'checked' : ''}><span class="slider-t"></span></label></div>
                        <div class="a-row"><label class="a-label">Rapid delay <span id="v-rdelay" class="a-val">${config.rapidFireDelay}</span></label><input type="range" id="i-rapid-delay" class="a-slider" min="20" max="300" step="5" value="${config.rapidFireDelay}"></div>
                        <div class="control-row"><span>No recoil (aim assist)</span><label class="switch"><input type="checkbox" id="c-norecoil" ${config.noRecoil ? 'checked' : ''}><span class="slider-t"></span></label></div>
                    </div>
                    <div class="sb-card">
                        <div class="sb-card-title">Movement</div>
                        <div class="control-row"><span>Auto-bhop (hold Space)</span><label class="switch"><input type="checkbox" id="c-bhop" ${config.autoBhop ? 'checked' : ''}><span class="slider-t"></span></label></div>
                        <div class="a-row"><label class="a-label">Bhop tap <span id="v-bhopint" class="a-val">${config.bhopInterval}</span></label><input type="range" id="i-bhop-int" class="a-slider" min="20" max="200" step="5" value="${config.bhopInterval}"></div>
                        <div class="control-row"><span>Fly (jump spam)</span><label class="switch"><input type="checkbox" id="c-fly" ${config.fly ? 'checked' : ''}><span class="slider-t"></span></label></div>
                        <div class="control-row"><span>Speed (auto-sprint)</span><label class="switch"><input type="checkbox" id="c-speed" ${config.speedHack ? 'checked' : ''}><span class="slider-t"></span></label></div>
                    </div>
                    <div class="sb-card">
                        <div class="sb-card-title">Cosmetic <span class="sb-badge muted">No-op</span></div>
                        <div class="control-row"><span>God mode <span class="sb-note">server-side</span></span><label class="switch"><input type="checkbox" id="c-god" ${config.godMode ? 'checked' : ''}><span class="slider-t"></span></label></div>
                        <div class="control-row"><span>Skin unlocker <span class="sb-note">client-side</span></span><label class="switch"><input type="checkbox" id="c-skin" ${config.skinUnlocker ? 'checked' : ''}><span class="slider-t"></span></label></div>
                    </div>
                </div>

                <div class="content-pane ${config.currentTab === 'Config' ? 'active' : ''}" id="pane-Config">
                    <div class="sb-card">
                        <div class="sb-card-title">Presets</div>
                        <div class="sb-chips">
                            <button class="sb-chip" data-preset="legit">Legit</button>
                            <button class="sb-chip" data-preset="rage">Rage</button>
                            <button class="sb-chip" data-preset="silver">Silver</button>
                            <button class="sb-chip" data-preset="reset">Reset</button>
                        </div>
                    </div>
                    <div class="sb-card">
                        <div class="sb-card-title">Keybinds</div>
                        <div class="sb-kv"><span>Show / hide menu</span><span class="sb-kbd">R-Shift</span><span class="sb-kbd">Insert</span></div>
                        <div class="sb-kv"><span>Toggle aimbot</span><span class="sb-kbd">F1</span></div>
                        <div class="sb-kv"><span>Toggle ESP</span><span class="sb-kbd">F2</span></div>
                        <div class="sb-kv"><span>Aim key</span><span class="sb-kbd">configurable</span></div>
                    </div>
                    <div class="sb-card">
                        <div class="sb-card-title">About</div>
                        <div class="sb-kv"><span>Build</span><b>S1lverBack.lol v4.1</b></div>
                        <div class="sb-kv"><span>Design</span><b>shadcn/ui · Zinc</b></div>
                        <div class="sb-note">External engine bridge: <b>127.0.0.1:8686</b>. Config is saved locally and restored on load.</div>
                        <div class="sb-kv"><span>Home</span><a class="sb-link" href="https://s1lverback.lol/" target="_blank" rel="noreferrer">s1lverback.lol</a></div>
                    </div>
                    <div class="sb-card">
                        <div class="sb-card-title">Maintenance</div>
                        <button id="sb-reset" class="sb-btn tonal">Restore defaults</button>
                    </div>
                </div>
            </div>
            <div class="status-bar">
                <span id="stat-gl">WebGL</span>
                <span id="stat-py" data-ok="0">Py: off</span>
                <span id="stat-aim">Aim: idle</span>
                <span id="stat-lock" data-ok="0">Lock: none</span>
                <span id="stat-net">0 push</span>
            </div>
        </div>
        <div id="mobile-toggle" class="${config.menuVisible === false ? 'sb-show' : ''}">S1</div>
    `;

    let uiHost = null;
    let bindingAimKey = false;
    const reparentUI = () => {
        if (!uiHost) return;
        let target = safe(() => document.fullscreenElement, null);
        if (target && target.tagName === 'CANVAS') target = target.parentElement;
        target = target || document.body || document.documentElement;
        if (target && target !== uiHost) safe(() => target.appendChild(uiHost));
    };
    safe(() => document.addEventListener('fullscreenchange', reparentUI, true));
    safe(() => document.addEventListener('webkitfullscreenchange', reparentUI, true));

    const createUI = () => {
        if (!document.documentElement && !document.body) return null;
        const host = document.createElement('div');
        host.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:2147483647;';
        let root;
        const shadow = safe(() => host.attachShadow({ mode: 'closed' }));
        if (shadow) {
            root = shadow;
            root.innerHTML = `<style>${MENU_STYLE}</style>${MENU_MARKUP}<canvas id="overlay-canvas"></canvas>`;
        } else {
            root = document.createElement('div');
            root.innerHTML = `<style>${MENU_STYLE}</style>${MENU_MARKUP}<canvas id="overlay-canvas"></canvas>`;
        }
        uiHost = host;
        reparentUI();
        if (!shadow) host.appendChild(root);

        const $ = (id) => root.getElementById ? root.getElementById(id) : root.querySelector('#' + id);
        const menu = $('s1lverback-menu');
        const mobToggle = $('mobile-toggle');

        const setVisible = (visible) => {
            config.menuVisible = !!visible;
            menu.classList.toggle('sb-hidden', !visible);
            mobToggle.classList.toggle('sb-show', !visible);
            persistConfig();
        };

        const minBtn = $('sb-min');
        if (minBtn) minBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); setVisible(false); });

        let fabDrag = false, fabMoved = false, fabOrigin = { x: 0, y: 0 };
        mobToggle.addEventListener('pointerdown', (e) => {
            if (e.button !== undefined && e.button !== 0) return;
            fabDrag = true; fabMoved = false; fabOrigin = { x: e.clientX, y: e.clientY };
            safe(() => mobToggle.setPointerCapture(e.pointerId));
        });
        mobToggle.addEventListener('pointermove', (e) => {
            if (!fabDrag) return;
            if (Math.hypot(e.clientX - fabOrigin.x, e.clientY - fabOrigin.y) > 6) fabMoved = true;
            if (!fabMoved) return;
            mobToggle.style.left = (e.clientX - 29) + 'px';
            mobToggle.style.top = (e.clientY - 29) + 'px';
            mobToggle.style.right = 'auto';
            mobToggle.style.bottom = 'auto';
        });
        mobToggle.addEventListener('pointerup', () => { fabDrag = false; });
        mobToggle.addEventListener('click', (e) => {
            e.preventDefault();
            if (fabMoved) { fabMoved = false; return; }
            setVisible(true);
        });

        const tabs = menu.querySelectorAll('.tab[data-tab]');
        const panes = menu.querySelectorAll('.content-pane');
        tabs.forEach(tab => tab.addEventListener('click', (e) => {
            const targetTab = e.currentTarget.getAttribute('data-tab');
            if (config.currentTab === targetTab) return;
            tabs.forEach(t => t.classList.remove('active')); panes.forEach(p => p.classList.remove('active'));
            tab.classList.add('active'); menu.querySelector(`#pane-${targetTab}`).classList.add('active');
            config.currentTab = targetTab;
            persistConfig();
        }));

        const handle = $('drag-handle');
        let dragging = false, offX = 0, offY = 0;
        const beginDrag = (cx, cy) => { const r = menu.getBoundingClientRect(); dragging = true; offX = cx - r.left; offY = cy - r.top; };
        const interactive = (target) => !!(target && target.closest && target.closest('button, select, input, a'));
        handle.addEventListener('mousedown', (e) => { if (interactive(e.target)) return; beginDrag(e.clientX, e.clientY); });
        handle.addEventListener('touchstart', (e) => { if (interactive(e.target)) return; const t = e.touches[0]; beginDrag(t.clientX, t.clientY); }, { passive: true });
        document.addEventListener('mousemove', (e) => { if (dragging) { menu.style.left = `${e.clientX - offX}px`; menu.style.top = `${e.clientY - offY}px`; } });
        document.addEventListener('touchmove', (e) => { if (dragging) { const t = e.touches[0]; menu.style.left = `${t.clientX - offX}px`; menu.style.top = `${t.clientY - offY}px`; } }, { passive: true });
        document.addEventListener('mouseup', () => dragging = false); document.addEventListener('touchend', () => dragging = false);

        const canvas = $('overlay-canvas');
        const ctx = canvas.getContext('2d');
        const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
        window.addEventListener('resize', resize); resize();

        const keyLabel = (k) => {
            if (k && k.startsWith('Mouse')) return ({ Mouse0: 'Left Mouse', Mouse1: 'Middle Mouse', Mouse2: 'Right Mouse', Mouse3: 'Mouse 4', Mouse4: 'Mouse 5' })[k] || k;
            return String(k || '').replace(/^Key/, '').replace(/^Digit/, '').replace(/^Arrow/, '');
        };

        const ranges = [
            ['i-aimscale', 'aimScale', 'v-aimscale', true],
            ['i-fov', 'fov', 'v-fov', false],
            ['i-sens', 'sensitivity', 'v-sens', true],
            ['i-smooth', 'smoothing', 'v-smooth', false],
            ['i-head', 'headOffset', 'v-head', true],
            ['i-snap', 'maxSnap', 'v-snap', false],
            ['i-pred', 'prediction', 'v-pred', true],
            ['i-boxh', 'boxScale', 'v-boxh', true],
            ['i-boxw', 'boxWidth', 'v-boxw', true],
            ['i-trigger-fov', 'triggerbotFov', 'v-tfov', false],
            ['i-trigger-delay', 'triggerbotDelay', 'v-tdelay', false],
            ['i-trigger-hold', 'triggerbotHold', 'v-thold', false],
            ['i-trigger-cd', 'triggerbotCooldown', 'v-tcd', false],
            ['i-rapid-delay', 'rapidFireDelay', 'v-rdelay', false],
            ['i-bhop-int', 'bhopInterval', 'v-bhopint', false]
        ];
        const checks = [
            ['c-aim', 'aimbotEnabled'], ['c-extaim', 'externalAim'], ['c-aimtoggle', 'aimToggle'],
            ['c-sticky', 'stickyTarget'], ['c-smooth-t', 'smoothingEnabled'], ['c-cham', 'chamsEnabled'],
            ['c-espb', 'espBoxes'], ['c-esps', 'espSkeleton'], ['c-espl', 'espLines'], ['c-sfov', 'showFov'],
            ['c-trigger', 'triggerbot'], ['c-aimkill', 'aimkill'], ['c-rapid', 'rapidFire'],
            ['c-norecoil', 'noRecoil'], ['c-bhop', 'autoBhop'], ['c-fly', 'fly'],
            ['c-speed', 'speedHack'], ['c-god', 'godMode'], ['c-skin', 'skinUnlocker']
        ];
        const selects = [
            ['s-mode', 'aimMode'], ['s-aimmethod', 'aimMethod'],
            ['s-esp-style', 'espStyle'], ['s-espsrc', 'espSource']
        ];

        const paintRange = (el) => {
            const min = parseFloat(el.min || '0'), max = parseFloat(el.max || '100');
            const val = parseFloat(el.value || '0');
            const pct = max > min ? ((val - min) / (max - min)) * 100 : 50;
            el.style.setProperty('--fill', pct.toFixed(1) + '%');
        };

        const link = (id, key, valId, isFloat = false) => {
            const el = $(id), vEl = $(valId);
            if (!el) return;
            paintRange(el);
            el.oninput = () => {
                const val = isFloat ? Math.round(parseFloat(el.value) * 100) / 100 : parseInt(el.value);
                config[key] = val;
                if (vEl) vEl.innerText = val;
                paintRange(el);
            };
        };
        ranges.forEach(r => link(r[0], r[1], r[2], r[3]));

        checks.forEach(([id, key]) => {
            const el = $(id);
            if (el) el.onchange = (e) => { config[key] = e.target.checked; };
        });
        selects.forEach(([id, key]) => {
            const el = $(id);
            if (el) el.onchange = (e) => { config[key] = e.target.value; };
        });

        const color = $('c-color');
        if (color) color.oninput = (e) => { config.espColor = e.target.value; };

        const aimKeyBtn = $('b-aimkey');
        if (aimKeyBtn) {
            aimKeyBtn.innerText = keyLabel(config.aimKey);
            aimKeyBtn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); bindingAimKey = true; aimKeyBtn.innerText = 'Press key...'; };
            const onBind = (e) => {
                if (!bindingAimKey) return;
                e.preventDefault(); e.stopPropagation();
                if (e.type === 'mousedown') config.aimKey = 'Mouse' + e.button;
                else if (e.type === 'keydown') { if (e.code === 'Escape') { bindingAimKey = false; aimKeyBtn.innerText = keyLabel(config.aimKey); return; } config.aimKey = e.code; }
                else return;
                bindingAimKey = false;
                aimKeyBtn.innerText = keyLabel(config.aimKey);
                aimKeyBtn.blur();
                sendConfig();
            };
            onBind.__s1lverLocal = true;
            window.addEventListener('mousedown', onBind, true);
            window.addEventListener('keydown', onBind, true);
        }

        const syncAll = () => {
            ranges.forEach(([id, key, valId]) => {
                const el = $(id); if (!el) return;
                el.value = config[key];
                const v = $(valId); if (v) v.innerText = config[key];
                paintRange(el);
            });
            checks.forEach(([id, key]) => { const el = $(id); if (el) el.checked = !!config[key]; });
            selects.forEach(([id, key]) => { const el = $(id); if (el) el.value = config[key]; });
            if (color) color.value = config.espColor;
            if (aimKeyBtn) aimKeyBtn.innerText = keyLabel(config.aimKey);
        };
        syncAll();

        const PRESETS = {
            legit: { aimMode: 'Legit', aimbotEnabled: true, fov: 190, sensitivity: 0.35, smoothingEnabled: true, smoothing: 6, maxSnap: 60, headOffset: 1.55, prediction: 0.2, triggerbot: false, aimkill: false, rapidFire: false, autoBhop: false, noRecoil: true, espColor: '#c9d3e2', externalAim: true, aimMethod: 'xdotool', espSource: 'Hybrid', triggerbotFov: 12 },
            rage: { aimMode: 'Rage', aimbotEnabled: true, fov: 720, sensitivity: 1.2, smoothingEnabled: false, smoothing: 1, maxSnap: 300, headOffset: 1.75, prediction: 0.4, triggerbot: true, triggerbotFov: 32, aimkill: true, rapidFire: true, autoBhop: true, noRecoil: false, espColor: '#eef2f8', externalAim: true, aimMethod: 'xdotool', espSource: 'Hybrid' },
            silver: { aimMode: 'AIPD', aimbotEnabled: true, fov: 300, sensitivity: 0.6, smoothingEnabled: true, smoothing: 2, maxSnap: 220, headOffset: 1.7, prediction: 0, triggerbot: false, aimkill: false, rapidFire: false, autoBhop: false, noRecoil: false, espColor: '#d7deea', externalAim: true, aimMethod: 'xdotool', espSource: 'Hybrid' }
        };
        const presetChips = menu.querySelectorAll('[data-preset]');
        const applyPreset = (name) => {
            if (name === 'reset') {
                const keepTab = config.currentTab, keepVisible = config.menuVisible;
                Object.assign(config, JSON.parse(JSON.stringify(DEFAULT_CONFIG)));
                config.currentTab = keepTab;
                config.menuVisible = keepVisible;
            } else if (PRESETS[name]) Object.assign(config, PRESETS[name]);
            presetChips.forEach(c => c.classList.toggle('active', c.getAttribute('data-preset') === name && name !== 'reset'));
            syncAll();
            persistConfig();
            sendConfig();
        };
        presetChips.forEach(chip => chip.addEventListener('click', () => applyPreset(chip.getAttribute('data-preset'))));

        const resetBtn = $('sb-reset');
        if (resetBtn) resetBtn.addEventListener('click', () => applyPreset('reset'));

        return { ctx, menu, $, syncAll, setVisible };
    };

    const detectedPlayers = [];
    let lastPlayers = [];
    let currentTarget = null, isAiming = false, lastLockedTarget = null, lastAimMotion = { x: 0, y: 0 };
    const inputHandlers = [];
    let aimFrame = 0;
    let lastHttpPush = 0;
    let pendingPushX = 0;
    let pendingPushY = 0;
    let pushCount = 0;
    let lastPushInfo = null;
    let leftDown = false, spaceDown = false, sprintHeld = false;
    let lastShot = 0, triggerPending = false, lastRapid = 0, lastBhop = 0, lastFly = 0;
    const PLAYER_HISTORY = new Map();
    let viewProjMatrix = null;
    const viewVotes = new Map();
    const PLAYER_VERTEX_SET = new Set([8829, 10392, 10944, 16413, 10428, 10497, 10431, 16464, 8886, 16515, 8934, 10425, 16497, 8844, 8838, 8931, 10449]);
    let lastView = null;
    const uniformCache = new Map();
    let activeTextureUnit = 0;
    const textureUnitBindings = new Array(32).fill(null);
    const textureDataMap = new WeakMap();
    let currentProgram = null;
    let isDepthEnabled = false;

    let hookedCtx = 0, diagDraws = 0, diagVP = 0, diagModel = 0, diagEnemy = 0, diagDetect = 0;
    const diagVC = new Map();
    const diagSamples = [];
    const diagLast = [];

    const isUIEvent = (ev) => !!(uiHost && ev && ev.target && ev.target.nodeType && uiHost.contains(ev.target));
    const setAim = (v) => {
        if (bindingAimKey) return;
        if (config.aimToggle) { if (v) isAiming = !isAiming; } else isAiming = v;
        if (isAiming) lastLockedTarget = currentTarget?.key; else lastLockedTarget = null;
    };
    safe(() => W.addEventListener('mousedown', (e) => { if (!e.__s1lver && !isUIEvent(e) && config.aimKey === 'Mouse' + e.button) setAim(true); }, true));
    safe(() => W.addEventListener('mouseup', (e) => { if (!e.__s1lver && config.aimKey === 'Mouse' + e.button) setAim(false); }, true));
    safe(() => W.addEventListener('keydown', (e) => { if (!e.__s1lver && !isUIEvent(e) && config.aimKey === e.code && !e.repeat) setAim(true); }, true));
    safe(() => W.addEventListener('keyup', (e) => { if (!e.__s1lver && config.aimKey === e.code) setAim(false); }, true));
    safe(() => W.addEventListener('blur', () => { isAiming = false; lastLockedTarget = null; }));

    const multiplyMatrixVec4 = (m, [x, y, z, w]) => [
        m[0] * x + m[4] * y + m[8] * z + m[12] * w, m[1] * x + m[5] * y + m[9] * z + m[13] * w,
        m[2] * x + m[6] * y + m[10] * z + m[14] * w, m[3] * x + m[7] * y + m[11] * z + m[15] * w,
    ];

    const multiplyMatrix4 = (a, b) => {
        const c = new Array(16);
        for (let col = 0; col < 4; col++) {
            for (let row = 0; row < 4; row++) {
                let s = 0;
                for (let k = 0; k < 4; k++) s += a[k * 4 + row] * b[col * 4 + k];
                c[col * 4 + row] = s;
            }
        }
        return c;
    };

    const worldToScreen = (pos) => {
        if (!viewProjMatrix) return null;
        const clip = multiplyMatrixVec4(viewProjMatrix, [...pos, 1]);
        if (clip[3] <= 0.001) return null;
        return [(clip[0] / clip[3] + 1) * 0.5 * window.innerWidth, (1 - clip[1] / clip[3]) * 0.5 * window.innerHeight];
    };

    class PlayerDetector {
        static getCachedMatrices = (program) => {
            const cache = uniformCache.get(program);
            if (!cache) return { vp: null, persp: false, view: null, proj: null, model: null, modelName: null, boneUnit: null, opacity: 1.0, isEnemy: false, isPlayerModel: false, cbcolor: null, outline: null, arm: null };
            let vp = null, view = null, proj = null, model = null, modelName = null, otherMat = null, boneUnit = null, opacity = 1.0, isEnemy = false, cb = null, outline = null, arm = null;
            for (const [name, val] of cache) {
                if (val?.length === 16) {
                    if (name === 'viewMatrix') view = val;
                    else if (name === 'projectionMatrix') proj = val;
                    else if (/modelMatrix/i.test(name)) { model = val; modelName = name; }
                    else if (val[11] !== 0 && Math.abs(val[15]) > 1.0) { if (!vp) vp = val; }
                    else otherMat = val;
                } else if (name === 'boneTexture') boneUnit = val;
                else if (name === 'opacity') opacity = val;
                else if (name === 'cbcolor') cb = val;
                else if (name === 'doOutline') outline = val;
                else if (name === 'heldArmMirror') arm = val;
                else if (typeof val === 'number' && val === 1 && !['left', 'specMultMult', 'opacity'].includes(name) && name.length > 5) isEnemy = true;
            }
            if (typeof cb === 'number') isEnemy = cb > 1.5;
            const persp = !!(proj && Math.abs(proj[11]) > 0.01);
            if (persp && view) vp = multiplyMatrix4(proj, view);
            else if (persp) vp = proj;
            if (!model && otherMat) { model = otherMat; modelName = modelName || '(fallback)'; }
            const isPlayerModel = ['heldArmMirror', 'sP3L_1sq', 'CV44o_mv', 'pOaPX_uh'].some(k => cache.has(k));
            if (vp) diagVP++;
            if (model) diagModel++;
            if (isEnemy) diagEnemy++;
            return { vp, persp, view, proj, model, modelName, boneUnit, opacity, isEnemy, isPlayerModel, cbcolor: cb, outline, arm };
        };

        static processDrawCall = (gl, program, vertexCount) => {
            const { vp, persp, view, proj, model, modelName, boneUnit, opacity, isEnemy, isPlayerModel, cbcolor, outline, arm } = this.getCachedMatrices(program);
            const inSet = PLAYER_VERTEX_SET.has(vertexCount);
            if (vp && persp && view) {
                let near = false;
                if (model) {
                    const camX = -(view[0] * view[12] + view[1] * view[13] + view[2] * view[14]);
                    const camY = -(view[4] * view[12] + view[5] * view[13] + view[6] * view[14]);
                    const camZ = -(view[8] * view[12] + view[9] * view[13] + view[10] * view[14]);
                    const dx = model[12] - camX, dy = model[13] - camY, dz = model[14] - camZ;
                    near = dx * dx + dy * dy + dz * dz < 4.0;
                }
                if (!near) {
                    const sig = view[0].toFixed(2) + ',' + view[5].toFixed(2) + ',' + view[10].toFixed(2) + ',' + view[12].toFixed(1) + ',' + view[13].toFixed(1) + ',' + view[14].toFixed(1) + (proj ? ',' + proj[0].toFixed(2) + ',' + proj[5].toFixed(2) + ',' + proj[11].toFixed(2) : '');
                    const rec = viewVotes.get(sig) || { count: 0, vp, view };
                    rec.count++; rec.vp = vp; rec.view = view;
                    viewVotes.set(sig, rec);
                }
            }
            if (vertexCount > 1000 && diagSamples.length < 30 && !diagSamples.some(s => s.vC === vertexCount)) {
                const cache = uniformCache.get(program);
                diagSamples.push({ vC: vertexCount, model: !!model, modelName, bone: boneUnit, enemy: isEnemy, opacity, player: isPlayerModel, cb: cbcolor, outline, arm, names: cache ? [...cache.keys()].slice(0, 80) : [] });
            }
            const boneTex = (boneUnit !== null && textureUnitBindings[boneUnit]) ? textureDataMap.get(textureUnitBindings[boneUnit]) : null;
            const hasBoneData = !!(boneTex && boneTex.length >= 23 * 16);
            const src = config.espSource || 'Hybrid';
            const boneOnly = src === 'Bone';
            const allowBone = boneOnly || src === 'Hybrid';
            const hasBone = allowBone ? (boneOnly ? (boneUnit !== null) : hasBoneData) : false;
            const playerDraw = boneOnly ? hasBone : (isPlayerModel || inSet || (allowBone && hasBone));
            if (!model || !playerDraw || opacity < 0.1) return false;
            if (boneOnly && !hasBone) return false;
            if (!boneOnly) {
                if (!inSet && !hasBone && model[13] < -0.2) return false;
                if (!inSet && !hasBone && (typeof outline !== 'number' || typeof arm !== 'number')) return false;
                if (!isPlayerModel && !inSet && !hasBone && !isEnemy) return false;
            }
            if (typeof arm === 'number' && arm > 0.5) return false;

            if (lastView) {
                const v = lastView;
                const camX = -(v[0] * v[12] + v[1] * v[13] + v[2] * v[14]);
                const camY = -(v[4] * v[12] + v[5] * v[13] + v[6] * v[14]);
                const camZ = -(v[8] * v[12] + v[9] * v[13] + v[10] * v[14]);
                const dx = model[12] - camX, dy = model[13] - camY, dz = model[14] - camZ;
                if (dx * dx + dy * dy + dz * dz < 9) return false;
            }

            let pos = [model[12], model[13] + config.headOffset, model[14]];
            let basePos = [model[12], model[13], model[14]];

            if (boneUnit !== null && textureUnitBindings[boneUnit]) {
                const boneData = textureDataMap.get(textureUnitBindings[boneUnit]);
                if (boneData?.length >= 23 * 16) {
                    const b22 = 22 * 16;
                    pos = [boneData[b22 + 12], boneData[b22 + 13] + config.headOffset, boneData[b22 + 14]];
                    basePos = [boneData[b22 + 12], boneData[b22 + 13], boneData[b22 + 14]];
                }
            }
            if (!pos.every(Number.isFinite)) return false;

            const playerKey = `${vertexCount}_${model[12].toFixed(1)}_${model[14].toFixed(1)}`;
            let finalPos = [...pos];

            if (config.prediction > 0) {
                const hist = PLAYER_HISTORY.get(playerKey) || { last: pos, vel: [0, 0, 0], tick: Date.now() };
                const now = Date.now(), dt = (now - hist.tick) / 1000;
                if (dt > 0.001 && dt < 0.5) {
                    const instVel = [(pos[0] - hist.last[0]) / dt, (pos[1] - hist.last[1]) / dt, (pos[2] - hist.last[2]) / dt];
                    hist.vel = hist.vel.map((v, i) => v * 0.6 + instVel[i] * 0.4);
                    const lookAhead = 0.06 * config.prediction;
                    finalPos = pos.map((v, i) => v + hist.vel[i] * lookAhead);
                }
                PLAYER_HISTORY.set(playerKey, { last: pos, vel: hist.vel, tick: now });
            }
            if (!finalPos.every(Number.isFinite)) return false;
            const boneEnemy = hasBone && !isPlayerModel && !inSet;
            detectedPlayers.push({ position: finalPos, basePosition: basePos, key: playerKey, vC: vertexCount, enemy: isEnemy || boneEnemy, outline, arm, cbcolor, modelName });
            diagDetect++;
            if (diagLast.length < 8) diagLast.push({ pos: finalPos.map(v => +v.toFixed(2)), base: basePos.map(v => +v.toFixed(2)) });
            return true;
        };
    }

    const aimActive = () => !!(config.aimbotEnabled && document.pointerLockElement && currentTarget && (isAiming || config.aimkill || (config.noRecoil && leftDown)));

    const getAimbotMotion = (isY) => {
        if (!aimActive()) return null;
        const sPos = worldToScreen(currentTarget.position);
        if (!sPos || !Number.isFinite(sPos[0]) || !Number.isFinite(sPos[1])) return null;
        const delta = sPos[isY ? 1 : 0] - (window[isY ? 'innerHeight' : 'innerWidth'] / 2);
        let movement = delta;
        let maxSnap = config.maxSnap || 120;
        switch (config.aimMode) {
            case 'Rage':
                movement = delta * Math.max(0.2, config.sensitivity * 2);
                maxSnap = Math.max(maxSnap, 150);
                break;
            case 'Legit':
                movement = delta * Math.max(0.05, config.sensitivity * 0.6);
                if (config.smoothingEnabled) movement /= Math.max(1, config.smoothing * 1.5);
                maxSnap = Math.min(maxSnap, 40);
                break;
            case 'Legacy':
            case 'AIPD':
            default:
                movement = delta * Math.max(0.05, config.sensitivity);
                if (config.smoothingEnabled) movement /= Math.max(1, config.smoothing);
                break;
        }
        const out = Math.max(-maxSnap, Math.min(maxSnap, Math.round(movement)));
        return Number.isFinite(out) ? out : null;
    };

    safe(() => { W.__s1lverAim = () => {
        const mx = safe(() => getAimbotMotion(false), null);
        const my = safe(() => getAimbotMotion(true), null);
        return { ok: true, v: '4.1', brand: 'S1lverBack.lol', externalAim: !!config.externalAim, method: config.aimMethod, aimScale: config.aimScale, aiming: aimActive(), mx, my, frame: aimFrame, target: currentTarget ? currentTarget.key : null, cx: Math.round(window.innerWidth / 2), cy: Math.round(window.innerHeight / 2), pushes: pushCount, lastPush: lastPushInfo };
    };
    W.__zetaAim = W.__s1lverAim; });

    const applyMotion = (ev) => {
        const mx = safe(() => getAimbotMotion(false), null);
        const my = safe(() => getAimbotMotion(true), null);
        if (mx === null || my === null) return;
        lastAimMotion = { x: mx, y: my };
        safe(() => Object.defineProperty(ev, 'movementX', { value: mx, configurable: true, enumerable: true }));
        safe(() => Object.defineProperty(ev, 'movementY', { value: my, configurable: true, enumerable: true }));
    };

    const hookedTargets = new WeakSet();
    const nativeGetContext = (W.HTMLCanvasElement && W.HTMLCanvasElement.prototype.getContext) || null;
    let glHooked = false;

    const setOwn = (obj, name, value) => {
        safe(() => Object.defineProperty(obj, name, { value, writable: true, configurable: true, enumerable: false }));
        if (safe(() => obj[name], null) !== value) safe(() => { obj[name] = value; });
    };

    const wrapOn = (obj, name, before, around) => {
        const orig = safe(() => obj[name]);
        if (typeof orig !== 'function') return;
        const fn = function (...args) {
            safe(() => before && before(this, args));
            if (around) return around(this, args, () => Reflect.apply(orig, this, args));
            return Reflect.apply(orig, this, args);
        };
        setOwn(obj, name, fn);
    };

    const cacheUniform = (args, value) => {
        const loc = args[0];
        if (currentProgram && loc && loc._name) {
            if (!uniformCache.has(currentProgram)) uniformCache.set(currentProgram, new Map());
            const name = loc._name;
            const v = (name === 'viewMatrix' || name === 'projectionMatrix') && value && value.length === 16 ? Array.from(value) : value;
            uniformCache.get(currentProgram).set(name, v);
        }
    };

    const makeDraw = (countIndex) => (ctx, args, call) => {
        const vC = args[countIndex];
        diagDraws++;
        if (vC > 1000) diagVC.set(vC, (diagVC.get(vC) || 0) + 1);
        const isPlayerDraw = safe(() => (currentProgram && vC > 1000) ? PlayerDetector.processDrawCall(ctx, currentProgram, vC) === true : false, false);
        if (isPlayerDraw) {
            const was = isDepthEnabled;
            if (config.chamsEnabled && was) safe(() => ctx.disable(ctx.DEPTH_TEST));
            const r = call();
            if (config.chamsEnabled && was) safe(() => ctx.enable(ctx.DEPTH_TEST));
            return r;
        }
        return call();
    };

    const hookGLMethods = (target) => {
        if (!target) return;
        hookedCtx++;
        wrapOn(target, 'enable', (t, a) => { if (a[0] === 2929) isDepthEnabled = true; });
        wrapOn(target, 'disable', (t, a) => { if (a[0] === 2929) isDepthEnabled = false; });
        wrapOn(target, 'useProgram', (t, a) => { currentProgram = a[0]; });
        wrapOn(target, 'activeTexture', (t, a) => { activeTextureUnit = a[0] - (t.TEXTURE0 !== undefined ? t.TEXTURE0 : 33984); });
        wrapOn(target, 'bindTexture', (t, a) => { if (a[0] === (t.TEXTURE_2D !== undefined ? t.TEXTURE_2D : 3553)) textureUnitBindings[activeTextureUnit] = a[1]; });
        wrapOn(target, 'texImage2D', (t, a) => {
            const p = a[a.length - 1];
            const isF32 = p && p.constructor && p.constructor.name === 'Float32Array';
            if (isF32 && activeTextureUnit >= 0) {
                const tex = textureUnitBindings[activeTextureUnit];
                if (tex) textureDataMap.set(tex, p);
            }
        });
        wrapOn(target, 'texSubImage2D', (t, a) => {
            const p = a[a.length - 1];
            const isF32 = p && p.constructor && p.constructor.name === 'Float32Array';
            if (isF32 && activeTextureUnit >= 0) {
                const tex = textureUnitBindings[activeTextureUnit];
                if (tex) textureDataMap.set(tex, p);
            }
        });
        wrapOn(target, 'uniform1f', (t, a) => cacheUniform(a, a[1]));
        wrapOn(target, 'uniform1i', (t, a) => cacheUniform(a, a[1]));
        wrapOn(target, 'uniformMatrix4fv', (t, a) => {
            const value = a[2];
            if (!value) return;
            const val = value.slice();
            cacheUniform(a, val);
            if (val.length === 16 && val[11] !== 0 && Math.abs(val[15]) > 1.0) viewProjMatrix = val;
        });
        wrapOn(target, 'getUniformLocation', null, (ctx, args, call) => {
            const loc = call();
            safe(() => { if (loc) loc._name = args[1]; });
            return loc;
        });
        const draw = makeDraw(1);
        wrapOn(target, 'drawElements', null, draw);
        wrapOn(target, 'drawElementsInstanced', null, draw);
        const drawArr = makeDraw(2);
        wrapOn(target, 'drawArrays', null, drawArr);
        wrapOn(target, 'drawArraysInstanced', null, drawArr);
    };

    const replaceMethod = (obj, name, fn) => {
        const d = safe(() => Object.getOwnPropertyDescriptor(obj, name), null);
        safe(() => Object.defineProperty(obj, name, {
            value: fn,
            writable: d ? d.writable : true,
            configurable: d ? d.configurable : true,
            enumerable: d ? d.enumerable : false
        }));
        if (safe(() => obj[name], null) !== fn) safe(() => { obj[name] = fn; });
    };

    const wrapContextFactory = (Proto) => {
        if (!Proto) return;
        const cur = safe(() => Proto.getContext);
        if (typeof cur !== 'function') return;
        const wrapped = function (type) {
            const ctx = Reflect.apply(cur, this, arguments);
            safe(() => {
                if (ctx && /webgl/i.test(String(type)) && !hookedTargets.has(ctx)) {
                    hookedTargets.add(ctx);
                    hookGLMethods(ctx);
                }
            });
            return ctx;
        };
        replaceMethod(Proto, 'getContext', wrapped);
    };

    const createdCanvases = new Set();

    const noteCanvas = (el) => {
        if (!el || el.tagName !== 'CANVAS' || createdCanvases.has(el)) return;
        createdCanvases.add(el);
        safe(() => {
            const orig = el.getContext;
            if (typeof orig !== 'function') return;
            const wrapped = function (type) {
                const fn = nativeGetContext || orig;
                const ctx = Reflect.apply(fn, this, arguments);
                safe(() => {
                    if (ctx && /webgl/i.test(String(type)) && !hookedTargets.has(ctx)) {
                        hookedTargets.add(ctx);
                        hookGLMethods(ctx);
                    }
                });
                return ctx;
            };
            setOwn(el, 'getContext', wrapped);
        });
    };

    const hookCreateElement = () => {
        const P = W.Document && W.Document.prototype;
        if (!P) return;
        const ce = safe(() => P.createElement);
        if (typeof ce === 'function') {
            replaceMethod(P, 'createElement', function (tag) {
                const el = Reflect.apply(ce, this, arguments);
                safe(() => noteCanvas(el));
                return el;
            });
        }
        const cens = safe(() => P.createElementNS);
        if (typeof cens === 'function') {
            replaceMethod(P, 'createElementNS', function (ns, tag) {
                const el = Reflect.apply(cens, this, arguments);
                safe(() => noteCanvas(el));
                return el;
            });
        }
    };

    const INPUT_CAPTURE = new Set(['pointerrawupdate', 'pointermove', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'keydown', 'keyup']);
    const hookInput = () => {
        const etp = W.EventTarget && W.EventTarget.prototype;
        if (!etp) return;
        const add = etp.addEventListener;
        if (typeof add !== 'function') return;
        replaceMethod(etp, 'addEventListener', function (type, fn) {
            safe(() => {
                const t = String(type);
                if (typeof fn === 'function' && INPUT_CAPTURE.has(t) && !fn.__s1lverLocal && !inputHandlers.some(h => h.fn === fn && h.type === t)) {
                    inputHandlers.push({ type: t, fn, target: this });
                }
            });
            return Reflect.apply(add, this, arguments);
        });
    };
    hookCreateElement();

    safe(() => { W.__s1lverNudge = (mx, my) => {
        const hasRaw = inputHandlers.some(h => h.type === 'pointerrawupdate');
        const type = hasRaw ? 'pointerrawupdate' : 'pointermove';
        const Ctor = W.PointerEvent || W.MouseEvent;
        const ev = new Ctor(type, { bubbles: true, cancelable: true, view: W, pointerType: 'mouse', pointerId: 1 });
        safe(() => Object.defineProperty(ev, 'movementX', { value: mx, configurable: true, enumerable: true }));
        safe(() => Object.defineProperty(ev, 'movementY', { value: my, configurable: true, enumerable: true }));
        safe(() => Object.defineProperty(ev, 'isTrusted', { value: true, configurable: true }));
        safe(() => Object.defineProperty(ev, 'target', { value: document.pointerLockElement || document.body || document, configurable: true }));
        safe(() => Object.defineProperty(ev, 'currentTarget', { value: W, configurable: true }));
        safe(() => Object.defineProperty(ev, 'getCoalescedEvents', { value: () => [ev], configurable: true }));
        const hs = inputHandlers.filter(h => h.type === type);
        for (const h of hs) safe(() => h.fn.call(h.target, ev));
        return { type, handlers: hs.length };
    };
    W.__zetaNudge = W.__s1lverNudge; });

    const installGL = () => {
        if (glHooked) return;
        glHooked = true;
        hookInput();
        wrapContextFactory(W.OffscreenCanvas && W.OffscreenCanvas.prototype);
        safe(() => { W.__s1lverDbg = () => ({
            hooked: hookedCtx,
            handlers: inputHandlers.length,
            draws: diagDraws,
            vp: diagVP, model: diagModel, enemy: diagEnemy, detected: diagDetect,
            playersNow: lastPlayers.length,
            aiming: aimActive(),
            aimKey: config.aimKey,
            motion: lastAimMotion,
            target: currentTarget ? currentTarget.key : null,
            targetEnemy: currentTarget ? !!currentTarget.enemy : null,
            view: lastView ? [+lastView[0].toFixed(4), +lastView[12].toFixed(3), +lastView[13].toFixed(3), +lastView[14].toFixed(3)] : null,
            vpNow: viewProjMatrix ? [+viewProjMatrix[11].toFixed(4), +viewProjMatrix[15].toFixed(4)] : null,
            vc: [...diagVC.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15),
            samples: diagSamples,
            last: diagLast,
            now: lastPlayers.map(p => { const s = worldToScreen(p.position), f = worldToScreen(p.basePosition); return { key: p.key, pos: p.position.map(v => +v.toFixed(2)), base: p.basePosition.map(v => +v.toFixed(2)), enemy: p.enemy, parts: p.parts, vcs: p.vcs, outline: p.outline, cb: p.cb, arm: p.arm, s: s ? [Math.round(s[0]), Math.round(s[1])] : null, f: f ? [Math.round(f[0]), Math.round(f[1])] : null }; })
        });
        W.__zetaDbg = W.__s1lverDbg; });
    };

    const waitForGame = () => {
        if (!nativeGetContext) return;
        const t0 = Date.now();
        const check = () => {
            const replaced = safe(() => W.HTMLCanvasElement.prototype.getContext !== nativeGetContext, false);
            if (replaced || Date.now() - t0 > 4000) installGL();
            else setTimeout(check, 150);
        };
        check();
    };
    waitForGame();

    const init = () => {
        const ui = createUI();
        if (!ui) return;
        const { ctx: overlayCtx, menu, $, syncAll, setVisible } = ui;
        safe(() => { if (uiHost) { uiHost.addEventListener('input', sendConfig, true); uiHost.addEventListener('change', sendConfig, true); } });
        sendConfig();
        setInterval(() => { if (!configLinkOk) sendConfig(); }, 5000);

        const bigCanvas = () => {
            const cs = [...document.querySelectorAll('canvas')].filter(c => safe(() => c.isConnected && c.clientWidth > 0, false));
            cs.sort((a, b) => (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight));
            return cs[0] || null;
        };
        const targetEl = () => document.pointerLockElement || bigCanvas() || document.body || document;
        const callHandlers = (type, ev) => {
            const hs = inputHandlers.filter(h => h.type === type && !h.fn.__s1lverLocal);
            if (!hs.length) return false;
            for (const h of hs) safe(() => h.fn.call(h.target, ev));
            return true;
        };
        const makeMouse = (type, button, buttons, withTarget) => {
            const Ctor = W.MouseEvent || W.Event;
            const ev = safe(() => new Ctor(type, { bubbles: true, cancelable: true, view: W, button, buttons, clientX: Math.round(window.innerWidth / 2), clientY: Math.round(window.innerHeight / 2) }), null);
            if (!ev) return null;
            safe(() => Object.defineProperty(ev, 'isTrusted', { value: true, configurable: true }));
            safe(() => { ev.__s1lver = true; });
            if (withTarget) {
                safe(() => Object.defineProperty(ev, 'target', { value: targetEl(), configurable: true }));
                safe(() => Object.defineProperty(ev, 'currentTarget', { value: W, configurable: true }));
            }
            return ev;
        };
        const makePointer = (type, button, buttons, withTarget) => {
            const Ctor = W.PointerEvent || W.MouseEvent || W.Event;
            const ev = safe(() => new Ctor(type, { bubbles: true, cancelable: true, view: W, button, buttons, pointerId: 1, pointerType: 'mouse', isPrimary: true, clientX: Math.round(window.innerWidth / 2), clientY: Math.round(window.innerHeight / 2) }), null);
            if (!ev) return null;
            safe(() => Object.defineProperty(ev, 'isTrusted', { value: true, configurable: true }));
            safe(() => { ev.__s1lver = true; });
            if (withTarget) {
                safe(() => Object.defineProperty(ev, 'target', { value: targetEl(), configurable: true }));
                safe(() => Object.defineProperty(ev, 'currentTarget', { value: W, configurable: true }));
            }
            return ev;
        };
        const sendMouse = (type, button = 0) => {
            const down = type === 'mousedown';
            const alias = down ? 'pointerdown' : 'pointerup';
            const buttons = down ? 1 : 0;
            const pev = makePointer(alias, button, buttons, true);
            const mev = makeMouse(type, button, buttons, true);
            let called = false;
            if (pev) called = callHandlers(alias, pev) || called;
            if (mev) called = callHandlers(type, mev) || called;
            if (called) return;
            const pdev = makePointer(alias, button, buttons, false);
            if (pdev) safe(() => targetEl().dispatchEvent(pdev));
            const mdev = makeMouse(type, button, buttons, false);
            if (mdev) safe(() => targetEl().dispatchEvent(mdev));
        };
        const sendKey = (type, code) => {
            const key = code === 'Space' ? ' ' : (code.startsWith('Shift') ? 'Shift' : code);
            const keyCode = code === 'Space' ? 32 : (code.startsWith('Shift') ? 16 : 0);
            const Ctor = W.KeyboardEvent || W.Event;
            const ev = safe(() => new Ctor(type, { bubbles: true, cancelable: true, view: W, code, key }), null);
            if (!ev) return;
            safe(() => Object.defineProperty(ev, 'keyCode', { value: keyCode, configurable: true }));
            safe(() => Object.defineProperty(ev, 'which', { value: keyCode, configurable: true }));
            safe(() => Object.defineProperty(ev, 'isTrusted', { value: true, configurable: true }));
            safe(() => { ev.__s1lver = true; });
            safe(() => Object.defineProperty(ev, 'target', { value: targetEl(), configurable: true }));
            safe(() => Object.defineProperty(ev, 'currentTarget', { value: W, configurable: true }));
            if (callHandlers(type, ev)) return;
            const dev = safe(() => new Ctor(type, { bubbles: true, cancelable: true, view: W, code, key }), null);
            if (dev) { safe(() => { dev.__s1lver = true; }); safe(() => (document.pointerLockElement || bigCanvas() || window).dispatchEvent(dev)); }
        };
        const scheduleFire = (delay, cooldown) => {
            const now = Date.now();
            if (triggerPending || now - lastShot < (cooldown || 0)) return;
            triggerPending = true;
            setTimeout(() => {
                triggerPending = false;
                if (!document.pointerLockElement) return;
                lastShot = Date.now();
                sendMouse('mousedown');
                setTimeout(() => sendMouse('mouseup'), Math.max(10, config.triggerbotHold));
            }, Math.max(0, delay || 0));
        };
        const onMouseDown = (e) => { if (e.__s1lver || isUIEvent(e)) return; if (e.button === 0) leftDown = true; };
        const onMouseUp = (e) => { if (e.__s1lver) return; if (e.button === 0) leftDown = false; };
        const onKeyDown = (e) => { if (e.__s1lver || isUIEvent(e)) return; if (e.code === 'Space') spaceDown = true; };
        const onKeyUp = (e) => { if (e.__s1lver) return; if (e.code === 'Space') spaceDown = false; };
        [onMouseDown, onMouseUp, onKeyDown, onKeyUp].forEach(f => f.__s1lverLocal = true);
        window.addEventListener('mousedown', onMouseDown, true);
        window.addEventListener('mouseup', onMouseUp, true);
        window.addEventListener('keydown', onKeyDown, true);
        window.addEventListener('keyup', onKeyUp, true);
        window.addEventListener('blur', () => { leftDown = false; spaceDown = false; });
        safe(() => { W.__s1lverFire = (type, button) => sendMouse(type || 'mousedown', button || 0); W.__s1lverKey = (type, code) => sendKey(type || 'keydown', code || 'Space'); W.__zetaFire = W.__s1lverFire; W.__zetaKey = W.__s1lverKey; });

        const pumpAim = () => {
            if (!aimActive() || config.externalAim) return;
            const target = document.pointerLockElement || bigCanvas() || document.body || document;
            const hasRaw = inputHandlers.some(h => h.type === 'pointerrawupdate');
            const type = hasRaw ? 'pointerrawupdate' : 'pointermove';
            const Ctor = W.PointerEvent || W.MouseEvent;
            const ev = safe(() => new Ctor(type, { bubbles: true, cancelable: true, view: W, pointerType: 'mouse', pointerId: 1 }), null);
            if (!ev) return;
            applyMotion(ev);
            safe(() => Object.defineProperty(ev, 'target', { value: target, configurable: true }));
            safe(() => Object.defineProperty(ev, 'currentTarget', { value: W, configurable: true }));
            safe(() => Object.defineProperty(ev, 'isTrusted', { value: true, configurable: true }));
            safe(() => Object.defineProperty(ev, 'getCoalescedEvents', { value: () => [ev], configurable: true }));
            safe(() => Object.defineProperty(ev, 'getPredictedEvents', { value: () => [ev], configurable: true }));
            const handlers = inputHandlers.filter(h => h.type === type);
            if (handlers.length) {
                for (const h of handlers) safe(() => h.fn.call(h.target, ev));
            } else {
                safe(() => target.dispatchEvent(ev));
            }
        };

        const drawCornerBox = (ctx, x, y, w, h) => {
            const length = w / 4; ctx.beginPath();
            ctx.moveTo(x, y + length); ctx.lineTo(x, y); ctx.lineTo(x + length, y);
            ctx.moveTo(x + w - length, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + length);
            ctx.moveTo(x, y + h - length); ctx.lineTo(x, y + h); ctx.lineTo(x + length, y + h);
            ctx.moveTo(x + w - length, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - length);
            ctx.stroke();
        };


        const buildPlayers = () => {
            const groups = [];
            for (const p of detectedPlayers) {
                const b = p.basePosition;
                let g = groups.find(gg => Math.abs(gg.cx - b[0]) < 1.6 && Math.abs(gg.cz - b[2]) < 1.6);
                if (!g) { g = { cx: b[0], cz: b[2], items: [] }; groups.push(g); }
                g.items.push(p);
            }
            return groups.map(g => {
                const baseItem = g.items.reduce((a, b) => (a.basePosition[1] <= b.basePosition[1] ? a : b));
                const topItem = g.items.reduce((a, b) => (a.basePosition[1] >= b.basePosition[1] ? a : b));
                const feetY = baseItem.basePosition[1];
                const topY = topItem.basePosition[1];
                const headY = (topY - feetY > 0.5) ? topY + 0.2 : feetY + config.headOffset;
                const x = baseItem.basePosition[0], z = baseItem.basePosition[2];
                const outline = g.items.reduce((m, p) => (typeof p.outline === 'number' ? Math.max(m, p.outline) : m), -2);
                const cb = g.items.reduce((m, p) => (typeof p.cbcolor === 'number' ? Math.max(m, p.cbcolor) : m), -2);
                const arm = g.items.reduce((m, p) => (typeof p.arm === 'number' ? Math.max(m, p.arm) : m), 0);
                return {
                    position: [x, headY, z], basePosition: [x, feetY, z], key: baseItem.key,
                    enemy: g.items.some(p => p.enemy), parts: g.items.length,
                    vcs: [...new Set(g.items.map(p => p.vC))], outline, cb, arm
                };
            });
        };

        const loop = () => {
            if (!overlayCtx) return;
            const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
            overlayCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);

            if (viewVotes.size) {
                let best = null, bestScore = -1;
                for (const rec of viewVotes.values()) {
                    let score = rec.count * 100;
                    if (lastView && rec.view) {
                        const d = Math.abs(rec.view[12] - lastView[12]) + Math.abs(rec.view[13] - lastView[13]) + Math.abs(rec.view[14] - lastView[14]);
                        score += Math.max(0, 50 - d);
                    }
                    if (score > bestScore) { bestScore = score; best = rec; }
                }
                if (best) { viewProjMatrix = best.vp; lastView = best.view; }
                viewVotes.clear();
            }

            if (config.showFov) {
                overlayCtx.beginPath(); overlayCtx.arc(cx, cy, config.fov, 0, Math.PI * 2);
                overlayCtx.strokeStyle = config.espColor; overlayCtx.globalAlpha = 0.2; overlayCtx.lineWidth = 1; overlayCtx.stroke(); overlayCtx.globalAlpha = 1.0;
            }

            const players = buildPlayers();
            lastPlayers = players;
            const drawn = [];
            for (const p of players) {
                const sPosHead = worldToScreen(p.position), sPosFoot = worldToScreen(p.basePosition);
                if (!sPosHead) continue;
                drawn.push({ p, sHead: sPosHead, sFoot: sPosFoot, d: Math.hypot(sPosHead[0] - cx, sPosHead[1] - cy) });
                if (!sPosFoot) continue;
                const top = Math.min(sPosHead[1], sPosFoot[1]);
                const bottom = Math.max(sPosHead[1], sPosFoot[1]);
                const h = Math.max(8, (bottom - top) * config.boxScale);
                const w = Math.max(3, h * config.boxWidth);
                const bx = sPosHead[0] - w / 2;
                overlayCtx.strokeStyle = p.enemy ? '#ff3b3b' : config.espColor; overlayCtx.lineWidth = 1.5;
                if (config.espBoxes) { if (config.espStyle === 'Corner') drawCornerBox(overlayCtx, bx, top, w, h); else overlayCtx.strokeRect(bx, top, w, h); }
                if (config.espLines) { overlayCtx.beginPath(); overlayCtx.moveTo(cx, window.innerHeight); overlayCtx.lineTo(sPosHead[0], sPosFoot[1] || sPosHead[1]); overlayCtx.globalAlpha = 0.3; overlayCtx.stroke(); overlayCtx.globalAlpha = 1.0; }
                if (config.espSkeleton) { overlayCtx.beginPath(); overlayCtx.moveTo(sPosHead[0], sPosHead[1]); overlayCtx.lineTo(sPosFoot[0], sPosFoot[1]); overlayCtx.stroke(); }
            }
            let best = null;
            if (isAiming && config.stickyTarget && lastLockedTarget) {
                const locked = drawn.find(o => o.p.key === lastLockedTarget);
                if (locked) best = locked.p;
            }
            if (!best) {
                let cam = null;
                if (lastView) cam = [
                    -(lastView[0] * lastView[12] + lastView[1] * lastView[13] + lastView[2] * lastView[14]),
                    -(lastView[4] * lastView[12] + lastView[5] * lastView[13] + lastView[6] * lastView[14]),
                    -(lastView[8] * lastView[12] + lastView[9] * lastView[13] + lastView[10] * lastView[14])
                ];
                const pool = drawn.filter(o => {
                    if (o.d >= config.fov) return false;
                    if (cam) {
                        const b = o.p.basePosition;
                        const d2 = (b[0] - cam[0]) ** 2 + (b[1] - cam[1]) ** 2 + (b[2] - cam[2]) ** 2;
                        if (d2 < 4) return false;
                    }
                    return true;
                });
                const enemies = pool.filter(o => o.p.enemy);
                const use = enemies.length ? enemies : pool;
                let min = Infinity;
                for (const o of use) if (o.d < min) { min = o.d; best = o.p; }
            }
            currentTarget = best;
            aimFrame++;

            const inGame = !!document.pointerLockElement;
            let wantFire = false;
            const externalFire = config.externalAim && configLinkOk;
            if (inGame) {
                const headPos = currentTarget ? worldToScreen(currentTarget.position) : null;
                const crossDist = headPos ? Math.hypot(headPos[0] - cx, headPos[1] - cy) : Infinity;
                const triggerHit = config.triggerbot && currentTarget && currentTarget.enemy && crossDist <= config.triggerbotFov;
                const aimkillHit = config.aimkill && config.aimbotEnabled && currentTarget && currentTarget.enemy && crossDist <= Math.max(config.triggerbotFov, 30);
                wantFire = !!(triggerHit || aimkillHit);
                if (!externalFire && wantFire) scheduleFire(config.aimkill ? 0 : config.triggerbotDelay, config.triggerbotCooldown);
                if (!externalFire) {
                    if (config.rapidFire && leftDown && Date.now() - lastRapid >= config.rapidFireDelay) {
                        lastRapid = Date.now();
                        sendMouse('mousedown');
                        setTimeout(() => sendMouse('mouseup'), 20);
                    }
                    if (config.autoBhop && spaceDown && Date.now() - lastBhop >= config.bhopInterval) {
                        lastBhop = Date.now();
                        sendKey('keydown', 'Space');
                        setTimeout(() => sendKey('keyup', 'Space'), 20);
                    }
                    if (config.fly && Date.now() - lastFly >= 45) {
                        lastFly = Date.now();
                        sendKey('keydown', 'Space');
                        setTimeout(() => sendKey('keyup', 'Space'), 15);
                    }
                    if (config.speedHack && !sprintHeld) { sprintHeld = true; sendKey('keydown', 'ShiftLeft'); }
                }
            }
            if (!externalFire && sprintHeld && (!config.speedHack || !inGame)) { sprintHeld = false; sendKey('keyup', 'ShiftLeft'); }

            pumpAim();
            if (config.externalAim) safe(() => {
                const mx = getAimbotMotion(false), my = getAimbotMotion(true);
                const aiming = aimActive();
                const base = {
                    externalAim: true, aiming, frame: aimFrame, method: config.aimMethod, aimScale: config.aimScale,
                    cx: Math.round(window.innerWidth / 2), cy: Math.round(window.innerHeight / 2),
                    fire: wantFire, rapid: !!(config.rapidFire && leftDown), bhop: !!(config.autoBhop && spaceDown),
                    fly: !!config.fly, sprint: !!config.speedHack,
                    fireCooldown: config.triggerbotCooldown, rapidDelay: config.rapidFireDelay, bhopInterval: config.bhopInterval
                };
                const pusher = W.__s1lverPush || W.__zetaPush;
                if (typeof pusher === 'function') {
                    lastPushInfo = { mx, my, aiming, t: Date.now() };
                    pushCount++;
                    pusher(JSON.stringify({ ...base, mx, my }));
                    return;
                }
                if (aiming) {
                    if (Number.isFinite(mx)) pendingPushX += mx;
                    if (Number.isFinite(my)) pendingPushY += my;
                } else { pendingPushX = 0; pendingPushY = 0; }
                const t = performance.now();
                if (t - lastHttpPush < 33) return;
                lastHttpPush = t;
                const state = { ...base, mx: pendingPushX, my: pendingPushY };
                lastPushInfo = { mx: state.mx, my: state.my, aiming, t: Date.now() };
                pushCount++;
                pendingPushX = 0; pendingPushY = 0;
                if (typeof GM_xmlhttpRequest === 'function') GM_xmlhttpRequest({ method: 'POST', url: 'http://127.0.0.1:8686/push', headers: { 'Content-Type': 'application/json' }, data: JSON.stringify(state), timeout: 1000, onload: (r) => { configLinkOk = r.status >= 200 && r.status < 300; }, onerror: () => {}, ontimeout: () => {} });
            });

            const aimStat = $('stat-aim');
            const statusMx = getAimbotMotion(false), statusMy = getAimbotMotion(true);
            if (aimStat) aimStat.innerText = aimActive() ? (currentTarget ? `Aim: ${config.externalAim ? 'EXT' : 'ON'} (${statusMx == null ? '?' : statusMx},${statusMy == null ? '?' : statusMy})` : 'Aim: no target') : 'Aim: idle';
            const pyStat = $('stat-py');
            if (pyStat) {
                pyStat.innerText = config.externalAim ? (configLinkOk ? 'Py: link' : 'Py: off') : 'Py: in-page';
                pyStat.dataset.ok = configLinkOk ? '1' : '0';
            }
            const glStat = $('stat-gl');
            if (glStat) glStat.innerText = `GL: ${hookedCtx}`;
            const netStat = $('stat-net');
            if (netStat) netStat.innerText = `${pushCount} push`;

            const lockStatus = $('stat-lock');
            if (lockStatus) {
                lockStatus.innerText = currentTarget ? 'Lock: active' : 'Lock: none';
                lockStatus.dataset.ok = currentTarget ? '1' : '0';
            }

            detectedPlayers.length = 0;
            if (PLAYER_HISTORY.size > 50) { const now = Date.now(); for (const [id, data] of PLAYER_HISTORY) if (now - data.tick > 2000) PLAYER_HISTORY.delete(id); }
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);

        const syncUIWithState = () => syncAll();

        const uiKeyHandler = (e) => {
            if (e.code === 'ShiftRight' || e.code === 'Insert') {
                setVisible(!config.menuVisible);
            }
            if (e.code === 'F1') { config.aimbotEnabled = !config.aimbotEnabled; syncUIWithState(); sendConfig(); }
            if (e.code === 'F2') { config.chamsEnabled = !config.chamsEnabled; config.espBoxes = !config.espBoxes; syncUIWithState(); sendConfig(); }
        };
        uiKeyHandler.__s1lverLocal = true;
        window.addEventListener('keydown', uiKeyHandler);
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
