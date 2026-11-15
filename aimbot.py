#!/usr/bin/env python3
"""
S1lverBack.lol — external input engine for deadshot.io.

shadcn/ui · Zinc Edition.

Architecture
  userscript -> computes aim motion per frame -> window.__s1lverPush(JSON)
             -> Python receives it over CDP (low latency) or HTTP /push
  Python     -> applies motion and input with the selected backend.

Backends
  handler   - call the game's own pointerrawupdate handler directly via CDP
  nudge     - call the userscript's captured-handler bridge (__s1lverNudge)
  cdpInput  - trusted CDP Input.dispatchMouseEvent moves (experimental)
  uinput    - OS-level relative motion via /dev/uinput (evdev)
  xdotool   - X11 / XWayland relative motion
  ydotool   - OS-level relative motion via the ydotool CLI
  auto      - handler -> nudge -> uinput -> xdotool -> ydotool -> cdpInput

The userscript POSTs config to /config on change. Every push also carries the
current values, so the bridge keeps working if HTTP config is unavailable.

The GUI is optional (PySide6). Headless mode is preserved with --no-gui.
"""

import argparse
import collections
import json
import os
import queue
import shutil
import subprocess
import sys
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

try:
    import websocket  # websocket-client
except Exception:
    print("Missing dependency: pip install websocket-client", file=sys.stderr)
    raise

BRAND = "S1lverBack.lol"
VERSION = "4.1"
EDITION = "shadcn/ui · Zinc Edition"
PUSH_MARKER = "__S1LVER__"
PUSH_MARKER_LEGACY = "__ZETA__"

CONFIG = {"method": "auto", "aimScale": 1.0}
CONFIG_LOCK = threading.Lock()
PUSH_STATE = {}
PUSH_LOCK = threading.Lock()
VERBOSE = False
AIMER = None
STOP_EVENT = threading.Event()

LOG_LOCK = threading.Lock()
LOG_BUFFER = collections.deque(maxlen=1200)


def emit(message):
    line = "%s %s" % (time.strftime("%H:%M:%S"), message)
    with LOG_LOCK:
        LOG_BUFFER.append(line)
    print(line, flush=True)


def log(*parts):
    if VERBOSE:
        emit("[debug] " + " ".join(str(p) for p in parts))


def read_logs():
    with LOG_LOCK:
        return list(LOG_BUFFER)


def backend_available(name):
    if name == "uinput":
        return os.access("/dev/uinput", os.W_OK), "/dev/uinput"
    path = shutil.which(name)
    return bool(path), path or "not found"


def uinput_test():
    try:
        from evdev import UInput, ecodes as e
        cap = {
            e.EV_KEY: [e.BTN_LEFT, e.BTN_RIGHT, e.BTN_MIDDLE],
            e.EV_REL: [e.REL_X, e.REL_Y, e.REL_WHEEL, e.REL_HWHEEL],
        }
        try:
            ui = UInput(cap, name="s1lverback-test", version=1, input_props=[e.INPUT_PROP_POINTER])
        except TypeError:
            ui = UInput(cap, name="s1lverback-test", version=1)
        time.sleep(0.2)
        ui.write(e.EV_REL, e.REL_X, 120)
        ui.write(e.EV_REL, e.REL_Y, 0)
        ui.syn()
        time.sleep(0.2)
        try:
            ui.close()
        except Exception:
            pass
        return True, "uinput test wrote REL_X +120; the cursor should have moved"
    except Exception as ex:
        return False, "uinput test failed: %s" % ex


class CDP:
    def __init__(self, port):
        self.port = port
        self.ws = None
        self._id = 0
        self._send_lock = threading.Lock()
        self._pending = {}
        self._pending_lock = threading.Lock()
        self._reader = None
        self.closed = False
        self.push_q = queue.Queue(maxsize=240)
        self.page = None
        self.hid = None
        self.htype = None
        self.hid_ts = 0.0
        self.ix = None
        self.iy = None
        self._seen = 0

    @property
    def connected(self):
        return self.ws is not None and not self.closed

    def _find_page(self):
        url = "http://127.0.0.1:%d/json/list" % self.port
        pages = json.load(urllib.request.urlopen(url, timeout=1))
        cands = [p for p in pages if p.get("type") == "page" and "deadshot.io" in (p.get("url") or "")]
        if not cands:
            cands = [p for p in pages if p.get("type") == "page"]
        if not cands:
            raise RuntimeError("no page targets")
        return cands[0]

    def connect(self):
        self.close()
        self.page = self._find_page()
        ws_url = self.page.get("webSocketDebuggerUrl")
        if not ws_url:
            ws_url = "ws://127.0.0.1:%d/devtools/page/%s" % (self.port, self.page["id"])
        try:
            ws = websocket.create_connection(ws_url, timeout=2, max_size=1 << 24, suppress_origin=True)
        except TypeError:
            ws = websocket.create_connection(ws_url, timeout=2, max_size=1 << 24)
        self.ws = ws
        self.closed = False
        self._reader = threading.Thread(target=self._read_loop, daemon=True, name="s1lver-cdp-reader")
        self._reader.start()
        try:
            self.call("Runtime.enable", timeout=3)
        except Exception:
            pass
        self.hid = None
        self.htype = None
        emit("CDP connected to %s" % ((self.page.get("url") or "")[:80],))

    def close(self):
        self.closed = True
        try:
            if self.ws:
                self.ws.close()
        except Exception:
            pass
        self.ws = None
        with self._pending_lock:
            for p in self._pending.values():
                p["ev"].set()
            self._pending.clear()

    def _read_loop(self):
        while not self.closed:
            ws = self.ws
            if not ws:
                break
            try:
                raw = ws.recv()
            except Exception:
                break
            if not raw:
                break
            if VERBOSE and self._seen < 20:
                self._seen += 1
                log("recv:", raw[:300])
            try:
                msg = json.loads(raw)
            except Exception:
                continue
            if "id" in msg:
                with self._pending_lock:
                    p = self._pending.pop(msg["id"], None)
                if p:
                    p["msg"] = msg
                    p["ev"].set()
            elif msg.get("method") == "Runtime.consoleAPICalled":
                params = msg.get("params") or {}
                args = params.get("args") or []
                if not args:
                    continue
                val = args[0].get("value")
                if not isinstance(val, str):
                    continue
                payload = None
                if val.startswith(PUSH_MARKER):
                    payload = val[len(PUSH_MARKER):]
                elif val.startswith(PUSH_MARKER_LEGACY):
                    payload = val[len(PUSH_MARKER_LEGACY):]
                if payload is None:
                    continue
                try:
                    data = json.loads(payload)
                except Exception:
                    continue
                try:
                    self.push_q.put_nowait(data)
                except queue.Full:
                    try:
                        self.push_q.get_nowait()
                    except Exception:
                        pass
                    try:
                        self.push_q.put_nowait(data)
                    except Exception:
                        pass
        self.closed = True

    def call(self, method, params=None, timeout=6):
        if not self.ws:
            raise RuntimeError("not connected")
        with self._send_lock:
            self._id += 1
            mid = self._id
            ev = threading.Event()
            with self._pending_lock:
                self._pending[mid] = {"ev": ev, "msg": None}
            try:
                self.ws.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
            except Exception:
                with self._pending_lock:
                    self._pending.pop(mid, None)
                raise
        if not ev.wait(timeout):
            with self._pending_lock:
                self._pending.pop(mid, None)
            raise TimeoutError(method)
        with self._pending_lock:
            p = self._pending.pop(mid, None)
        msg = (p or {}).get("msg") or {}
        if VERBOSE and method == "Runtime.evaluate":
            log("eval resp:", json.dumps(msg)[:400])
        if "error" in msg:
            raise RuntimeError("%s: %s" % (method, msg["error"]))
        return msg.get("result", {})

    def send(self, method, params=None):
        if not self.ws:
            return False
        with self._send_lock:
            self._id += 1
            try:
                self.ws.send(json.dumps({"id": self._id, "method": method, "params": params or {}}))
                return True
            except Exception:
                return False

    def eval(self, expr, by_value=True):
        r = self.call("Runtime.evaluate", {"expression": expr, "returnByValue": by_value, "awaitPromise": True})
        res = r.get("result", {})
        return res.get("value") if by_value else res

    def ensure_push(self):
        try:
            probe = self.eval(
                "(typeof window.__s1lverPush === 'function' || typeof window.__zetaPush === 'function')"
            )
            if probe:
                return True
        except Exception as e:
            log("push probe error:", e)
            return False
        expr = (
            "window.__s1lverPush=function(p){try{console.log('%s'+p)}catch(e){}};"
            "window.__zetaPush=window.__s1lverPush;"
            "typeof window.__s1lverPush" % PUSH_MARKER
        )
        try:
            r = self.call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
        except Exception as e:
            log("inject error:", e)
            return False
        res = r.get("result") or {}
        log("inject:", res.get("value"), "exception:", bool(r.get("exceptionDetails")))
        return res.get("value") == "function"

    def get_handler(self, force=False):
        now = time.time()
        if not force and self.hid and now - self.hid_ts < 5.0:
            return self.hid, self.htype
        try:
            w = self.eval("window", by_value=False)
            wid = w.get("objectId")
            if not wid:
                return None, None
            r = self.call("DOMDebugger.getEventListeners", {"objectId": wid, "depth": 0})
        except Exception:
            return None, None
        for want in ("pointerrawupdate", "pointermove"):
            for lst in r.get("listeners", []):
                h = lst.get("handler") or lst.get("originalHandler") or {}
                if lst.get("type") == want and h.get("objectId"):
                    self.hid, self.htype, self.hid_ts = h["objectId"], want, now
                    log("handler:", want)
                    return self.hid, self.htype
        return None, None

    HANDLER_FN = """function(mx,my,type){
        var ev = new PointerEvent(type,{bubbles:true,cancelable:true,pointerType:'mouse',pointerId:1});
        try{Object.defineProperty(ev,'movementX',{value:mx,configurable:true,enumerable:true})}catch(e){}
        try{Object.defineProperty(ev,'movementY',{value:my,configurable:true,enumerable:true})}catch(e){}
        try{Object.defineProperty(ev,'isTrusted',{value:true,configurable:true})}catch(e){}
        try{Object.defineProperty(ev,'target',{value:document.pointerLockElement||document.body,configurable:true})}catch(e){}
        try{Object.defineProperty(ev,'currentTarget',{value:window,configurable:true})}catch(e){}
        try{Object.defineProperty(ev,'getCoalescedEvents',{value:function(){return [ev]},configurable:true})}catch(e){}
        return this.call(window, ev);
    }"""

    def apply_handler(self, mx, my):
        hid, htype = self.get_handler()
        if not hid:
            return False
        return self.send("Runtime.callFunctionOn", {
            "objectId": hid,
            "functionDeclaration": self.HANDLER_FN,
            "arguments": [{"value": mx}, {"value": my}, {"value": htype}],
            "returnByValue": True,
        })

    def apply_nudge(self, mx, my):
        expr = (
            "(()=>{try{var f=window.__s1lverNudge||window.__zetaNudge;"
            "return f?f(%d,%d):{handlers:0}}catch(e){return {err:String(e)}}})()"
            % (int(round(mx)), int(round(my)))
        )
        try:
            r = self.eval(expr)
        except Exception:
            return False
        return bool(r and r.get("handlers", 0) > 0)

    def apply_cdp_input(self, mx, my, state):
        cx = state.get("cx") or 960
        cy = state.get("cy") or 540
        if self.ix is None or self.iy is None:
            self.ix, self.iy = cx, cy
        nx, ny = self.ix + mx, self.iy + my
        nx = max(1.0, min(cx * 2 - 2, nx))
        ny = max(1.0, min(cy * 2 - 2, ny))
        ok = self.send("Input.dispatchMouseEvent", {
            "type": "mouseMoved", "x": nx, "y": ny,
            "button": "none", "buttons": 0, "pointerType": "mouse",
        })
        self.ix, self.iy = nx, ny
        return ok


class Aimer:
    def __init__(self, cdp):
        self.cdp = cdp
        self.auto_choice = None
        self.ui = None
        self.state = None
        self.last_frame = -1
        self.last_push = 0.0
        self.last_handler = 0.0
        self.last_inject = 0.0
        self.last_connect = 0.0
        self.last_err = 0.0
        self.last_nomethod = 0.0
        self.last_plog = 0.0
        self.last_apply_log = 0.0
        self.last_warn = 0.0
        self.last_trigger_fire = 0.0
        self.last_rapid_fire = 0.0
        self.last_bhop = 0.0
        self.last_fly = 0.0
        self.sprint_held = False
        self.frames = 0
        self.moves = 0
        self.t0 = time.time()

    def status(self):
        dt = max(0.001, time.time() - self.t0)
        with CONFIG_LOCK:
            method = CONFIG.get("method") or "auto"
        if method == "auto":
            method = self.auto_choice or "auto"
        return {
            "fps": round(self.frames / dt, 1),
            "moves": self.moves,
            "method": method,
            "pushAge": round(time.time() - self.last_push, 2) if self.last_push else None,
        }

    def snapshot(self):
        now = time.time()
        dt = max(0.001, now - self.t0)
        with CONFIG_LOCK:
            cfg = dict(CONFIG)
        with PUSH_LOCK:
            st = dict(PUSH_STATE)
        method = cfg.get("method") or st.get("method") or "auto"
        if method == "auto":
            method = self.auto_choice or "auto"
        return {
            "fps": round(self.frames / dt, 1),
            "moves": self.moves,
            "frames": self.frames,
            "method": method,
            "pushAge": round(now - self.last_push, 2) if self.last_push else None,
            "cdp": self.cdp.connected,
            "config": cfg,
            "push": st,
            "uptime": round(dt, 1),
            "sprintHeld": self.sprint_held,
        }

    def set_config(self, updates):
        if not updates:
            return
        with CONFIG_LOCK:
            CONFIG.update(updates)
        emit("config " + ", ".join("%s=%s" % (k, updates[k]) for k in updates))

    def reconnect(self):
        self.last_connect = 0.0
        self.last_handler = 0.0
        self.last_inject = 0.0
        self.cdp.close()
        emit("CDP reconnect requested")

    def release_all(self):
        if self.sprint_held:
            self.sprint_held = False
            self._key("keyup", "shift")

    def _ensure_ui(self):
        if self.ui is not None:
            return self.ui
        from evdev import UInput, ecodes as e
        cap = {
            e.EV_KEY: [e.BTN_LEFT, e.BTN_RIGHT, e.BTN_MIDDLE],
            e.EV_REL: [e.REL_X, e.REL_Y, e.REL_WHEEL, e.REL_HWHEEL],
        }
        try:
            self.ui = UInput(cap, name="s1lverback-engine", version=1, input_props=[e.INPUT_PROP_POINTER])
        except TypeError:
            self.ui = UInput(cap, name="s1lverback-engine", version=1)
        return self.ui

    def _uinput(self, mx, my, scale):
        ui = self._ensure_ui()
        from evdev import ecodes as e
        ui.write(e.EV_REL, e.REL_X, int(round(mx * scale)))
        ui.write(e.EV_REL, e.REL_Y, int(round(my * scale)))
        ui.syn()
        return True

    def _click(self):
        if shutil.which("xdotool") and os.environ.get("DISPLAY"):
            r = subprocess.run(["xdotool", "click", "1"], timeout=0.5, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if r.returncode == 0:
                return True
        ui = self._ensure_ui()
        from evdev import ecodes as e
        ui.write(e.EV_KEY, e.BTN_LEFT, 1)
        ui.syn()
        time.sleep(0.02)
        ui.write(e.EV_KEY, e.BTN_LEFT, 0)
        ui.syn()
        return True

    def _key(self, cmd, key):
        if not (shutil.which("xdotool") and os.environ.get("DISPLAY")):
            return False
        r = subprocess.run(["xdotool", cmd, key], timeout=0.5, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return r.returncode == 0

    def _ydotool(self, mx, my, scale):
        r = subprocess.run(
            ["ydotool", "mousemove_relative", "--", str(int(round(mx * scale))), str(int(round(my * scale)))],
            timeout=0.5, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        if r.returncode != 0:
            raise RuntimeError("ydotool exit %d (is ydotoold running?)" % r.returncode)
        return True

    def _xdotool(self, mx, my, scale):
        r = subprocess.run(
            ["xdotool", "mousemove_relative", "--", str(int(round(mx * scale))), str(int(round(my * scale)))],
            timeout=0.5, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        if r.returncode != 0:
            raise RuntimeError("xdotool exit %d (need X11/XWayland, DISPLAY set)" % r.returncode)
        return True

    def _apply_one(self, method, mx, my, scale):
        if method == "handler":
            return self.cdp.apply_handler(mx, my)
        if method == "nudge":
            return self.cdp.apply_nudge(mx, my)
        if method == "cdpInput":
            return self.cdp.apply_cdp_input(mx, my, self.state or {})
        if method == "uinput":
            return self._uinput(mx, my, scale)
        if method == "ydotool":
            return self._ydotool(mx, my, scale)
        if method == "xdotool":
            return self._xdotool(mx, my, scale)
        return False

    def apply(self, method, mx, my, scale):
        if method == "auto":
            if self.auto_choice:
                if self._apply_one(self.auto_choice, mx, my, scale):
                    return True
                self.auto_choice = None
            for cand in ("handler", "nudge", "uinput", "xdotool", "ydotool", "cdpInput"):
                try:
                    if self._apply_one(cand, mx, my, scale):
                        self.auto_choice = cand
                        log("auto method:", cand)
                        return True
                except Exception as e:
                    log("auto", cand, "failed:", e)
            now = time.time()
            if now - self.last_nomethod > 5.0:
                self.last_nomethod = now
                emit("auto: no working method (uinput perms / ydotoold?)")
            return False
        return self._apply_one(method, mx, my, scale)

    def _apply_state(self, st):
        if not isinstance(st, dict):
            return
        self.frames += 1
        frame = st.get("frame")
        if frame is not None:
            if frame == self.last_frame:
                return
            self.last_frame = frame
        self.state = st
        with CONFIG_LOCK:
            cfg = dict(CONFIG)
        if cfg.get("externalAim") is False or not st.get("externalAim") or not st.get("aiming"):
            return
        mx, my = st.get("mx"), st.get("my")
        if not isinstance(mx, (int, float)) or not isinstance(my, (int, float)):
            return
        if abs(mx) < 0.5 and abs(my) < 0.5:
            return
        method = cfg.get("method") or st.get("method") or "auto"
        scale = float(cfg.get("aimScale") or st.get("aimScale") or 1.0)
        try:
            if self.apply(method, mx, my, scale):
                self.moves += 1
                now = time.time()
                if now - self.last_apply_log > 1.0:
                    self.last_apply_log = now
                    emit("applied via %s mx=%s my=%s" % (self.auto_choice or method, mx, my))
        except Exception as e:
            now = time.time()
            if now - self.last_err > 1.0:
                self.last_err = now
                log("apply error:", e)

    def on_push(self, data):
        self.last_push = time.time()
        self._apply_state(data)
        self._fire_state(data)
        self._keys_state(data)

    def http_step(self):
        with PUSH_LOCK:
            if not PUSH_STATE:
                return
            st = dict(PUSH_STATE)
        changed = st.get("frame") != self.last_frame
        if changed:
            self.last_push = time.time()
        self._apply_state(st)
        if changed:
            self._fire_state(st)
            self._keys_state(st)
            now = time.time()
            if now - self.last_plog > 1.0:
                self.last_plog = now
                with CONFIG_LOCK:
                    m = CONFIG.get("method")
                emit("push frame=%s aiming=%s mx=%s my=%s method=%s" % (
                    st.get("frame"), st.get("aiming"), st.get("mx"), st.get("my"),
                    m or st.get("method")))

    def poll(self):
        try:
            st = self.cdp.eval(
                "window.__s1lverAim ? window.__s1lverAim() : (window.__zetaAim ? window.__zetaAim() : null)"
            )
        except Exception as e:
            now = time.time()
            if now - self.last_err > 1.0:
                self.last_err = now
                log("poll error:", e)
            return
        self._apply_state(st)
        self._fire_state(st)
        self._keys_state(st)

    def _fire_state(self, st):
        if not isinstance(st, dict) or not st.get("externalAim"):
            return
        now = time.time()
        with CONFIG_LOCK:
            cfg = dict(CONFIG)
        if st.get("rapid") and cfg.get("rapidFire", True):
            delay = float(st.get("rapidDelay") or cfg.get("rapidFireDelay") or 55) / 1000.0
            if now - self.last_rapid_fire >= max(0.02, delay):
                self.last_rapid_fire = now
                try:
                    self._click()
                except Exception as e:
                    log("click error:", e)
        if st.get("fire"):
            delay = float(st.get("fireCooldown") or cfg.get("triggerbotCooldown") or 120) / 1000.0
            if now - self.last_trigger_fire >= max(0.02, delay):
                self.last_trigger_fire = now
                try:
                    self._click()
                except Exception as e:
                    log("click error:", e)

    def _keys_state(self, st):
        if not isinstance(st, dict) or not st.get("externalAim"):
            return
        now = time.time()
        with CONFIG_LOCK:
            cfg = dict(CONFIG)
        if st.get("bhop"):
            iv = float(st.get("bhopInterval") or cfg.get("bhopInterval") or 60) / 1000.0
            if now - self.last_bhop >= max(0.02, iv):
                self.last_bhop = now
                self._key("key", "space")
        if st.get("fly") and now - self.last_fly >= 0.045:
            self.last_fly = now
            self._key("key", "space")
        if st.get("sprint"):
            if not self.sprint_held:
                self.sprint_held = True
                self._key("keydown", "shift")
        elif self.sprint_held:
            self.sprint_held = False
            self._key("keyup", "shift")

    def loop(self):
        while not STOP_EVENT.is_set():
            try:
                now = time.time()
                if not self.cdp.connected and now - self.last_connect > 3.0:
                    self.last_connect = now
                    try:
                        self.cdp.connect()
                        self.last_handler = 0.0
                        self.last_inject = 0.0
                    except Exception as e:
                        if now - self.last_err > 5.0:
                            self.last_err = now
                            log("cdp unavailable:", e)
                now = time.time()
                if self.cdp.connected:
                    if now - self.last_handler > 5.0:
                        self.cdp.get_handler(force=True)
                        self.last_handler = now
                    if now - self.last_inject > 2.0:
                        self.cdp.ensure_push()
                        self.last_inject = now
                    while True:
                        try:
                            data = self.cdp.push_q.get_nowait()
                        except queue.Empty:
                            break
                        self.on_push(data)
                self.http_step()
                if time.time() - self.last_push > 5.0 and time.time() - self.last_warn > 10.0:
                    self.last_warn = time.time()
                    emit("no push received yet (update userscript / check Py: link)")
                if time.time() - self.last_push > 1.0 and self.sprint_held:
                    self.sprint_held = False
                    self._key("keyup", "shift")
                if self.cdp.connected and time.time() - self.last_push > 1.0:
                    self.poll()
                time.sleep(0.008)
            except Exception as e:
                now = time.time()
                if now - self.last_err > 1.0:
                    self.last_err = now
                    log("loop error:", e)
                self.cdp.close()
                if self.sprint_held:
                    self.sprint_held = False
                    self._key("keyup", "shift")
                time.sleep(0.25)
        self.release_all()


class ConfigHandler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        return

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

    def _send(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self._cors()
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/health"):
            with CONFIG_LOCK:
                cfg = dict(CONFIG)
            with PUSH_LOCK:
                ps = dict(PUSH_STATE)
            self._send(200, {
                "ok": True,
                "brand": BRAND,
                "version": VERSION,
                **cfg,
                "aim": AIMER.status() if AIMER else None,
                "lastPush": ps,
            })
        elif self.path.startswith("/debug"):
            try:
                expr = (
                    "({pushType: typeof window.__s1lverPush, legacyPush: typeof window.__zetaPush,"
                    " aimType: typeof window.__s1lverAim, title: document.title, url: location.href})"
                )
                info = AIMER.cdp.eval(expr) if AIMER else None
                self._send(200, {"ok": True, "brand": BRAND, "version": VERSION, "debug": info})
            except Exception as e:
                self._send(500, {"ok": False, "error": str(e)})
        else:
            self._send(200, {
                "ok": True,
                "brand": BRAND,
                "version": VERSION,
                "endpoints": ["/config", "/push", "/health", "/debug"],
            })

    def do_POST(self):
        try:
            n = int(self.headers.get("Content-Length", "0") or 0)
            data = json.loads(self.rfile.read(n) or b"{}")
        except Exception:
            self._send(400, {"ok": False, "error": "bad json"})
            return
        if not isinstance(data, dict):
            self._send(400, {"ok": False, "error": "bad body"})
            return
        if self.path.startswith("/push"):
            with PUSH_LOCK:
                PUSH_STATE.clear()
                PUSH_STATE.update(data)
            self._send(200, {"ok": True})
            return
        if self.path.startswith("/config"):
            with CONFIG_LOCK:
                CONFIG.update(data)
            emit("config method=%s externalAim=%s aimScale=%s" % (
                CONFIG.get("method"), CONFIG.get("externalAim"), CONFIG.get("aimScale")))
            self._send(200, {"ok": True})
            return
        self._send(404, {"ok": False, "error": "unknown"})


GUI_IMPORT_ERROR = None
try:
    from PySide6.QtCore import Property, QEasingCurve, QPropertyAnimation, Qt, QTimer
    from PySide6.QtGui import QColor, QFont, QGuiApplication, QPainter, QPen
    from PySide6.QtWidgets import (
        QAbstractButton,
        QApplication,
        QButtonGroup,
        QComboBox,
        QFrame,
        QGridLayout,
        QHBoxLayout,
        QLabel,
        QMainWindow,
        QPlainTextEdit,
        QPushButton,
        QScrollArea,
        QSizePolicy,
        QSlider,
        QSpinBox,
        QStackedWidget,
        QVBoxLayout,
        QWidget,
    )
    PYSIDE_OK = True
except Exception as _gui_exc:  # pragma: no cover - environment dependent
    PYSIDE_OK = False
    GUI_IMPORT_ERROR = _gui_exc


if PYSIDE_OK:
    class ToggleSwitch(QAbstractButton):
        def __init__(self, parent=None):
            super().__init__(parent)
            self.setCheckable(True)
            self.setFixedSize(32, 18)
            self.setCursor(Qt.PointingHandCursor)
            self._thumb = 0.0
            self._anim = QPropertyAnimation(self, b"thumbPos", self)
            self._anim.setDuration(150)
            self._anim.setEasingCurve(QEasingCurve.OutCubic)
            self.toggled.connect(self._animate)

        def _get_thumb(self):
            return self._thumb

        def _set_thumb(self, value):
            self._thumb = float(value)
            self.update()

        thumbPos = Property(float, _get_thumb, _set_thumb)

        def _animate(self, checked):
            self._anim.stop()
            self._anim.setStartValue(self._thumb)
            self._anim.setEndValue(1.0 if checked else 0.0)
            self._anim.start()

        def sizeHint(self):
            return self.minimumSizeHint()

        def minimumSizeHint(self):
            return self.size()

        def paintEvent(self, event):
            p = QPainter(self)
            p.setRenderHint(QPainter.RenderHint.Antialiasing)
            w, h = self.width(), self.height()
            checked = self.isChecked()
            p.setPen(QPen(QColor("#3f3f46"), 1))
            p.setBrush(QColor("#e4e4e7") if checked else QColor("#27272a"))
            p.drawRoundedRect(0, 0, w - 1, h - 1, h / 2, h / 2)
            d = 14.0
            x0 = 2.0
            x1 = w - d - 2.0
            x = x0 + (x1 - x0) * self._thumb
            y = (h - d) / 2
            p.setPen(Qt.PenStyle.NoPen)
            p.setBrush(QColor("#18181b") if checked else QColor("#a1a1aa"))
            p.drawEllipse(int(x), int(y), int(d), int(d))


    class MainWindow(QMainWindow):
        def __init__(self, args):
            super().__init__()
            self.args = args
            self._syncing = False
            self._last_log = ""
            self.setWindowTitle("%s — External Engine" % BRAND)
            self.resize(1040, 720)
            self.setMinimumSize(900, 640)
            self._build()
            self._timer = QTimer(self)
            self._timer.timeout.connect(self.refresh)
            self._timer.start(250)
            self.refresh()

        def _build(self):
            root = QWidget()
            root.setObjectName("root")
            self.setCentralWidget(root)
            outer = QVBoxLayout(root)
            outer.setContentsMargins(16, 16, 16, 14)
            outer.setSpacing(12)

            outer.addWidget(self._header())

            body = QHBoxLayout()
            body.setSpacing(12)
            body.addWidget(self._nav())
            self.stack = QStackedWidget()
            self.stack.addWidget(self._page_overview())
            self.stack.addWidget(self._page_engine())
            self.stack.addWidget(self._page_logs())
            self.stack.addWidget(self._page_about())
            body.addWidget(self.stack, 1)
            outer.addLayout(body, 1)

            outer.addWidget(self._bottom())

        def _header(self):
            frame = QFrame()
            frame.setObjectName("header")
            lay = QHBoxLayout(frame)
            lay.setContentsMargins(18, 14, 18, 14)
            lay.setSpacing(14)

            logo = QLabel("S1")
            logo.setObjectName("logo")
            logo.setFixedSize(40, 40)
            logo.setAlignment(Qt.AlignmentFlag.AlignCenter)
            lay.addWidget(logo)

            text = QVBoxLayout()
            text.setSpacing(2)
            title = QLabel(BRAND)
            title.setObjectName("brandTitle")
            sub = QLabel("DEADSHOT.IO · LOCAL ENGINE")
            sub.setObjectName("brandSub")
            text.addWidget(title)
            text.addWidget(sub)
            lay.addLayout(text)
            lay.addStretch(1)

            self.bridge_chip = QLabel("WAITING")
            self.bridge_chip.setObjectName("chip")
            self.bridge_chip.setProperty("state", "idle")
            lay.addWidget(self.bridge_chip)

            version = QLabel("v%s" % VERSION)
            version.setObjectName("chip")
            version.setProperty("state", "idle")
            lay.addWidget(version)
            return frame

        def _nav(self):
            frame = QFrame()
            frame.setObjectName("nav")
            frame.setFixedWidth(196)
            lay = QVBoxLayout(frame)
            lay.setContentsMargins(10, 12, 10, 12)
            lay.setSpacing(4)

            label = QLabel("CONTROL")
            label.setObjectName("metricLabel")
            lay.addWidget(label)
            lay.addSpacing(6)

            self.nav_group = QButtonGroup(self)
            self.nav_group.setExclusive(True)
            names = ["Overview", "Engine", "Logs", "About"]
            for idx, name in enumerate(names):
                btn = QPushButton(name)
                btn.setObjectName("navButton")
                btn.setCheckable(True)
                btn.setCursor(Qt.PointingHandCursor)
                self.nav_group.addButton(btn, idx)
                lay.addWidget(btn)
                if idx == 0:
                    btn.setChecked(True)
            self.nav_group.idClicked.connect(self.stack_set)
            lay.addStretch(1)

            hint = QLabel("LOCAL ONLY\n127.0.0.1")
            hint.setObjectName("muted")
            hint.setAlignment(Qt.AlignmentFlag.AlignCenter)
            lay.addWidget(hint)
            return frame

        def stack_set(self, index):
            self.stack.setCurrentIndex(index)

        def _scroll(self, widget):
            scroll = QScrollArea()
            scroll.setWidgetResizable(True)
            scroll.setFrameShape(QFrame.Shape.NoFrame)
            scroll.setWidget(widget)
            return scroll

        def _card(self, title=None):
            frame = QFrame()
            frame.setObjectName("card")
            lay = QVBoxLayout(frame)
            lay.setContentsMargins(18, 16, 18, 16)
            lay.setSpacing(9)
            if title:
                label = QLabel(title)
                label.setObjectName("sectionTitle")
                lay.addWidget(label)
            return frame, lay

        def _metric(self, title):
            frame = QFrame()
            frame.setObjectName("metricCard")
            frame.setMinimumHeight(96)
            lay = QVBoxLayout(frame)
            lay.setContentsMargins(16, 14, 16, 14)
            lay.setSpacing(3)
            value = QLabel("—")
            value.setObjectName("metricValue")
            caption = QLabel(title.upper())
            caption.setObjectName("metricLabel")
            lay.addWidget(value)
            lay.addWidget(caption)
            return frame, value

        def _row(self, label, widget):
            row = QWidget()
            lay = QHBoxLayout(row)
            lay.setContentsMargins(0, 0, 0, 0)
            lay.setSpacing(12)
            text = QLabel(label)
            text.setObjectName("rowLabel")
            text.setWordWrap(True)
            lay.addWidget(text, 1)
            lay.addWidget(widget, 0, Qt.AlignmentFlag.AlignRight)
            return row

        def _slider_row(self, label, minimum, maximum, value):
            box = QWidget()
            lay = QVBoxLayout(box)
            lay.setContentsMargins(0, 0, 0, 0)
            lay.setSpacing(7)
            top = QHBoxLayout()
            cap = QLabel(label)
            cap.setObjectName("rowLabel")
            pill = QLabel(str(value))
            pill.setObjectName("valuePill")
            top.addWidget(cap, 1)
            top.addWidget(pill)
            slider = QSlider(Qt.Orientation.Horizontal)
            slider.setRange(minimum, maximum)
            slider.setValue(value)
            slider.setPageStep(max(1, (maximum - minimum) // 10))
            lay.addLayout(top)
            lay.addWidget(slider)
            return box, slider, pill

        def _page_overview(self):
            page = QWidget()
            lay = QVBoxLayout(page)
            lay.setContentsMargins(0, 0, 4, 0)
            lay.setSpacing(12)

            grid = QGridLayout()
            grid.setSpacing(12)
            card, self.moves_value = self._metric("Moves applied")
            grid.addWidget(card, 0, 0)
            card, self.fps_value = self._metric("Frames / sec")
            grid.addWidget(card, 0, 1)
            card, self.push_value = self._metric("Push age")
            grid.addWidget(card, 1, 0)
            card, self.method_value = self._metric("Active method")
            grid.addWidget(card, 1, 1)
            lay.addLayout(grid)

            frame, card_lay = self._card("Bridge status")
            self.bridge_state = QLabel("Waiting for the userscript to push frames.")
            self.bridge_state.setObjectName("muted")
            self.bridge_state.setWordWrap(True)
            card_lay.addWidget(self.bridge_state)
            self.cdp_label = QLabel("CDP: optional / offline")
            self.cdp_label.setObjectName("muted")
            self.frames_label = QLabel("Frames received: 0")
            self.frames_label.setObjectName("muted")
            self.endpoint_label = QLabel("Endpoint: http://127.0.0.1:%d" % self.args.config_port)
            self.endpoint_label.setObjectName("muted")
            card_lay.addWidget(self.cdp_label)
            card_lay.addWidget(self.frames_label)
            card_lay.addWidget(self.endpoint_label)
            lay.addWidget(frame)

            frame, card_lay = self._card("Activity")
            self.log_preview = QPlainTextEdit()
            self.log_preview.setObjectName("logPreview")
            self.log_preview.setReadOnly(True)
            self.log_preview.setMaximumHeight(150)
            self.log_preview.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)
            card_lay.addWidget(self.log_preview)
            lay.addWidget(frame, 1)
            return self._scroll(page)

        def _page_engine(self):
            page = QWidget()
            lay = QVBoxLayout(page)
            lay.setContentsMargins(0, 0, 4, 0)
            lay.setSpacing(12)

            frame, card_lay = self._card("Input engine")
            with CONFIG_LOCK:
                cfg = dict(CONFIG)
            self.method_combo = QComboBox()
            methods = [
                ("Auto select", "auto"),
                ("Handler (CDP)", "handler"),
                ("Nudge (bridge)", "nudge"),
                ("CDP input", "cdpInput"),
                ("uinput", "uinput"),
                ("xdotool (X11/XWayland)", "xdotool"),
                ("ydotool", "ydotool"),
            ]
            for name, value in methods:
                self.method_combo.addItem(name, value)
            idx = self.method_combo.findData(cfg.get("method") or "auto")
            self.method_combo.setCurrentIndex(max(0, idx))
            self.method_combo.currentIndexChanged.connect(self._method_changed)
            card_lay.addWidget(self._row("Input method", self.method_combo))

            self.external_toggle = ToggleSwitch()
            self.external_toggle.setChecked(cfg.get("externalAim") is not False)
            self.external_toggle.toggled.connect(self._external_changed)
            card_lay.addWidget(self._row("External aim bridge", self.external_toggle))

            scale = int(round(float(cfg.get("aimScale") or 1.0) * 100))
            box, self.scale_slider, self.scale_value = self._slider_row("Aim scale", 10, 400, max(10, min(400, scale)))
            self.scale_slider.valueChanged.connect(self._scale_dragged)
            self._scale_timer = QTimer(self)
            self._scale_timer.setSingleShot(True)
            self._scale_timer.timeout.connect(self._commit_scale)
            card_lay.addWidget(box)
            lay.addWidget(frame)

            frame, card_lay = self._card("Timing")
            self.rapid_spin = QSpinBox()
            self.rapid_spin.setRange(20, 300)
            self.rapid_spin.setSuffix(" ms")
            self.rapid_spin.setValue(int(cfg.get("rapidFireDelay") or 55))
            self.rapid_spin.valueChanged.connect(lambda v: self._set_cfg("rapidFireDelay", v))
            card_lay.addWidget(self._row("Rapid fire delay", self.rapid_spin))

            self.cooldown_spin = QSpinBox()
            self.cooldown_spin.setRange(30, 1000)
            self.cooldown_spin.setSuffix(" ms")
            self.cooldown_spin.setValue(int(cfg.get("triggerbotCooldown") or 120))
            self.cooldown_spin.valueChanged.connect(lambda v: self._set_cfg("triggerbotCooldown", v))
            card_lay.addWidget(self._row("Trigger cooldown", self.cooldown_spin))

            self.bhop_spin = QSpinBox()
            self.bhop_spin.setRange(20, 200)
            self.bhop_spin.setSuffix(" ms")
            self.bhop_spin.setValue(int(cfg.get("bhopInterval") or 60))
            self.bhop_spin.valueChanged.connect(lambda v: self._set_cfg("bhopInterval", v))
            card_lay.addWidget(self._row("Bhop tap interval", self.bhop_spin))
            lay.addWidget(frame)

            frame, card_lay = self._card("Input backends")
            self.uinput_label = QLabel()
            self.ydotool_label = QLabel()
            self.xdotool_label = QLabel()
            for w in (self.uinput_label, self.ydotool_label, self.xdotool_label):
                w.setObjectName("muted")
                card_lay.addWidget(w)
            self._refresh_backends()

            actions = QHBoxLayout()
            self.test_btn = QPushButton("Test uinput")
            self.test_btn.setObjectName("tonal")
            self.test_btn.clicked.connect(self._test_uinput)
            reconnect = QPushButton("Reconnect CDP")
            reconnect.setObjectName("tonal")
            reconnect.clicked.connect(self._reconnect)
            copy = QPushButton("Copy endpoint")
            copy.setObjectName("primary")
            copy.clicked.connect(self._copy_endpoint)
            actions.addWidget(self.test_btn)
            actions.addWidget(reconnect)
            actions.addStretch(1)
            actions.addWidget(copy)
            card_lay.addLayout(actions)
            lay.addWidget(frame)

            note, note_lay = self._card("Notes")
            text = QLabel(
                "On KDE Wayland, run the game inside XWayland and use xdotool. "
                "Native Wayland pointer lock ignores synthetic uinput motion. "
                "CDP is optional and only available in Chromium-based browsers."
            )
            text.setObjectName("muted")
            text.setWordWrap(True)
            note_lay.addWidget(text)
            lay.addWidget(note)
            lay.addStretch(1)
            return self._scroll(page)

        def _page_logs(self):
            frame = QFrame()
            frame.setObjectName("card")
            lay = QVBoxLayout(frame)
            lay.setContentsMargins(18, 16, 18, 16)
            title = QLabel("Engine log")
            title.setObjectName("sectionTitle")
            lay.addWidget(title)
            hint = QLabel("Live feed from the bridge, input backends, and the aim engine.")
            hint.setObjectName("muted")
            lay.addWidget(hint)
            self.log_view = QPlainTextEdit()
            self.log_view.setObjectName("log")
            self.log_view.setReadOnly(True)
            self.log_view.setLineWrapMode(QPlainTextEdit.LineWrapMode.NoWrap)
            lay.addWidget(self.log_view, 1)
            return frame

        def _page_about(self):
            page = QWidget()
            lay = QVBoxLayout(page)
            lay.setContentsMargins(0, 0, 4, 0)
            lay.setSpacing(12)

            frame, card_lay = self._card("S1lverBack.lol")
            title = QLabel("shadcn/ui · Zinc Edition")
            title.setObjectName("brandTitle")
            sub = QLabel(
                "A local-only aim and input bridge for deadshot.io. "
                "The userscript renders ESP and computes motion; this engine applies input."
            )
            sub.setObjectName("muted")
            sub.setWordWrap(True)
            card_lay.addWidget(title)
            card_lay.addWidget(sub)
            card_lay.addWidget(self._row("Version", QLabel("v%s" % VERSION)))
            card_lay.addWidget(self._row("Config endpoint", QLabel("http://127.0.0.1:%d" % self.args.config_port)))
            card_lay.addWidget(self._row("CDP endpoint", QLabel("http://127.0.0.1:%d" % self.args.cdp_port)))
            lay.addWidget(frame)

            frame, card_lay = self._card("Keybinds")
            for key, action in [
                ("R-Shift / Insert", "Show or hide the userscript menu"),
                ("F1", "Toggle the aimbot engine"),
                ("F2", "Toggle ESP and chams"),
                ("Aim key", "Configurable in the AiM tab"),
            ]:
                card_lay.addWidget(self._row(action, QLabel(key)))
            lay.addWidget(frame)

            frame, card_lay = self._card("Safety")
            text = QLabel(
                "Everything runs on localhost. No accounts, telemetry, or remote endpoints. "
                "Keep the userscript and the engine on the same machine, and use xdotool only "
                "where you are allowed to inject input."
            )
            text.setObjectName("muted")
            text.setWordWrap(True)
            card_lay.addWidget(text)
            lay.addWidget(frame)
            lay.addStretch(1)
            return self._scroll(page)

        def _bottom(self):
            frame = QFrame()
            frame.setObjectName("bottomBar")
            lay = QHBoxLayout(frame)
            lay.setContentsMargins(4, 0, 4, 0)
            lay.setSpacing(8)
            for text in ("LOCAL ONLY", "CONFIG :%d" % self.args.config_port, "CDP :%d" % self.args.cdp_port, "S1LVERBACK v%s" % VERSION):
                chip = QLabel(text)
                chip.setObjectName("chip")
                chip.setProperty("state", "idle")
                lay.addWidget(chip)
            lay.addStretch(1)
            return frame

        def _refresh_backends(self):
            ok, path = backend_available("uinput")
            self.uinput_label.setText("uinput: %s" % ("available · " + path if ok else "no write access · " + path))
            which = shutil.which("ydotool")
            self.ydotool_label.setText("ydotool: %s" % ("available · " + which if which else "not found"))
            which = shutil.which("xdotool")
            display = os.environ.get("DISPLAY") or "not set"
            self.xdotool_label.setText("xdotool: %s · DISPLAY=%s" % (which or "not found", display))

        def _method_changed(self, index):
            if self._syncing:
                return
            value = self.method_combo.itemData(index)
            if AIMER and value:
                AIMER.set_config({"method": value})

        def _external_changed(self, checked):
            if self._syncing:
                return
            if AIMER:
                AIMER.set_config({"externalAim": bool(checked)})

        def _scale_dragged(self, value):
            self.scale_value.setText("%.2f" % (value / 100.0))
            if not self._syncing:
                self._scale_timer.start(140)

        def _commit_scale(self):
            if AIMER:
                AIMER.set_config({"aimScale": round(self.scale_slider.value() / 100.0, 2)})

        def _set_cfg(self, key, value):
            if self._syncing:
                return
            if AIMER:
                AIMER.set_config({key: value})

        def _test_uinput(self):
            ok, message = uinput_test()
            emit(("PASS " if ok else "FAIL ") + message)

        def _reconnect(self):
            if AIMER:
                AIMER.reconnect()

        def _copy_endpoint(self):
            QGuiApplication.clipboard().setText("http://127.0.0.1:%d" % self.args.config_port)
            emit("copied config endpoint to clipboard")

        def _set_chip(self, text, state):
            self.bridge_chip.setText(text)
            if self.bridge_chip.property("state") != state:
                self.bridge_chip.setProperty("state", state)
                self.bridge_chip.style().unpolish(self.bridge_chip)
                self.bridge_chip.style().polish(self.bridge_chip)

        def refresh(self):
            if not AIMER:
                return
            snap = AIMER.snapshot()
            self.moves_value.setText(str(snap["moves"]))
            self.fps_value.setText("%.1f" % snap["fps"])
            age = snap["pushAge"]
            self.push_value.setText("—" if age is None else "%.2fs" % age)
            self.method_value.setText(str(snap["method"]))
            self.frames_label.setText("Frames received: %d" % snap["frames"])
            self.cdp_label.setText("CDP: %s" % ("connected" if snap["cdp"] else "optional / offline"))
            if age is not None and age < 2.0:
                self._set_chip("BRIDGE LIVE", "live")
                self.bridge_state.setText("Receiving aim frames from the userscript.")
            elif snap["cdp"]:
                self._set_chip("CDP ONLY", "warn")
                self.bridge_state.setText("CDP is connected, but no recent aim push arrived.")
            else:
                self._set_chip("WAITING", "idle")
                self.bridge_state.setText("Waiting for the userscript to push frames.")

            cfg = snap["config"]
            self._syncing = True
            try:
                idx = self.method_combo.findData(cfg.get("method") or "auto")
                if idx >= 0 and idx != self.method_combo.currentIndex():
                    self.method_combo.setCurrentIndex(idx)
                want_external = cfg.get("externalAim") is not False
                if self.external_toggle.isChecked() != want_external:
                    self.external_toggle.setChecked(want_external)
                want_scale = max(10, min(400, int(round(float(cfg.get("aimScale") or 1.0) * 100))))
                if self.scale_slider.value() != want_scale:
                    self.scale_slider.setValue(want_scale)
                self.scale_value.setText("%.2f" % (want_scale / 100.0))
                if self.rapid_spin.value() != int(cfg.get("rapidFireDelay") or 55):
                    self.rapid_spin.setValue(int(cfg.get("rapidFireDelay") or 55))
                if self.cooldown_spin.value() != int(cfg.get("triggerbotCooldown") or 120):
                    self.cooldown_spin.setValue(int(cfg.get("triggerbotCooldown") or 120))
                if self.bhop_spin.value() != int(cfg.get("bhopInterval") or 60):
                    self.bhop_spin.setValue(int(cfg.get("bhopInterval") or 60))
            finally:
                self._syncing = False

            lines = read_logs()
            text = "\n".join(lines[-500:])
            if text != self._last_log:
                self._last_log = text
                self.log_view.setPlainText(text)
                self.log_preview.setPlainText("\n".join(lines[-7:]))
                for view in (self.log_view, self.log_preview):
                    bar = view.verticalScrollBar()
                    bar.setValue(bar.maximum())

        def closeEvent(self, event):
            STOP_EVENT.set()
            if AIMER:
                AIMER.release_all()
            emit("engine stopped")
            event.accept()


def start_server(port):
    try:
        srv = ThreadingHTTPServer(("127.0.0.1", port), ConfigHandler)
        threading.Thread(target=srv.serve_forever, daemon=True, name="s1lver-http").start()
        emit("Config server listening on http://127.0.0.1:%d" % port)
        return srv
    except OSError as e:
        emit("Config server unavailable: %s (using push state only)" % e)
        return None


def run_gui(args):
    if not PYSIDE_OK:
        emit("GUI unavailable: %s" % GUI_IMPORT_ERROR)
        return False
    app = QApplication.instance() or QApplication(sys.argv)
    app.setApplicationName(BRAND)
    app.setApplicationDisplayName(BRAND)
    app.setStyle("Fusion")
    font = QFont("Inter")
    font.setPointSize(10)
    app.setFont(font)
    app.setStyleSheet(GUI_QSS)
    win = MainWindow(args)
    win.show()
    if args.gui_selftest:
        QTimer.singleShot(1400, win.close)
    emit("GUI started")
    app.exec()
    STOP_EVENT.set()
    if AIMER:
        try:
            AIMER.release_all()
        except Exception:
            pass
    try:
        sys.stdout.flush()
        sys.stderr.flush()
    except Exception:
        pass
    os._exit(0)


def main():
    global VERBOSE, AIMER
    ap = argparse.ArgumentParser(description="%s external input engine" % BRAND)
    ap.add_argument("--cdp-port", type=int, default=9222)
    ap.add_argument("--config-port", type=int, default=8686)
    ap.add_argument("--method", default=None, help="handler|nudge|cdpInput|uinput|xdotool|ydotool|auto")
    ap.add_argument("--test-uinput", action="store_true", help="write +120 REL_X and exit (checks uinput)")
    ap.add_argument("--verbose", action="store_true")
    ap.add_argument("--gui", action="store_true", help="force the shadcn/ui GUI")
    ap.add_argument("--no-gui", action="store_true", help="force headless mode")
    ap.add_argument("--gui-selftest", action="store_true", help=argparse.SUPPRESS)
    args = ap.parse_args()
    VERBOSE = args.verbose
    STOP_EVENT.clear()

    if args.test_uinput:
        ok, message = uinput_test()
        print("[s1lverback] " + message, flush=True)
        return
    if args.method:
        with CONFIG_LOCK:
            CONFIG["method"] = args.method

    emit("%s v%s — %s" % (BRAND, VERSION, EDITION))
    ok, path = backend_available("uinput")
    emit("uinput: %s" % ("ok · " + path if ok else "no write access to " + path))
    emit("ydotool: %s" % (shutil.which("ydotool") or "not found"))
    emit("xdotool: %s · DISPLAY=%s" % (
        shutil.which("xdotool") or "not found",
        os.environ.get("DISPLAY") or "(none)",
    ))

    start_server(args.config_port)

    cdp = CDP(args.cdp_port)
    AIMER = Aimer(cdp)
    emit("listening for pushes; CDP :%d optional" % args.cdp_port)

    want_gui = args.gui or (not args.no_gui and PYSIDE_OK and (os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY")))
    if want_gui:
        threading.Thread(target=AIMER.loop, daemon=True, name="s1lver-engine").start()
        if run_gui(args):
            return
        emit("GUI failed to start; falling back to headless")
        STOP_EVENT.set()

    STOP_EVENT.clear()
    try:
        AIMER.loop()
    except KeyboardInterrupt:
        STOP_EVENT.set()
        if AIMER:
            AIMER.release_all()
        print("\n[s1lverback] bye", flush=True)


GUI_QSS = """
* { font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif; }
QMainWindow, QWidget#root { background: #09090b; color: #fafafa; }
QFrame#header {
    background: transparent; border: none;
    border-bottom: 1px solid rgba(255,255,255,.1); border-radius: 0;
}
QLabel#logo {
    background: #27272a; color: #fafafa; border: 1px solid rgba(255,255,255,.1);
    border-radius: 8px; font-size: 13px; font-weight: 700;
}
QLabel#brandTitle { color: #fafafa; font-size: 16px; font-weight: 600; }
QLabel#brandSub { color: #a1a1aa; font-size: 10px; font-weight: 500; }
QLabel#chip {
    background: transparent; border: 1px solid rgba(255,255,255,.1); border-radius: 6px;
    padding: 3px 8px; color: #a1a1aa; font-size: 10px; font-weight: 500;
}
QLabel#chip[state="live"] { background: #e4e4e7; color: #18181b; border-color: transparent; }
QLabel#chip[state="warn"] { background: rgba(248,113,113,.1); border-color: rgba(248,113,113,.3); color: #f87171; }
QFrame#nav { background: transparent; border: 1px solid rgba(255,255,255,.1); border-radius: 10px; }
QPushButton#navButton {
    background: transparent; color: #a1a1aa; border: none; border-radius: 6px;
    padding: 7px 10px; text-align: left; font-size: 13px; font-weight: 500;
}
QPushButton#navButton:hover { background: #27272a; color: #fafafa; }
QPushButton#navButton:checked { background: #27272a; color: #fafafa; }
QFrame#card { background: #18181b; border: 1px solid rgba(255,255,255,.1); border-radius: 10px; }
QFrame#metricCard { background: #18181b; border: 1px solid rgba(255,255,255,.1); border-radius: 10px; }
QLabel#sectionTitle { color: #fafafa; font-size: 13px; font-weight: 600; }
QLabel#metricValue { color: #fafafa; font-size: 24px; font-weight: 600; }
QLabel#metricLabel { color: #a1a1aa; font-size: 11px; font-weight: 500; }
QLabel#rowLabel { color: #fafafa; font-size: 13px; }
QLabel#muted { color: #a1a1aa; font-size: 12px; }
QLabel#valuePill {
    color: #fafafa; font-size: 11px; font-weight: 500; background: #27272a;
    border: 1px solid rgba(255,255,255,.1); border-radius: 6px; padding: 1px 6px;
}
QPushButton#primary {
    background: #e4e4e7; color: #18181b; border: 1px solid transparent;
    border-radius: 6px; padding: 6px 12px; font-size: 12px; font-weight: 500;
}
QPushButton#primary:hover { background: #d4d4d8; }
QPushButton#tonal {
    background: #27272a; color: #fafafa; border: 1px solid transparent;
    border-radius: 6px; padding: 6px 12px; font-size: 12px; font-weight: 500;
}
QPushButton#tonal:hover { background: #323237; }
QComboBox {
    background: transparent; color: #fafafa; border: 1px solid rgba(255,255,255,.15);
    border-radius: 6px; padding: 5px 10px; min-width: 180px;
}
QComboBox:hover { border-color: #3f3f46; }
QComboBox::drop-down { border: none; width: 24px; }
QComboBox QAbstractItemView {
    background: #18181b; color: #fafafa; border: 1px solid rgba(255,255,255,.1);
    border-radius: 8px; selection-background-color: #27272a; selection-color: #fafafa;
    padding: 4px;
}
QSlider::groove:horizontal { height: 4px; background: #27272a; border-radius: 999px; }
QSlider::sub-page:horizontal { background: #e4e4e7; border-radius: 999px; }
QSlider::handle:horizontal {
    width: 14px; height: 14px; margin: -5px 0; border-radius: 7px;
    background: #09090b; border: 2px solid #e4e4e7;
}
QSpinBox {
    background: transparent; color: #fafafa; border: 1px solid rgba(255,255,255,.15);
    border-radius: 6px; padding: 5px 10px; min-width: 90px;
}
QSpinBox::up-button, QSpinBox::down-button { width: 0; border: none; }
QPlainTextEdit#log, QPlainTextEdit#logPreview {
    background: #09090b; color: #d4d4d8; border: 1px solid rgba(255,255,255,.1);
    border-radius: 8px; padding: 8px; selection-background-color: #27272a;
    font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace; font-size: 11px;
}
QScrollArea { background: transparent; border: none; }
QScrollArea > QWidget > QWidget { background: transparent; }
QScrollBar:vertical { background: transparent; width: 8px; margin: 2px; }
QScrollBar::handle:vertical { background: #3f3f46; min-height: 24px; border-radius: 4px; }
QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical { height: 0; }
QFrame#bottomBar { background: transparent; }
"""


if __name__ == "__main__":
    main()
