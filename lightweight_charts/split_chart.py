"""
QtSplitChart - A modular split chart widget for PyQt applications.

This class encapsulates all split chart functionality including:
- Focus management with visual border feedback
- Crosshair synchronization between charts
- Deferred data loading pattern
- QWebChannel bridge handling
"""

from typing import Callable, Optional
import pandas as pd
import logging
import os
from pathlib import Path

logger = logging.getLogger("lightweight_charts")

try:
    from PyQt6.QtCore import QTimer, QObject, pyqtSignal
    from PyQt6.QtGui import QColor
except ImportError:
    try:
        from PyQt5.QtCore import QTimer, QObject, pyqtSignal
        from PyQt5.QtGui import QColor
    except ImportError:
        from PySide6.QtCore import QTimer, QObject, Signal as pyqtSignal
        from PySide6.QtGui import QColor

from .widgets import QtChart

# Load split resizer JS module content at import time
_JS_DIR = Path(__file__).parent / 'js'
_SPLIT_RESIZER_JS = ""
try:
    with open(_JS_DIR / 'split_resizer.js', 'r') as f:
        _SPLIT_RESIZER_JS = f.read()
except Exception as e:
    logger.warning(f"[QtSplitChart] Could not load split_resizer.js: {e}")


class QtSplitChart(QObject):
    """
    A split chart widget that manages two synchronized charts (main + sub).
    Handles focus switching, crosshair sync, data loading, and QWebChannel bridge.
    
    Usage:
        split_chart = QtSplitChart(parent=self, toolbox=True)
        split_chart.active_chart_changed.connect(self.on_focus_changed)
        split_chart.ready.connect(self.on_charts_ready)  # For ChartCreator init
        layout.addWidget(split_chart.get_webview())
        
        # Load data (deferred by default)
        split_chart.load_data(0, df_main)
        split_chart.load_data(1, df_sub)
        
        # Update with live tick
        split_chart.update(0, tick_dict)
    """
    
    # Signals
    active_chart_changed = pyqtSignal(int)  # Emitted when focus changes (index 0 or 1)
    ratio_changed = pyqtSignal(float)       # Emitted when split ratio changes
    chart_clicked = pyqtSignal(int, float, float)  # chart_index, time, price
    ready = pyqtSignal()  # Emitted when JS handlers are initialized and charts are ready
    
    def __init__(
        self, 
        parent=None, 
        toolbox: bool = True, 
        split_ratio: float = 0.6,
        background_color: str = "#1e1e1e",
        active_border_color: str = "#3498db",
        active_border_width: int = 2,
        enable_focus_tracking: bool = True
    ):
        """split_ratio
        Initialize a split chart with two synchronized charts.
        
        Args:
            parent: Qt parent widget
            toolbox: Enable drawing toolbox on main chart
            split_ratio: Initial split ratio (0.5 = 50/50)
            background_color: Chart background color
            active_border_color: Border color for active chart
            active_border_width: Border width for active chart in pixels
            enable_focus_tracking: Enable focus tracking between charts (default True)
        """
        super().__init__(parent)
        
        self._parent = parent
        self._toolbox = toolbox

        self._split_ratio = split_ratio
        self._background_color = background_color
        self._active_border_color = active_border_color
        self._active_border_width = active_border_width
        self._enable_focus_tracking = enable_focus_tracking
        
        self._active_index = 0
        self._is_loaded = False
        self._current_view_mode = 'single'  # Track current view mode for persistence
        self._main_chart: Optional[QtChart] = None
        self._sub_chart = None  # This is a subchart, not a full QtChart
        
        # Chart data storage
        self._charts_data = {
            0: {'obj': None, 'df': None, 'symbol': None},
            1: {'obj': None, 'df': None, 'symbol': None}
        }
        
        # Initialize charts
        self._create_charts()
        
    def _create_charts(self):
        """Create the main chart and subchart."""
        # Main chart initialized with 1.0 to default to single mode correctly
        self._main_chart = QtChart(
            widget=self._parent,
            toolbox=self._toolbox,
            inner_width=1.0,
            inner_height=1.0
        )
        self._main_chart.get_webview().page().setBackgroundColor(
            QColor(self._background_color)
        )
        
        self._charts_data[0]['obj'] = self._main_chart
        
        # Create subchart (right side)
        # Note: We init with width=1.0 because we want it to fill its container (div),
        # which we manually resize to 50% in set_view_mode.
        # This prevents double-scaling (0.5 ratio * 0.5 container = 0.25 chart).
        self._sub_chart = self._main_chart.create_subchart(
            width=1.0, 
            height=1.0,
            toolbox=self._toolbox,
            sync=False,  # Disable built-in sync (conflicts with custom coordinate sync)
            sync_crosshairs_only=False
        )
        self._charts_data[1]['obj'] = self._sub_chart
        
        # Style both charts
        self._style_chart(self._main_chart)
        self._style_chart(self._sub_chart)
        
        # Register Python handlers
        self._main_chart.win.handlers['on_active_chart'] = self._on_active_chart
        self._main_chart.win.handlers['on_split_ratio'] = self._on_ratio_changed
        self._main_chart.win.handlers['on_chart_ready'] = self._on_chart_ready
        
        # Use native events.click for focus detection (more reliable than DOM mousedown)
        self._main_chart.events.click += self._on_main_chart_click
        self._sub_chart.events.click += self._on_sub_chart_click
        
        # Inject JS after load (deferred to ensure bridge is ready)
        self._main_chart.get_webview().loadFinished.connect(self._on_load_finished)
        
    def _style_chart(self, chart):
        """Apply common styling to a chart."""
        chart.layout(
            background_color=self._background_color,
            text_color='#d9d9d9',
            font_family='Trebuchet MS',
            font_size=12
        )
        chart.grid(vert_enabled=True, horz_enabled=True)
        chart.candle_style(
            up_color='#089981',
            down_color='#f23645'
        )
        chart.volume_config(up_color='#089981', down_color='#f23645')
        chart.crosshair(
            mode='normal',
            vert_color='#ffffff50',
            horz_color='#ffffff50'
        )
        chart.legend(visible=True, font_size=14)
        # Fix horizontal jitter by enforcing minimum price scale width
        chart.price_scale(minimum_width=75)
        
    def _on_load_finished(self, ok: bool):
        """Called when the webview finishes loading."""
        logger.info(f"[QtSplitChart] _on_load_finished called, ok={ok}, main_chart_id={self._main_chart.id}")
        if not ok:
            print("[QtSplitChart] Warning: Page load failed")
            return
            
        # Inject click handlers and sync logic after a short delay
        # to ensure QWebChannel is fully initialized
        # Increased to 1500ms for safety
        QTimer.singleShot(1500, self._inject_js_handlers)
        
    def _inject_js_handlers(self):
        """Inject JavaScript for focus detection and crosshair sync."""
        if self._is_loaded:
            return
        self._is_loaded = True
        logger.debug("[QtSplitChart] Injecting JS handlers (Final Production)...")
        
        chart0_id = self._charts_data[0]['obj'].id
        chart1_id = self._charts_data[1]['obj'].id
        
        # Use simple string formatting to avoid f-string brace escaping hell
        script = """
            console.log("[QtSplitChart: %s] Pre-IIFE Check - Script injected");
            try {
                (function() {
                    console.log("[QtSplitChart: %s] Script starting...");
                    
                    function setupClickCapture(chartObj, indexStr) {
                        if (!chartObj) return;
                        
                        var target = chartObj.wrapper;
                        // ... rest of function ... 
                        if (!target && chartObj.div) target = chartObj.div;
                        
                        if (!target) {
                            try {
                                // Fallback: try finding by ID directly (stripping window. if needed)
                                 var id = chartObj.id; 
                                 if (id) {
                                     target = document.getElementById(id.replace('window.', ''));
                                 }
                            } catch(e) {}
                        }
                        
                        if (target) {
                            console.log("[QtSplitChart] Attaching mousedown listener to chart " + indexStr);
                            // Use CAPTURE phase (true as 3rd arg) to get clicks BEFORE child elements
                            // This is crucial because the chart canvas might prevent event bubbling
                            target.addEventListener('mousedown', function(e) {
                                 console.log("[QtSplitChart] Mousedown detected on chart " + indexStr);
                                 if (window.pythonObject) {
                                     window.pythonObject.callback('on_active_chart_~_' + indexStr);
                                 } else {
                                     console.log("[QtSplitChart] Error: pythonObject missing!");
                                 }
                            }, true); // CAPTURE PHASE
                            
                            // Also attach contextmenu listener 
                             target.addEventListener('contextmenu', function(e) {
                                 console.log("[QtSplitChart] ContextMenu detected on chart " + indexStr);
                                   if (window.pythonObject) {
                                     window.pythonObject.callback('on_active_chart_~_' + indexStr);
                                 }
                            }, true); // CAPTURE PHASE
                        } else {
                            console.log("[QtSplitChart] Failed to find target for click capture: " + indexStr);
                        }
                    }

                
                function init() {
                    try {
                        console.log("[QtSplitChart: %s] init() called, looking for charts: %s, %s");
                        var c0 = %s;
                        var c1 = %s;
                        
                        console.log("[QtSplitChart: %s] c0 found:", !!c0, "c0.chart:", !!(c0 && c0.chart));
                        console.log("[QtSplitChart: %s] c1 found:", !!c1, "c1.chart:", !!(c1 && c1.chart));
                        
                        if (!c0 || !c0.chart || !c1 || !c1.chart) {
                            console.log("[QtSplitChart: %s] Charts not ready, retrying in 500ms...");
                            setTimeout(init, 500);
                            return;
                        }
                        
                        setupClickCapture(c0, '0');
                        setupClickCapture(c1, '1');
                        
                        
                        // Custom crosshair sync using Coordinate Mapping
                        // This works even for different price scales (Futures vs Options)
                        // by mapping the Y-pixel position to the target price scale.
                        
                        var activeChart = null;
                        
                        if (c0.wrapper) {
                            c0.wrapper.addEventListener('mouseenter', function() { activeChart = c0; });
                        }
                        if (c1.wrapper) {
                            c1.wrapper.addEventListener('mouseenter', function() { activeChart = c1; });
                        }
                        
                        function syncCrosshair(source, target) {
                            source.chart.subscribeCrosshairMove(function(param) {
                                if (activeChart !== source) return;
                                
                                if (!param || !param.time || !param.point) {
                                    target.chart.clearCrosshairPosition();
                                    return;
                                }
                                
                                try {
                                    // Use the Y-coordinate to find equivalent price on target chart
                                    // This syncs the visual position (mouse height) rather than data value
                                    var targetPrice = target.series.coordinateToPrice(param.point.y);
                                    if (targetPrice !== null) {
                                        target.chart.setCrosshairPosition(targetPrice, param.time, target.series);
                                    }
                                } catch(e) {
                                    console.log("[QtSplitChart] Sync error: " + e);
                                }
                            });
                        }
                        
                        syncCrosshair(c0, c1);
                        syncCrosshair(c1, c0);
                        
                        console.log("[QtSplitChart: %s] Custom Coordinate Sync installed");
                        console.log("[QtSplitChart: %s] Init complete");
                        
                        if (window.pythonObject) {
                            window.pythonObject.callback('on_chart_ready');
                        }
                    } catch(e) {
                        console.log("[QtSplitChart: %s] Init error: " + e);
                    }
                }
                
                init();
            })();
            } catch(e) { console.log("Global Script execution error: " + e); }
        """ % (chart0_id, chart0_id, chart0_id, chart0_id, chart1_id, chart0_id, chart1_id, chart0_id, chart0_id, chart0_id, chart0_id, chart0_id, chart0_id)
        
        # Note: split_resizer.js is now loaded via index.html to ensure it's available
        # before any Python-injected scripts run
        
        self._main_chart.run_script(script)
        
        # [FIX] Apply the current view mode once handlers are injected
        # This ensures we respect the mode even if it was set before JS was ready
        QTimer.singleShot(500, lambda: self.set_view_mode(self._current_view_mode))

    def set_view_mode(self, mode: str):
        """
        Set view mode to 'single' or 'split'.
        single: Shows only main chart (100% width)
        split: Shows both charts based on split_ratio
        
        Note: We use resize(width, height) to update the internal scale factors
        so that the library's autosize logic works correctly on window resize.
        
        IMPORTANT: This method is designed to be non-blocking. The main chart
        layout is applied immediately, while sub-chart and resizer initialization
        are deferred to keep the original chart accessible during transition.
        """
        # Track current mode for persistence
        self._current_view_mode = mode
        
        if not self._is_loaded:
            return

        chart0_id = self._main_chart.id
        chart1_id = self._sub_chart.id
        
        width_main = 1.0 if mode == 'single' else self._split_ratio
        width_sub = 0.0 if mode == 'single' else (1.0 - self._split_ratio)
        
        # Determine visibility
        disp_sub = 'none' if mode == 'single' else 'block'
        
        # PHASE 1: Apply MAIN CHART layout immediately (non-blocking for original chart)
        # This ensures the main chart remains accessible while split view initializes
        self._main_chart.run_script(f"""
            (function() {{
                console.log("[QtSplitChart {chart0_id}] set_view_mode PHASE 1 - Main chart layout. Mode: {mode}");
                var c0 = {chart0_id};
                
                if (!c0) {{
                    console.log("[QtSplitChart {chart0_id}] set_view_mode ERROR: c0 missing");
                    return;
                }}
                
                // MAIN CHART (Left) - Apply immediately
                c0.wrapper.style.position = 'absolute';
                c0.wrapper.style.left = '0';
                c0.wrapper.style.top = '0';
                c0.wrapper.style.width = '{width_main * 100}%';
                c0.wrapper.style.height = '100%';
                c0.wrapper.style.boxSizing = 'border-box';
                c0.wrapper.style.padding = '0';
                c0.wrapper.style.margin = '0';
                
                // Reset inner div to fill wrapper
                c0.div.style.boxSizing = 'border-box';
                c0.div.style.width = '100%'; 
                c0.div.style.height = '100%';
                c0.div.style.padding = '0';
                c0.div.style.margin = '0';
            }})();
        """)
        
        # Update main chart internal scale immediately
        self._main_chart.resize(width_main, 1.0)
        
        # PHASE 2: Defer sub-chart layout, resizer init, and other operations
        # This allows the main chart to remain responsive during split transition
        def _deferred_split_init():
            self._main_chart.run_script(f"""
                (function() {{
                    console.log("[QtSplitChart {chart0_id}] set_view_mode PHASE 2 - Sub chart layout");
                    var c0 = {chart0_id};
                    var c1 = {chart1_id};
                    
                    if (!c0 || !c1) {{
                        console.log("[QtSplitChart {chart0_id}] set_view_mode PHASE 2 ERROR: charts missing");
                        return;
                    }}
                    
                    // SUB CHART (Right or Hidden)
                    c1.wrapper.style.display = '{disp_sub}';
                    c1.wrapper.style.position = 'absolute';
                    c1.wrapper.style.left = '{width_main * 100}%';
                    c1.wrapper.style.top = '0';
                    c1.wrapper.style.width = '{width_sub * 100}%';
                    c1.wrapper.style.height = '100%';
                    c1.wrapper.style.boxSizing = 'border-box';
                    c1.wrapper.style.padding = '0';
                    c1.wrapper.style.margin = '0';
                    
                    // Reset inner div to fill wrapper
                    c1.div.style.boxSizing = 'border-box';
                    c1.div.style.width = '100%';
                    c1.div.style.height = '100%';
                    c1.div.style.padding = '0';
                    c1.div.style.margin = '0';
                    
                    // Handle split resizer divider
                    if ('{mode}' === 'split') {{
                        // Initialize or update resizer with retry logic
                        function tryInitResizer(retries) {{
                            if (typeof window.initSplitResizer === 'function') {{
                                if (!window._splitResizer) {{
                                    console.log("[QtSplitChart {chart0_id}] Initializing split resizer");
                                    window._splitResizer = window.initSplitResizer(c0, c1, function(newRatio) {{
                                        console.log("[QtSplitChart {chart0_id}] Ratio changed to:", newRatio);
                                        if (window.pythonObject) {{
                                            window.pythonObject.callback('on_split_ratio_~_' + newRatio.toFixed(4));
                                        }}
                                    }});
                                }} else {{
                                    // Update existing resizer ratio
                                    window._splitResizer.setRatio({self._split_ratio});
                                    window._splitResizer.show();
                                }}
                            }} else if (retries > 0) {{
                                console.log("[QtSplitChart {chart0_id}] initSplitResizer not ready, retrying in 100ms...");
                                setTimeout(function() {{ tryInitResizer(retries - 1); }}, 100);
                            }} else {{
                                console.log("[QtSplitChart {chart0_id}] initSplitResizer not available after retries");
                            }}
                        }}
                        tryInitResizer(10);  // Retry up to 10 times (1 second total)
                    }} else {{
                        // Hide resizer in single mode
                        if (window._splitResizer) {{
                            window._splitResizer.hide();
                        }}
                    }}
                }})();
            """)
            
            # Update sub-chart internal scale
            self._sub_chart.resize(width_sub, 1.0)
            
            # Apply active border
            self._update_active_border()
            
            # Notify that the split chart is fully ready
            self.ready.emit()
        
        # Defer phase 2 to next event loop iteration (0ms timeout)
        # This allows the main chart to paint and become interactive first
        QTimer.singleShot(0, _deferred_split_init)
        

        
    def _on_chart_ready(self, *args):
        """Called from JS when charts are fully initialized."""
        # Force apply current view mode now that JS is ready
        self.set_view_mode(self._current_view_mode)


    def _on_main_chart_click(self, chart, time, price):
        """Handler for clicks on the main chart (index 0)."""
        logger.debug(f"[QtSplitChart] Main chart clicked at time={time}, price={price}")
        self._on_active_chart('0')
        
    def _on_sub_chart_click(self, chart, time, price):
        """Handler for clicks on the sub chart (index 1)."""
        logger.debug(f"[QtSplitChart] Sub chart clicked at time={time}, price={price}")
        self._on_active_chart('1')

        
    def _on_active_chart(self, index_str: str):
        """Handler called from JS when a chart is clicked."""
        logger.info(f"[QtSplitChart] >>> _on_active_chart RAW: '{index_str}'")
        try:
            index = int(index_str)
            # Always update active index and emit signal to ensure UI sync
            # This fixes issues where sidebar/inputs might be out of sync with chart focus
            prev_index = self._active_index
            self._active_index = index
            
            if prev_index != index:
                logger.info(f"[QtSplitChart] Switching focus from {prev_index} to {index}")
                self._update_active_border()
            else:
                logger.debug(f"[QtSplitChart] Focus re-asserted on {index}")
                
            self.active_chart_changed.emit(index)
        except ValueError:
            logger.error(f"[QtSplitChart] Invalid index: {index_str}")
            
    def _on_ratio_changed(self, ratio_str: str):
        """Handler called from JS when split ratio changes via drag."""
        try:
            ratio = float(ratio_str)
            logger.debug(f"[QtSplitChart] Ratio changed to {ratio}")
            self._split_ratio = ratio
            
            # Update internal scale factors for the library's autosize logic
            if self._current_view_mode == 'split':
                self._main_chart.resize(ratio, 1.0)
                self._sub_chart.resize(1.0 - ratio, 1.0)
            
            self.ratio_changed.emit(ratio)
        except ValueError as e:
            logger.error(f"[QtSplitChart] Invalid ratio value: {ratio_str}, error: {e}")
            
    def _update_active_border(self):
        """Update the visual border to show which chart is active."""
        if not self._enable_focus_tracking:
            return  # Skip border updates for read-only panes
        chart0_id = self._charts_data[0]['obj'].id
        chart1_id = self._charts_data[1]['obj'].id
        
        # Border style for active chart
        border_style = f"{self._active_border_width}px solid {self._active_border_color}"
        no_border = "none"
        
        # In single mode, don't show any border (no need to distinguish focus)
        # In split mode, show blue border on focused chart only
        if self._current_view_mode == 'single':
            border0, border1 = no_border, no_border
        elif self._active_index == 0:
            border0, border1 = border_style, no_border
        else:
            border0, border1 = no_border, border_style
            
        # Use simple string formatting to avoid f-string brace escaping issues
        script = """
            (function() {
                function setBorder(chartObj, border) {
                    if (!chartObj) return;
                    
                    var container = chartObj.wrapper;
                    if (!container) container = chartObj.div;
                    
                    if (!container && chartObj.id) {
                         var id = chartObj.id.replace("window.", "");
                         container = document.getElementById(id);
                    }
                    
                    if (container) {
                        // 1. Create or Find Overlay Div
                        // We use a specific class to identify it
                        var overlay = container.querySelector('.active-border-overlay');
                        if (!overlay) {
                             overlay = document.createElement('div');
                             overlay.className = 'active-border-overlay';
                             overlay.style.position = 'absolute';
                             overlay.style.top = '0';
                             overlay.style.left = '0';
                             overlay.style.right = '0';
                             overlay.style.bottom = '0';
                             overlay.style.width = 'auto';
                             overlay.style.height = 'auto';
                             overlay.style.pointerEvents = 'none'; // Critical: click-through
                             overlay.style.boxSizing = 'border-box';
                             overlay.style.zIndex = '999'; // Ensure on top of canvas (which usually has z-index 0 or auto)
                             container.appendChild(overlay);
                        }
                        
                        // 2. Apply Border to Overlay using BOX-SHADOW INSET
                        // This is much more robust against clipping and overlap issues
                        if (border !== 'none') {
                            var parts = border.split(' solid ');
                            var width = parts[0]; 
                            var color = parts[1];
                            overlay.style.boxShadow = "inset 0 0 0 " + width + " " + color;
                            container.style.zIndex = '9999'; // Force active container to very top
                        } else {
                            overlay.style.boxShadow = 'none';
                             container.style.zIndex = 'auto';
                        }
                        
                        // Clear direct border just in case
                        overlay.style.border = 'none';
                        
                        // Clear container border/outline to prevent duplication/clipping issues
                        container.style.border = 'none';
                        container.style.outline = 'none';
                    }
                }
                
                // Keep global reset for safety
                document.body.style.margin = '0';
                document.body.style.padding = '0';
                document.body.style.overflow = 'hidden';
                
                try {
                    setBorder(%s, "%s");
                    setBorder(%s, "%s");
                } catch(e) {
                    console.log("[QtSplitChart] Border update error: " + e);
                }
            })();
        """ % (chart0_id, border0, chart1_id, border1)
        
        self._main_chart.run_script(script)
        
    @property
    def view_mode(self) -> str:
        """Get the current view mode ('single' or 'split')."""
        return self._current_view_mode

    # ============ Public API ============
    
    @property
    def main_chart(self) -> QtChart:
        """Get the main (left) chart widget."""
        return self._main_chart
        
    @property
    def sub_chart(self):
        """Get the subchart (right) widget."""
        return self._sub_chart
        
    @property
    def active_chart(self):
        """Get the currently active chart (the one with focus)."""
        return self._charts_data[self._active_index]['obj']
        
    @property
    def active_index(self) -> int:
        """Get the index of the currently active chart (0 or 1)."""
        return self._active_index
        
    def get_webview(self):
        """Get the QWebEngineView widget for adding to layouts."""
        return self._main_chart.get_webview()
        
    def get_chart(self, index: int):
        """Get chart by index (0 = main, 1 = sub)."""
        if index in self._charts_data:
            return self._charts_data[index]['obj']
        return None
        
    def set_active(self, index: int):
        """Programmatically set which chart is active."""
        if index in (0, 1) and index != self._active_index:
            self._active_index = index
            self._update_active_border()
            self.active_chart_changed.emit(index)
            
    def set_split_ratio(self, ratio: float):
        """
        Change the split ratio between charts.
        Note: This requires recreating charts, so it's expensive.
        """
        if 0.1 <= ratio <= 0.9:
            self._split_ratio = ratio
            # TODO: Implement resize via JS (requires chart.applyOptions)
            
    def load_data(
        self, 
        chart_index: int, 
        df: pd.DataFrame, 
        symbol: str = None,
        deferred: bool = True,
        keep_drawings: bool = True
    ):
        """
        Load data into a chart.
        
        Args:
            chart_index: 0 for main chart, 1 for subchart
            df: DataFrame with OHLCV data (columns: time, open, high, low, close, volume)
            symbol: Symbol name for the chart legend
            deferred: If True, defer loading by 50ms to prevent UI freeze
            keep_drawings: If True, preserve existing drawings
        """
        if chart_index not in self._charts_data:
            logger.error(f"[QtSplitChart] Invalid chart index: {chart_index}")
            return
            
        self._charts_data[chart_index]['df'] = df
        self._charts_data[chart_index]['symbol'] = symbol
        
        def do_load():
            chart = self._charts_data[chart_index]['obj']
            if chart and df is not None and not df.empty:
                # Remove volume column for display if present
                df_display = df.drop(columns=['volume'], errors='ignore')
                chart.set(df_display, keep_drawings=keep_drawings)
                
                if symbol:
                    chart.legend(visible=True, font_size=14)
                    
        if deferred:
            QTimer.singleShot(50, do_load)
        else:
            do_load()
            
    def update(self, chart_index: int, tick: dict):
        """
        Update a chart with a live tick.
        
        Args:
            chart_index: 0 for main chart, 1 for subchart
            tick: Dict with keys: time, open, high, low, close, volume
        """
        if chart_index not in self._charts_data:
            return
            
        chart = self._charts_data[chart_index]['obj']
        if chart:
            try:
                chart.update(tick)
            except Exception as e:
                logger.error(f"[QtSplitChart] Update error: {e}")
                
    def run_script(self, script: str):
        """Run JavaScript on the main chart's webview."""
        if self._main_chart:
            self._main_chart.run_script(script)
            
    def destroy(self):
        """Clean up resources."""
        if self._main_chart:
            self._main_chart.get_webview().deleteLater()
            self._main_chart = None
            self._sub_chart = None

    @property
    def toolbox(self):
        """
        Compatibility property to expose the main chart's toolbox.
        WARNING: Assigning callbacks to this only affects the main chart!
        Use connect_drawing_changed_signal() to affect both charts.
        """
        return self._main_chart.toolbox if self._main_chart else None

    def configure_toolbox_save_under(self, widget):
        """Configure drawing persistence widget for both charts."""
        logger.debug("[QtSplitChart] configure_toolbox_save_under called")
        if self._main_chart and self._main_chart.toolbox:
            logger.debug(f"[QtSplitChart] Configuring Main Chart Toolbox ({self._main_chart.id})")
            self._main_chart.toolbox.save_drawings_under(widget)
        if self._sub_chart and self._sub_chart.toolbox:
            logger.debug(f"[QtSplitChart] Configuring Sub Chart Toolbox ({self._sub_chart.id})")
            self._sub_chart.toolbox.save_drawings_under(widget)
            
    def connect_drawing_changed_signal(self, callback):
        """Connect drawing changed callback for both toolboxes."""
        if self._main_chart and self._main_chart.toolbox:
            self._main_chart.toolbox.on_drawing_changed = callback
        if self._sub_chart and self._sub_chart.toolbox:
            self._sub_chart.toolbox.on_drawing_changed = callback
