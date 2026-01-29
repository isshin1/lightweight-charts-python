import asyncio
import html

from .util import parse_event_message
from lightweight_charts import abstract

try:
    import wx.html2
except ImportError:
    wx = None

try:
    using_pyside6 = False
    from PyQt5.QtWebEngineWidgets import QWebEngineView
    from PyQt5.QtWebChannel import QWebChannel
    from PyQt5.QtCore import QObject, pyqtSlot as Slot, QUrl, QTimer
except ImportError:
    using_pyside6 = True
    try:
        from PySide6.QtWebEngineWidgets import QWebEngineView
        from PySide6.QtWebChannel import QWebChannel
        from PySide6.QtCore import Qt, QObject, Slot, QUrl, QTimer
    except ImportError:
        try:
            using_pyside6 = False
            from PyQt6.QtWebEngineWidgets import QWebEngineView
            from PyQt6.QtWebChannel import QWebChannel
            from PyQt6.QtCore import QObject, pyqtSlot as Slot, QUrl, QTimer
        except ImportError:
            QWebEngineView = None

if QWebEngineView:
    try:
        from PyQt6.QtWebEngineCore import QWebEnginePage
        class ConsoleLoggingPage(QWebEnginePage):
             def javaScriptConsoleMessage(self, level, message, lineNumber, sourceID):
                 if "Chart Created true" in message:
                      pass
                      
                 # Map JS levels: 0=Info, 1=Warning, 2=Error
                 if level == 0:
                     logger.info(f"[JS] {message} (Line {lineNumber})")
                 elif level == 1:
                     logger.warning(f"[JS] {message} (Line {lineNumber})")
                 elif level == 2:
                     logger.error(f"[JS] {message} (Line {lineNumber})")
                 else:
                     logger.debug(f"[JS] {message} (Line {lineNumber})")
    except ImportError:
         pass
         
    class Bridge(QObject):
        def __init__(self, chart):
            super().__init__()
            self.win = chart.win

        @Slot(str)
        def callback(self, message):
            emit_callback(self.win, message)

try:
    from streamlit.components.v1 import html as sthtml
except ImportError:
    sthtml = None

import logging
logger = logging.getLogger("lightweight_charts")

try:
    from IPython.display import HTML, display
    import warnings
    warnings.filterwarnings("ignore", category=UserWarning, module="IPython.core.display")
except ImportError:
    HTML = None


def emit_callback(window, string):
    try:
        func, args = parse_event_message(window, string)
        # logger.debug(f"emit_callback: name={string.split('_~_')[0]}, args={args}")
        asyncio.create_task(func(*args)) if asyncio.iscoroutinefunction(func) else func(*args)
    except KeyError as e:
        logger.error(f"emit_callback: Handler not found for key: {e}")
        logger.error(f"  Message was: {string}")
        logger.error(f"  Available handlers: {list(window.handlers.keys())}")
    except Exception as e:
        logger.error(f"emit_callback exception: {e}")
        import traceback
        logger.error(traceback.format_exc())


class WxChart(abstract.AbstractChart):
    def __init__(self, parent, inner_width: float = 1.0, inner_height: float = 1.0,
                 scale_candles_only: bool = False, toolbox: bool = False):
        if wx is None:
            raise ModuleNotFoundError('wx.html2 was not found, and must be installed to use WxChart.')
        self.webview: wx.html2.WebView = wx.html2.WebView.New(parent)
        super().__init__(abstract.Window(self.webview.RunScript, 'window.wx_msg.postMessage.bind(window.wx_msg)'),
                         inner_width, inner_height, scale_candles_only, toolbox)

        self.webview.Bind(wx.html2.EVT_WEBVIEW_LOADED, lambda e: wx.CallLater(500, self.win.on_js_load))
        self.webview.Bind(wx.html2.EVT_WEBVIEW_SCRIPT_MESSAGE_RECEIVED, lambda e: emit_callback(self.win, e.GetString()))
        self.webview.AddScriptMessageHandler('wx_msg')

        self.webview.LoadURL("file://"+abstract.INDEX)

    def get_webview(self):
        return self.webview


class QtChart(abstract.AbstractChart):
    def __init__(self, widget=None, inner_width: float = 1.0, inner_height: float = 1.0,
                 scale_candles_only: bool = False, toolbox: bool = False):
        if QWebEngineView is None:
            raise ModuleNotFoundError('QWebEngineView was not found, and must be installed to use QtChart.')
        self.webview = QWebEngineView(widget)
        try:
            self.webview.setPage(ConsoleLoggingPage(self.webview))
        except NameError:
            pass # ConsoleLoggingPage not defined (older Qt or import failure)
            
        super().__init__(abstract.Window(self.webview.page().runJavaScript, 'window.pythonObject.callback'),
                         inner_width, inner_height, scale_candles_only, toolbox)

        self.web_channel = QWebChannel()
        self.bridge = Bridge(self)
        self.web_channel.registerObject('bridge', self.bridge)
        self.webview.page().setWebChannel(self.web_channel)
        self.webview.loadFinished.connect(lambda: self.webview.page().runJavaScript('''
            let scriptElement = document.createElement("script")
            scriptElement.src = 'qrc:///qtwebchannel/qwebchannel.js'

            scriptElement.onload = function() {
                var bridge = new QWebChannel(qt.webChannelTransport, function(channel) {
                    var pythonObject = channel.objects.bridge
                    window.pythonObject = pythonObject
                })
            }

            document.head.appendChild(scriptElement)

        '''))
        self.webview.loadFinished.connect(lambda: QTimer.singleShot(2000, self.win.on_js_load))
        if using_pyside6:
            self.webview.setContextMenuPolicy(Qt.ContextMenuPolicy.NoContextMenu)
        
        # Load toolbox order and inject it into the HTML before loading
        toolbox_order_script = self._get_toolbox_order_script()
        if toolbox_order_script:
            # Use a modified HTML that includes the toolbox order
            self._load_with_toolbox_order(toolbox_order_script)
        else:
            self.webview.load(QUrl.fromLocalFile(abstract.INDEX))
        
        # Register handler for saving toolbox order
        self.win.handlers["save_toolbox_order"] = self.on_save_toolbox_order

    def _get_toolbox_order_script(self):
        """Load toolbox order from file and return JS script to set it."""
        import json
        import os
        try:
            config_path = os.path.join(os.getcwd(), 'toolbox_order.json')
            if os.path.exists(config_path):
                with open(config_path, 'r') as f:
                    order_json = f.read().strip()
                if order_json:
                    return f"window.TOOLBOX_ORDER = {order_json};"
        except Exception as e:
            logger.error(f"Failed to load toolbox order: {e}")
        return None

    def _load_with_toolbox_order(self, toolbox_order_script):
        """Load the HTML page with toolbox order script injected before bundle.js."""
        import tempfile
        import os
        
        try:
            with open(abstract.INDEX, 'r') as f:
                html_content = f.read()
            
            # Inject the toolbox order script before bundle.js
            injection_point = '<script src="./bundle.js'
            if injection_point in html_content:
                inject_script = f"<script>{toolbox_order_script}</script>\n    {injection_point}"
                html_content = html_content.replace(injection_point, inject_script)
            
            # Write to a temp file in the same directory (for relative paths to work)
            index_dir = os.path.dirname(abstract.INDEX)
            temp_path = os.path.join(index_dir, 'index_with_order.html')
            with open(temp_path, 'w') as f:
                f.write(html_content)
            
            self.webview.load(QUrl.fromLocalFile(temp_path))
        except Exception as e:
            logger.error(f"Failed to inject toolbox order: {e}")
            self.webview.load(QUrl.fromLocalFile(abstract.INDEX))

    def on_save_toolbox_order(self, order_json):
        import json
        import os
        try:
            config_path = os.path.join(os.getcwd(), 'toolbox_order.json')
            with open(config_path, 'w') as f:
                f.write(order_json)
            logger.info(f"Toolbox order saved to {config_path}")
        except Exception as e:
            logger.error(f"Failed to save toolbox order: {e}")


    def get_webview(self): return self.webview


class StaticLWC(abstract.AbstractChart):
    def __init__(self, width=None, height=None, inner_width=1, inner_height=1,
                 scale_candles_only: bool = False, toolbox=False, autosize=True):

        with open(abstract.INDEX.replace("index.html", 'styles.css'), 'r') as f:
            css = f.read()
        with open(abstract.INDEX.replace("index.html", 'bundle.js'), 'r') as f:
            js = f.read()
        with open(abstract.INDEX.replace("index.html", 'lightweight-charts.js'), 'r') as f:
            lwc = f.read()
        
        # Load chart stabilizer module
        stabilizer_path = abstract.INDEX.replace("index.html", 'chart_stabilizer.js')
        try:
            with open(stabilizer_path, 'r') as f:
                stabilizer_js = f.read()
        except FileNotFoundError:
            stabilizer_js = ""  # If not found, skip

        # Load arrow marker module
        arrow_marker_path = abstract.INDEX.replace("index.html", 'arrow_marker.js')
        try:
            with open(arrow_marker_path, 'r') as f:
                arrow_marker_js = f.read()
        except FileNotFoundError:
            arrow_marker_js = ""  # If not found, skip



        # Load saved toolbox order
        import json
        import os
        toolbox_order_script = ""
        try:
            config_path = os.path.join(os.getcwd(), 'toolbox_order.json')
            if os.path.exists(config_path):
                with open(config_path, 'r') as f:
                    order = f.read().strip()
                    if order:
                        toolbox_order_script = f"window.TOOLBOX_ORDER = {order};"
        except Exception as e:
            logger.error(f"Failed to load toolbox order: {e}")

        with open(abstract.INDEX, 'r') as f:
            self._html = f.read() \
                .replace('<link rel="stylesheet" href="styles.css">', f"<style>{css}</style>") \
                .replace(' src="./lightweight-charts.js">', f'>{lwc}') \
                .replace(' src="./chart_stabilizer.js">', f'>{stabilizer_js}') \
                .replace(' src="./bundle.js">', f'>{js}') \
                .replace(' src="./arrow_marker.js">', f'>{arrow_marker_js}') \
                .replace('</body>\n</html>', f'<script>{toolbox_order_script}</script>')

        super().__init__(abstract.Window(run_script=self.run_script), inner_width, inner_height,
                         scale_candles_only, toolbox, autosize)
        
        # Register handler
        self.win.handlers["save_toolbox_order"] = self.on_save_toolbox_order
        self.width = width
        self.height = height

    def run_script(self, script, run_last=False):
        if run_last:
            self.win.final_scripts.append(script)
        else:
            self._html += '\n' + script

    def load(self):
        if self.win.loaded:
            return
        self.win.loaded = True
        for script in self.win.final_scripts:
            self._html += '\n' + script
        self._load()


    def _load(self): pass

    def on_save_toolbox_order(self, order_json):
        import json
        import os
        try:
            # Save to a file in the temp or user config dir
            # For simplicity, saving to a local file 'toolbox_order.json'
            # In a real app, this should go to a proper config location
            config_path = os.path.join(os.getcwd(), 'toolbox_order.json')
            with open(config_path, 'w') as f:
                f.write(order_json)
            logger.info(f"Toolbox order saved to {config_path}")
        except Exception as e:
            logger.error(f"Failed to save toolbox order: {e}")


class StreamlitChart(StaticLWC):
    def __init__(self, width=None, height=None, inner_width=1, inner_height=1, scale_candles_only: bool = False, toolbox: bool = False):
        super().__init__(width, height, inner_width, inner_height, scale_candles_only, toolbox)

    def _load(self):
        if sthtml is None:
            raise ModuleNotFoundError('streamlit.components.v1.html was not found, and must be installed to use StreamlitChart.')
        sthtml(f'{self._html}</script></body></html>', width=self.width, height=self.height)


class JupyterChart(StaticLWC):
    def __init__(self, width: int = 800, height=350, inner_width=1, inner_height=1, scale_candles_only: bool = False, toolbox: bool = False):
        super().__init__(width, height, inner_width, inner_height, scale_candles_only, toolbox, False)

        self.run_script(f'''
            for (var i = 0; i < document.getElementsByClassName("tv-lightweight-charts").length; i++) {{
                    var element = document.getElementsByClassName("tv-lightweight-charts")[i];
                    element.style.overflow = "visible"
                }}
            document.getElementById('container').style.overflow = 'hidden'
            document.getElementById('container').style.borderRadius = '10px'
            document.getElementById('container').style.width = '{self.width}px'
            document.getElementById('container').style.height = '100%'
            ''')
        self.run_script(f'{self.id}.chart.resize({width * inner_width}, {height * inner_height})')

    def _load(self):
        if HTML is None:
            raise ModuleNotFoundError('IPython.display.HTML was not found, and must be installed to use JupyterChart.')
        html_code = html.escape(f"{self._html}</script></body></html>")
        iframe = f'<iframe width="{self.width}" height="{self.height}" frameBorder="0" srcdoc="{html_code}"></iframe>'
        display(HTML(iframe))
