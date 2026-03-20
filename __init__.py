import os
from aqt import gui_hooks
from aqt.editor import Editor

# Get the path to logic.js in the current addon folder
ADDON_PATH = os.path.dirname(__file__)
JS_FILE_PATH = os.path.join(ADDON_PATH, "logic.js")

def run_custom_js(editor: Editor):
    try:
        # This reads the JS file fresh every time you press the shortcut
        with open(JS_FILE_PATH, "r", encoding="utf-8") as f:
            js_code = f.read()
        
        # Execute it in the editor's web context
        editor.web.eval(js_code)
    except Exception as e:
        print(f"Error reading JS file: {e}")

def on_setup_shortcuts(shortcuts: list[tuple], editor: Editor):
    # CHANGED SHORTCUT TO Alt+Shift+Q
    shortcuts.append(("Alt+Shift+Q", lambda: run_custom_js(editor)))

gui_hooks.editor_did_init_shortcuts.append(on_setup_shortcuts)