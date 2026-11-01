# -*- coding: utf-8 -*-
"""P2 全局框架与导航：导航顺序、面板、确认/撤销、保存指示、主题、快捷键。"""
import os
import re
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import BASE_DIR, node_test  # noqa: E402

JS = os.path.join(BASE_DIR, "static", "js")
CSS = os.path.join(BASE_DIR, "static", "css")


def read(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


class P2GlobalTest(unittest.TestCase):
    def test_nav_groups_order_and_nine_items(self):
        source = read(os.path.join(JS, "main.js"))
        self.assertIn("总览", source)
        self.assertIn("工作", source)
        self.assertIn("生活", source)
        self.assertIn("系统", source)
        group = re.search(r"const NAV_GROUPS = \[(.*?)\];", source, re.S)
        self.assertIsNotNone(group)
        block = group.group(1)
        positions = {key: block.find("'%s'" % key) for key in
                     ["home", "today", "selfmedia", "dev", "consult", "fitness", "diet", "game", "settings"]}
        for key, pos in positions.items():
            self.assertGreaterEqual(pos, 0, "导航缺少 %s" % key)
        self.assertEqual(sorted(positions.values()), list(positions.values()))
        self.assertGreater(block.find("'settings'"), block.find("'game'"), "设置必须置底")
        self.assertIn("active", source)
        self.assertIn("hidden.indexOf(key)", source)

    def test_narrow_drawer_css(self):
        css = read(os.path.join(CSS, "layout.css"))
        self.assertIn("@media (max-width: 719px)", css)
        self.assertIn(".nav.open", css)
        self.assertIn('id="nav-toggle"', read(os.path.join(BASE_DIR, "static", "index.html")))

    def test_panel_width_and_no_nesting(self):
        source = read(os.path.join(JS, "ui", "panel.js"))
        self.assertIn("if (current) return null", source)
        self.assertIn("w50", source)
        self.assertIn("w40", source)
        self.assertIn("Escape", source)
        self.assertIn("mask.addEventListener('click', close)", source)
        self.assertIn("markSaved", source)
        css = read(os.path.join(CSS, "components.css"))
        self.assertIn(".side-panel.w40", css)
        self.assertIn(".side-panel.w50", css)

    def test_confirm_requires_text(self):
        source = read(os.path.join(JS, "ui", "dialog.js"))
        self.assertIn("requireText", source)
        self.assertIn("okBtn.disabled = input.value.trim() !== options.requireText", source)

    def test_undo_default_five_seconds(self):
        source = read(os.path.join(JS, "ui", "undo.js"))
        self.assertIn("options.seconds == null ? 5 : options.seconds", source)
        self.assertIn("seconds * 1000", source)
        self.assertIn("onCommit", source)
        self.assertIn("onUndo", source)
        css = read(os.path.join(CSS, "components.css"))
        self.assertIn(".undo-bar", css)

    def test_saved_indicator_and_error_banner_wired(self):
        main = read(os.path.join(JS, "main.js"))
        self.assertIn("store.onSaved((clock) => panel.markSaved(clock))", main)
        self.assertIn("store.onError((message) => toast.error(message))", main)
        self.assertIn("已保存", read(os.path.join(JS, "ui", "panel.js")))
        self.assertIn("保存失败", read(os.path.join(JS, "ui", "toast.js")))

    def test_double_theme_variables(self):
        css = read(os.path.join(CSS, "base.css"))
        self.assertIn("body[data-theme=\"dark\"]", css)
        self.assertIn("--bg", css)
        self.assertIn("--text", css)
        self.assertIn("--accent", css)
        self.assertIn("color-scheme: dark", css)

    def test_theme_set_immediate(self):
        store = read(os.path.join(JS, "store.js"))
        self.assertIn("applyTheme", store)
        self.assertIn("document.body.dataset.theme", store)
        self.assertIn("setTheme(theme)", store)

    def test_toolbar_and_empty_state(self):
        css = read(os.path.join(CSS, "components.css"))
        self.assertIn(".toolbar", css)
        self.assertIn(".empty-state", css)
        common = read(os.path.join(JS, "ui", "common.js"))
        self.assertIn("export function emptyState", common)
        self.assertIn("export function pageHead", common)

    def test_n_shortcut_ignores_inputs(self):
        main = read(os.path.join(JS, "main.js"))
        self.assertIn("event.key === 'n'", main)
        self.assertIn("INPUT", main)
        self.assertIn("TEXTAREA", main)
        self.assertIn("activeView.newItem", main)

    def test_store_debounce_defaults(self):
        store = read(os.path.join(JS, "store.js"))
        self.assertIn("options.shortDelay || 300", store)
        self.assertIn("options.longDelay || 1000", store)
        self.assertIn("beforeunload", read(os.path.join(JS, "main.js")))
        self.assertIn("sendBeacon", read(os.path.join(JS, "main.js")))

    def test_store_node_suite(self):
        code, output = node_test("tests/js/store.test.mjs")
        self.assertEqual(code, 0, output)


if __name__ == "__main__":
    unittest.main(verbosity=2)
