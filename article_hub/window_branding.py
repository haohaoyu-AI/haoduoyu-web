"""为本系统的 Edge 应用窗口设置独立任务栏身份和图标。"""
from __future__ import annotations

import ctypes as c
from ctypes import wintypes as w
import os
from pathlib import Path
import sys
import threading
import time
import uuid

APP_ID = "Haoduoyu.ArticleStudio"
TITLE = "好多鱼自媒体图文管理系统"


def _apply(hwnd, icon_path):
    user = c.windll.user32
    user.LoadImageW.argtypes = [w.HINSTANCE, w.LPCWSTR, w.UINT, c.c_int, c.c_int, w.UINT]
    user.LoadImageW.restype = w.HANDLE
    user.SendMessageW.argtypes = [w.HWND, w.UINT, w.WPARAM, w.LPARAM]
    user.SendMessageW.restype = w.LPARAM
    # LR_SHARED keeps these handles valid after the launcher exits.
    for kind, size in [(0, 16), (1, 48)]:
        icon = user.LoadImageW(None, str(icon_path), 1, size, size, 0x10 | 0x8000)
        if icon:
            user.SendMessageW(hwnd, 0x80, kind, icon)

    class GUID(c.Structure):
        _fields_ = [("raw", c.c_ubyte * 16)]

    def guid(value):
        return GUID((c.c_ubyte * 16).from_buffer_copy(uuid.UUID(value).bytes_le))

    class KEY(c.Structure):
        _fields_ = [("fmtid", GUID), ("pid", w.DWORD)]

    class VALUE(c.Structure):
        _fields_ = [("vt", w.WORD), ("reserved", w.WORD * 3),
                    ("text", c.c_void_p), ("padding", c.c_void_p)]

    store = c.c_void_p()
    iid = guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99")
    shell = c.windll.shell32
    shell.SHGetPropertyStoreForWindow.argtypes = [w.HWND, c.POINTER(GUID), c.POINTER(c.c_void_p)]
    shell.SHGetPropertyStoreForWindow.restype = c.c_long
    if shell.SHGetPropertyStoreForWindow(hwnd, c.byref(iid), c.byref(store)) < 0:
        return
    table = c.cast(store, c.POINTER(c.POINTER(c.c_void_p))).contents
    set_value = c.WINFUNCTYPE(c.c_long, c.c_void_p, c.POINTER(KEY), c.POINTER(VALUE))(table[6])
    release = c.WINFUNCTYPE(w.ULONG, c.c_void_p)(table[2])
    root = icon_path.parents[2]
    pythonw = Path(sys.executable).with_name("pythonw.exe")
    properties = {4: TITLE, 3: str(icon_path) + ",0",
                  2: f'"{pythonw}" -X utf8 "{root / "好多鱼.pyw"}"', 5: APP_ID}
    try:
        for pid, text in properties.items():
            buffer = c.create_unicode_buffer(text)
            value = VALUE(31, (w.WORD * 3)(), c.cast(buffer, c.c_void_p), None)
            key = KEY(guid("9f4c2855-9f79-4b39-a8d0-e1d42de1d5f3"), pid)
            hr = set_value(store, c.byref(key), c.byref(value))
            if hr < 0:
                raise OSError(f"窗口属性设置失败：{hr}")
    finally:
        release(store)


def apply_window_branding(icon_path: Path) -> int:
    if os.name != "nt":
        return 0
    user = c.windll.user32
    user.GetWindowTextW.argtypes = [w.HWND, w.LPWSTR, c.c_int]
    user.GetClassNameW.argtypes = [w.HWND, w.LPWSTR, c.c_int]
    user.IsWindowVisible.argtypes = [w.HWND]
    callback_type = c.WINFUNCTYPE(w.BOOL, w.HWND, w.LPARAM)
    count = 0
    errors = []

    @callback_type
    def visit(hwnd, _):
        nonlocal count
        title = c.create_unicode_buffer(512)
        cls = c.create_unicode_buffer(128)
        user.GetWindowTextW(hwnd, title, 512)
        user.GetClassNameW(hwnd, cls, 128)
        # Regular browser windows append a browser name to their title.
        if title.value == TITLE and cls.value == "Chrome_WidgetWin_1" and user.IsWindowVisible(hwnd):
            try:
                _apply(hwnd, icon_path)
                count += 1
            except Exception as exc:
                errors.append(exc)
        return True

    user.EnumWindows.argtypes = [callback_type, w.LPARAM]
    c.windll.ole32.CoInitialize(None)
    try:
        user.EnumWindows(visit, 0)
        if errors:
            raise errors[0]
    finally:
        c.windll.ole32.CoUninitialize()
    return count


def brand_after_launch(icon_path: Path) -> None:
    def worker():
        # Chromium creates the window asynchronously and can reset its icon on load.
        for _ in range(20):
            try:
                apply_window_branding(icon_path)
            except Exception as exc:
                print(f"窗口图标更新失败：{exc}")
                return
            time.sleep(1)
    if os.name == "nt":
        threading.Thread(target=worker, name="window-branding", daemon=False).start()
