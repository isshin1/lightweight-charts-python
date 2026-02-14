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
    view_mode_changed = pyqtSignal(str)     # Emitted from context menu: 'right', 'down', or 'single'
    
    def __init__(
        self, 
        parent=None, 
        toolbox: bool = True, 
        split_ratio: float = 0.5,
        background_color: str = "#1e1e1e",
        active_border_color: str = "#3498db",
        active_border_width: int = 1,
        enable_focus_tracking: bool = True
    ):
        """
        Initialize a split chart with support for up to 4 charts in a 2x2 grid.
        
        All 4 charts are pre-created (hidden) for simpler show/hide logic.
        
        Grid positions:
        - charts[0] = [0,0] Top-left (primary, always visible)
        - charts[1] = [0,1] Top-right
        - charts[2] = [1,0] Bottom-left
        - charts[3] = [1,1] Bottom-right
        
        Args:
            parent: Qt parent widget
            toolbox: Enable drawing toolbox on charts
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
        self._h_ratio = split_ratio  # Horizontal split ratio
        self._v_ratio = 0.5  # Vertical split ratio
        self._background_color = background_color
        self._active_border_color = active_border_color
        self._active_border_width = active_border_width
        self._enable_focus_tracking = enable_focus_tracking
        
        self._active_index = 0
        self._is_loaded = False
        self._sync_enabled = True  # Crosshair sync between split charts
        self._current_view_mode = 'single'  # 'single', 'split', 'split_down', 'grid'
        
        # Pre-created charts list (4 charts for 2x2 grid)
        # Index mapping: 0=[0,0], 1=[0,1], 2=[1,0], 3=[1,1]
        self._charts = []
        
        # Set of visible chart indices
        self._visible_indices = {0}  # Only primary visible at start
        
        # Legacy references for backward compatibility
        self._main_chart: Optional[QtChart] = None
        self._sub_chart = None
        
        # Chart data storage (keyed by index 0-3)
        self._charts_data = {}
        
        # Grid reference (for compatibility with existing code)
        self._grid = [[None, None], [None, None]]
        
        # Initialize all 4 charts
        self._create_all_charts()
        
    def _create_all_charts(self):
        """Create all 4 charts for the 2x2 grid (hidden except primary).
        
        Index mapping:
        - 0 = [0,0] Top-left (primary, always visible)
        - 1 = [0,1] Top-right  
        - 2 = [1,0] Bottom-left
        - 3 = [1,1] Bottom-right
        """
        # Create primary chart (index 0)
        self._main_chart = QtChart(
            widget=self._parent,
            toolbox=self._toolbox,
            inner_width=1.0,
            inner_height=1.0
        )
        self._main_chart.get_webview().page().setBackgroundColor(
            QColor(self._background_color)
        )
        self._charts.append(self._main_chart)
        self._charts_data[0] = {'obj': self._main_chart, 'df': None, 'symbol': None}
        self._grid[0][0] = self._main_chart
        self._style_chart(self._main_chart)
        
        # Register handlers on primary chart
        self._main_chart.win.handlers['on_active_chart'] = self._on_active_chart
        self._main_chart.win.handlers['on_split_ratio'] = self._on_ratio_changed
        self._main_chart.win.handlers['on_chart_ready'] = self._on_chart_ready
        self._main_chart.events.click += lambda chart, t, p: self._on_chart_click_simple(0)
        
        # Grid layout:
        # [0,0] = charts[0] (main) | [0,1] = charts[1] (right)
        # [1,0] = charts[2] (below)| [1,1] = charts[3] (bottom-right)
        
        # Chart[1]: Right of main chart (horizontal split)
        sub1 = self._main_chart.create_subchart(
            position='right',  # Right side of main chart
            width=0.5,  # Half width
            height=1.0,
            toolbox=self._toolbox,
            sync=True,
            sync_crosshairs_only=True
        )
        self._charts.append(sub1)
        self._charts_data[1] = {'obj': sub1, 'df': None, 'symbol': None}
        self._style_chart(sub1)
        sub1.events.click += lambda chart, t, p: self._on_chart_click_simple(1)
        
        # Chart[2]: Below main chart (vertical split)
        sub2 = self._main_chart.create_subchart(
            position='left',  # Left position but at bottom
            width=1.0,  # Full width
            height=0.5,  # Half height
            toolbox=self._toolbox,
            sync=True,
            sync_crosshairs_only=True
        )
        self._charts.append(sub2)
        self._charts_data[2] = {'obj': sub2, 'df': None, 'symbol': None}
        self._style_chart(sub2)
        sub2.events.click += lambda chart, t, p: self._on_chart_click_simple(2)
        
        # Chart[3]: Bottom-right (for grid mode)
        sub3 = self._main_chart.create_subchart(
            position='right',  # Right side
            width=0.5,
            height=0.5,
            toolbox=self._toolbox,
            sync=True,
            sync_crosshairs_only=True
        )
        self._charts.append(sub3)
        self._charts_data[3] = {'obj': sub3, 'df': None, 'symbol': None}
        self._style_chart(sub3)
        sub3.events.click += lambda chart, t, p: self._on_chart_click_simple(3)
            
        # Set grid references
        self._grid[0][1] = self._charts[1]
        self._grid[1][0] = self._charts[2]
        self._grid[1][1] = self._charts[3]
        
        # Legacy sub_chart reference
        self._sub_chart = self._charts[1]
        
        # Inject JS after load
        self._main_chart.get_webview().loadFinished.connect(self._on_load_finished)
        
        logger.info(f"[QtSplitChart] Created 4 charts: {[c.id for c in self._charts]}")
        
    def _on_chart_click_simple(self, idx: int):
        """Simple click handler for chart focus tracking."""
        self._on_active_chart(str(idx))
        
    def _create_chart_at(self, row: int, col: int):
        """Create a chart at the specified grid position.
        
        Args:
            row: Grid row (0 or 1)
            col: Grid column (0 or 1)
            
        Returns:
            The created chart object, or None if position is invalid/occupied
        """
        if row < 0 or row > 1 or col < 0 or col > 1:
            logger.error(f"[QtSplitChart] Invalid grid position: [{row},{col}]")
            return None
            
        if self._grid[row][col] is not None:
            logger.warning(f"[QtSplitChart] Position [{row},{col}] already occupied")
            return self._grid[row][col]
        
        # Create subchart from the main chart
        new_chart = self._main_chart.create_subchart(
            width=1.0,
            height=1.0,
            toolbox=self._toolbox,
            sync=False,
            sync_crosshairs_only=False
        )
        
        # Store in grid and data
        self._grid[row][col] = new_chart
        pos_key = f"{row},{col}"
        self._charts_data[pos_key] = {'obj': new_chart, 'df': None, 'symbol': None}
        
        # Legacy compatibility for position [0,1]
        if row == 0 and col == 1:
            self._sub_chart = new_chart
            self._charts_data[1] = self._charts_data[pos_key]
        
        # Style the chart
        self._style_chart(new_chart)
        
        # Add click handler
        new_chart.events.click += lambda chart, t, p: self._on_chart_click(row, col, t, p)
        
        logger.info(f"[QtSplitChart] Created chart at [{row},{col}], id={new_chart.id}")
        return new_chart
        
    def _on_chart_click(self, row: int, col: int, time, price):
        """Handler for clicks on any chart in the grid."""
        logger.debug(f"[QtSplitChart] Chart [{row},{col}] clicked at time={time}, price={price}")
        # Convert grid position to linear index for legacy compatibility
        linear_index = row * 2 + col
        self._on_active_chart(str(linear_index))
        
    def _get_active_cells(self):
        """Get list of active (non-empty) grid cells.
        
        Returns:
            List of (row, col) tuples for occupied cells
        """
        active = []
        for row in range(2):
            for col in range(2):
                if self._grid[row][col] is not None:
                    active.append((row, col))
        return active
        
    def split_chart_at(self, source_row: int, source_col: int, direction: str):
        """Split a chart at the specified position in the given direction.
        
        Args:
            source_row: Row of the chart to split
            source_col: Column of the chart to split
            direction: 'right' or 'down'
            
        Returns:
            The newly created chart, or None if split failed
        """
        if self._grid[source_row][source_col] is None:
            logger.error(f"[QtSplitChart] No chart at [{source_row},{source_col}] to split")
            return None
            
        active_cells = self._get_active_cells()
        active_count = len(active_cells)
        
        # Determine target position based on direction and current layout
        if direction == 'right':
            target_col = source_col + 1
            if target_col > 1:
                logger.warning(f"[QtSplitChart] Cannot split right from col {source_col}")
                return None
            # For right split, keep same row
            target_row = source_row
        elif direction == 'down':
            target_row = source_row + 1
            if target_row > 1:
                logger.warning(f"[QtSplitChart] Cannot split down from row {source_row}")
                return None
            # For down split, keep same column
            target_col = source_col
        else:
            logger.error(f"[QtSplitChart] Unknown direction: {direction}")
            return None
            
        # Check if target position is available
        if self._grid[target_row][target_col] is not None:
            logger.warning(f"[QtSplitChart] Position [{target_row},{target_col}] already occupied")
            return None
            
        # Create chart at target position
        new_chart = self._create_chart_at(target_row, target_col)
        if not new_chart:
            return None
            
        # Update layout mode based on new configuration
        new_active_count = len(self._get_active_cells())
        if new_active_count == 2:
            # Determine if horizontal or vertical split
            if target_col != source_col:
                self._current_view_mode = 'split'
            else:
                self._current_view_mode = 'split_down'
        elif new_active_count >= 3:
            self._current_view_mode = 'grid'
            
        # Update the grid layout
        self._update_grid_layout()
        
        # Emit signal for mainwindow to load data
        self.view_mode_changed.emit(direction)
        
        logger.info(f"[QtSplitChart] Split from [{source_row},{source_col}] {direction} to [{target_row},{target_col}]")
        return new_chart
        
    def _update_grid_layout(self):
        """Update CSS layout for all charts based on current grid state."""
        active_cells = self._get_active_cells()
        active_count = len(active_cells)
        
        if active_count == 0:
            return
            
        # Set window.chartLayoutMode for context menu
        self._main_chart.run_script(f"window.chartLayoutMode = '{self._current_view_mode}';")
        
        # Calculate CSS positions for each chart based on grid configuration
        if active_count == 1:
            # Single chart fills entire space
            cell = active_cells[0]
            chart = self._grid[cell[0]][cell[1]]
            self._set_chart_css(chart, 0, 0, 100, 100)
        elif active_count == 2:
            # Two charts - determine if side by side or stacked
            cells_sorted = sorted(active_cells)
            if cells_sorted[0][0] == cells_sorted[1][0]:
                # Same row = horizontal split (side by side)
                left_chart = self._grid[cells_sorted[0][0]][cells_sorted[0][1]]
                right_chart = self._grid[cells_sorted[1][0]][cells_sorted[1][1]]
                ratio = self._split_ratio * 100
                self._set_chart_css(left_chart, 0, 0, ratio, 100)
                self._set_chart_css(right_chart, ratio, 0, 100 - ratio, 100)
            else:
                # Different rows = vertical split (stacked)
                top_chart = self._grid[cells_sorted[0][0]][cells_sorted[0][1]]
                bottom_chart = self._grid[cells_sorted[1][0]][cells_sorted[1][1]]
                ratio = self._split_ratio * 100
                self._set_chart_css(top_chart, 0, 0, 100, ratio)
                self._set_chart_css(bottom_chart, 0, ratio, 100, 100 - ratio)
        elif active_count == 3 or active_count == 4:
            # Grid layout - use 2x2 positioning
            ratio = self._split_ratio * 100
            for row in range(2):
                for col in range(2):
                    chart = self._grid[row][col]
                    if chart:
                        left = col * ratio if col == 0 else ratio
                        top = row * ratio if row == 0 else ratio
                        width = ratio if col == 0 else (100 - ratio)
                        height = ratio if row == 0 else (100 - ratio)
                        self._set_chart_css(chart, left, top, width, height)
                        
        # Re-inject context menu handlers for all active charts
        QTimer.singleShot(100, self._reinject_context_menus)
        
    def _set_chart_css(self, chart, left: float, top: float, width: float, height: float):
        """Set CSS position and size for a chart."""
        chart_id = chart.id
        self._main_chart.run_script(f"""
            (function() {{
                var chart = {chart_id};
                if (chart && chart.wrapper) {{
                    chart.wrapper.style.position = 'absolute';
                    chart.wrapper.style.left = '{left}%';
                    chart.wrapper.style.top = '{top}%';
                    chart.wrapper.style.width = '{width}%';
                    chart.wrapper.style.height = '{height}%';
                    chart.wrapper.style.display = 'block';
                }}
            }})();
        """)
        
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
        chart.price_scale()
        
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
        
        # Get all 4 chart IDs
        chart0_id = self._charts_data[0]['obj'].id
        chart1_id = self._charts_data[1]['obj'].id
        chart2_id = self._charts_data[2]['obj'].id
        chart3_id = self._charts_data[3]['obj'].id
        
        # Use simple string formatting to avoid f-string brace escaping hell
        script = """
            console.log("[QtSplitChart] Pre-IIFE Check - Script injected");
            try {
                (function() {
                    console.log("[QtSplitChart] Script starting...");
                    
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
                        console.log("[QtSplitChart] init() called, looking for all 4 charts...");
                        var charts = [%s, %s, %s, %s];
                        
                        // Wait for at least charts 0 and 1 to be ready
                        var c0 = charts[0];
                        var c1 = charts[1];
                        
                        console.log("[QtSplitChart] c0 found:", !!c0, "c0.chart:", !!(c0 && c0.chart));
                        console.log("[QtSplitChart] c1 found:", !!c1, "c1.chart:", !!(c1 && c1.chart));
                        
                        if (!c0 || !c0.chart || !c1 || !c1.chart) {
                            console.log("[QtSplitChart] Charts not ready, retrying in 500ms...");
                            setTimeout(init, 500);
                            return;
                        }
                        
                        // Setup click capture for all 4 charts
                        for (var i = 0; i < charts.length; i++) {
                            if (charts[i]) {
                                setupClickCapture(charts[i], '' + i);
                            }
                        }
                        
                        
                        // Crosshair Sync - Use native Lib.Handler.syncCharts
                        // This is the SAME function that works for regular SubCharts
                        
                        if (window.crosshairSyncEnabled === undefined) {
                            window.crosshairSyncEnabled = true;
                        }
                        
                        // Store sync subscriptions so we can toggle them
                        window._syncSubscriptions = [];
                        
                        // Function to setup sync between two charts
                        function setupNativeSync(chartA, chartB) {
                            if (!chartA || !chartB || !chartA.chart || !chartB.chart) {
                                console.log("[QtSplitChart] Cannot sync - charts not ready");
                                return;
                            }
                            
                            // Call native syncCharts function from the library
                            if (Lib && Lib.Handler && Lib.Handler.syncCharts) {
                                console.log("[QtSplitChart] Calling native Lib.Handler.syncCharts");
                                Lib.Handler.syncCharts(chartA, chartB, true);  // crosshairOnly=true
                            } else {
                                console.log("[QtSplitChart] Lib.Handler.syncCharts not available, using fallback");
                                
                                // Fallback: manual sync implementation matching native pattern
                                function crosshairHandler(chart, point) {
                                    if (!point) {
                                        chart.chart.clearCrosshairPosition();
                                        return;
                                    }
                                    chart.chart.setCrosshairPosition(point.value || point.close, point.time, chart.series);
                                }
                                
                                function getPoint(series, param) {
                                    if (!param.time) return null;
                                    return param.seriesData.get(series) || null;
                                }
                                
                                var selected = chartA;
                                
                                var setACrosshair = function(param) {
                                    if (!window.crosshairSyncEnabled) return;
                                    crosshairHandler(chartA, getPoint(chartB.series, param));
                                };
                                var setBCrosshair = function(param) {
                                    if (!window.crosshairSyncEnabled) return;
                                    crosshairHandler(chartB, getPoint(chartA.series, param));
                                };
                                
                                // Start with A active
                                chartA.chart.subscribeCrosshairMove(setBCrosshair);
                                
                                chartA.wrapper.addEventListener('mouseover', function() {
                                    if (selected === chartA) return;
                                    selected = chartA;
                                    chartB.chart.unsubscribeCrosshairMove(setACrosshair);
                                    chartA.chart.subscribeCrosshairMove(setBCrosshair);
                                    console.log("[QtSplitChart] Switched to chart A");
                                });
                                
                                chartB.wrapper.addEventListener('mouseover', function() {
                                    if (selected === chartB) return;
                                    selected = chartB;
                                    chartA.chart.unsubscribeCrosshairMove(setBCrosshair);
                                    chartB.chart.subscribeCrosshairMove(setACrosshair);
                                    console.log("[QtSplitChart] Switched to chart B");
                                });
                            }
                        }
                        
                        // Get visible charts (charts 0 and 1 are typically visible after split)
                        var c0 = charts[0];
                        var c1 = charts[1];
                        
                        // Setup sync between chart 0 and chart 1
                        if (c0 && c1 && c0.wrapper && c1.wrapper) {
                            setupNativeSync(c0, c1);
                            console.log("[QtSplitChart] Sync setup between charts 0 and 1");
                        } else {
                            console.log("[QtSplitChart] Charts not ready for sync yet");
                        }
                        
                        console.log("[QtSplitChart] Sync setup complete");
                        console.log("[QtSplitChart] Init complete");
                        
                        if (window.pythonObject) {
                            window.pythonObject.callback('on_chart_ready');
                        }
                    } catch(e) {
                        console.log("[QtSplitChart] Init error: " + e);
                    }
                }
                
                init();
            })();
            } catch(e) { console.log("Global Script execution error: " + e); }
        """ % (chart0_id, chart1_id, chart2_id, chart3_id)
        
        # Note: split_resizer.js is now loaded via index.html to ensure it's available
        # before any Python-injected scripts run
        
        self._main_chart.run_script(script)
        
        # [NEW] Initialize context menu for both charts
        self._inject_context_menu_handlers()
        
        # [FIX] Apply the current view mode once handlers are injected
        # This ensures we respect the mode even if it was set before JS was ready
        QTimer.singleShot(500, lambda: self.set_view_mode(self._current_view_mode))
        
    def _inject_context_menu_handlers(self):
        """Register Python handlers for context menu actions.
        
        Note: Context menus are now auto-initialized in JS via chartCreated event.
        This method only registers the Python-side callback handlers.
        """
        # Register Python handlers for context menu actions
        self._main_chart.win.handlers['on_context_split'] = self._on_context_split
        self._main_chart.win.handlers['on_context_close'] = self._on_context_close
        logger.debug("[QtSplitChart] Registered Python context menu handlers")
        
    def _reinject_context_menus(self):
        """Update visibility grid and layout mode for context menus.
        
        Note: Context menus are now auto-initialized in JS via chartCreated event.
        This method only updates the grid state so context menus know which
        split options are available.
        """
        # Generate visibility grid from _visible_indices
        # Index mapping: 0=[0,0], 1=[0,1], 2=[1,0], 3=[1,1]
        visibility_grid = [[0, 0], [0, 0]]
        for idx in self._visible_indices:
            row = idx // 2
            col = idx % 2
            visibility_grid[row][col] = 1
        
        # Update grid state in JavaScript for context menu split availability
        script = f"""
            (function() {{
                window.chartLayoutMode = '{self._current_view_mode}';
                window.chartGrid = {str(visibility_grid)};
                console.log('[QtSplitChart] Updated grid state:', window.chartGrid, 'mode:', window.chartLayoutMode);
            }})();
        """
        self._main_chart.run_script(script)
        logger.debug(f"[QtSplitChart] Updated grid state: {visibility_grid}, mode: {self._current_view_mode}")
        
    def _on_context_split(self, params: str):
        """Handle split request from context menu.
        
        With pre-created charts, splitting just shows hidden charts.
        
        Args:
            params: Format is 'row_col_direction' e.g. '0_0_right' or legacy 'right'/'down'
        """
        logger.info(f"[QtSplitChart] _on_context_split: {params}")
        
        # Parse the callback parameters
        parts = params.split('_')
        if len(parts) == 3:
            # New format: row_col_direction
            try:
                source_row = int(parts[0])
                source_col = int(parts[1])
                direction = parts[2]
            except ValueError:
                logger.error(f"[QtSplitChart] Invalid split params: {params}")
                return
        elif params in ('right', 'down'):
            # Legacy format: just direction (assume from [0,0])
            source_row, source_col = 0, 0
            direction = params
        else:
            logger.error(f"[QtSplitChart] Unknown split format: {params}")
            return
        
        # Convert source position to index
        source_idx = source_row * 2 + source_col
        
        # Determine which chart to show based on direction
        if direction == 'right':
            # Show chart to the right (same row, next column)
            target_idx = source_row * 2 + (source_col + 1)
            if source_col + 1 > 1:
                logger.warning(f"[QtSplitChart] Cannot split right from col {source_col}")
                return
        elif direction == 'down':
            # Show chart below (next row, same column)
            target_idx = (source_row + 1) * 2 + source_col
            if source_row + 1 > 1:
                logger.warning(f"[QtSplitChart] Cannot split down from row {source_row}")
                return
        else:
            return
            
        # Add target to visible charts
        self._visible_indices.add(target_idx)
        
        # Determine new mode based on visible indices
        visible = self._visible_indices
        if visible == {0}:
            new_mode = 'single'
        elif visible == {0, 1}:
            new_mode = 'split_h'
        elif visible == {0, 2}:
            new_mode = 'split_v'
        elif visible == {0, 1, 3}:
            # Left big, 2 stacked on right (chart 0 left, 1+3 right)
            new_mode = '3_left_big'
        elif visible == {0, 2, 3}:
            # Top big, 2 on bottom (chart 0 top, 2+3 bottom)
            new_mode = '3_top_big'
        elif visible == {0, 1, 2}:
            # Right big, 2 stacked on left (chart 1 right, 0+2 left)
            new_mode = '3_right_big'
        elif visible == {1, 2, 3}:
            # Bottom big, 2 on top (chart 2 bottom, 0+1 top) - but chart 0 must be visible
            new_mode = 'grid'  # Fallback since chart 0 must always be visible
        elif visible == {0, 1, 2, 3}:
            new_mode = 'grid'
        else:
            # Default to grid for any other combination
            new_mode = 'grid'
        
        logger.info(f"[QtSplitChart] Split: visible={self._visible_indices}, mode={new_mode}")
        
        # Apply the layout (no automatic range modifications)
        self.set_view_mode(new_mode)
        
        # Emit signal for mainwindow to load data into the new chart
        # Format: 'direction:target_idx' e.g. 'down:2' or 'right:1'
        self.view_mode_changed.emit(f"{direction}:{target_idx}")
            
    def _on_context_close(self, params: str):
        """Handle close request from context menu.
        
        With pre-created charts, closing just hides the chart.
        
        Args:
            params: Format is 'row_col' e.g. '0_1' or legacy index '1'
        """
        logger.info(f"[QtSplitChart] _on_context_close: {params}")
        
        # Parse the callback parameters
        parts = params.split('_')
        if len(parts) == 2:
            # New format: row_col
            try:
                row = int(parts[0])
                col = int(parts[1])
                idx = row * 2 + col
            except ValueError:
                logger.error(f"[QtSplitChart] Invalid close params: {params}")
                return
        else:
            # Legacy format: linear index
            try:
                idx = int(params)
            except ValueError:
                logger.error(f"[QtSplitChart] Invalid close index: {params}")
                return
                
        # Don't allow closing the primary chart (index 0)
        if idx == 0:
            logger.warning("[QtSplitChart] Cannot close primary chart")
            return
            
        # Remove from visible indices
        if idx in self._visible_indices:
            self._visible_indices.discard(idx)
        
        # Determine new mode based on visible indices (same logic as _on_context_split)
        visible = self._visible_indices
        if visible == {0}:
            new_mode = 'single'
        elif visible == {0, 1}:
            new_mode = 'split_h'
        elif visible == {0, 2}:
            new_mode = 'split_v'
        elif visible == {0, 1, 3}:
            # Left big, 2 stacked on right (chart 0 left, 1+3 right)
            new_mode = '3_left_big'
        elif visible == {0, 2, 3}:
            # Top big, 2 on bottom (chart 0 top, 2+3 bottom)
            new_mode = '3_top_big'
        elif visible == {0, 1, 2}:
            # Bottom big, 2 on top OR Right big - depends on which was closed
            # If closing chart 3, we have {0,1,2} - chart 2 was already visible on left
            new_mode = '3_right_big'
        elif visible == {0, 1, 2, 3}:
            new_mode = 'grid'
        else:
            # Default: go back to simpler layout
            if 1 in visible:
                new_mode = 'split_h'
            elif 2 in visible:
                new_mode = 'split_v'
            else:
                new_mode = 'single'
        
        # Determine parent chart to focus after close
        # Parent hierarchy: chart 3 -> 1, chart 2 -> 0, chart 1 -> 0
        parent_map = {1: 0, 2: 0, 3: 1}
        parent_idx = parent_map.get(idx, 0)
        # If parent is not visible, fall back to chart 0
        if parent_idx not in self._visible_indices:
            parent_idx = 0
        
        # Set focus to parent chart
        self._active_index = parent_idx
        self._update_active_border()
        self.active_chart_changed.emit(parent_idx)
        
        logger.info(f"[QtSplitChart] Close: visible={self._visible_indices}, mode={new_mode}, focus={parent_idx}")
        
        # Apply the layout
        self.set_view_mode(new_mode)
        
        # Emit signal for mainwindow (no data loading needed on close)
        # Format: 'close:mode:parent_idx:closed_idx' so consumers can clear closed chart data
        self.view_mode_changed.emit(f"close:{new_mode}:{parent_idx}:{idx}")

    def set_view_mode(self, mode: str, preserve_chart0_range: bool = False):
        """
        Set view mode using resize() for all layout transitions.
        
        Args:
            mode: View mode name
            preserve_chart0_range: DEPRECATED - no longer used. Charts should not be
                                   automatically modified after initial render.
        
        Supported modes:
        - single: Only chart[0] visible (1.0, 1.0)
        - split / split_h: Horizontal split - chart[0] left, chart[1] right  
        - split_down / split_v: Vertical split - chart[0] top, chart[2] bottom
        - 3_left_big: chart[0] big left, chart[1] + chart[3] stacked right
        - 3_top_big: chart[0] big top, chart[2] + chart[3] side-by-side bottom
        - 3_right_big: chart[1] big right, chart[0] + chart[2] stacked left
        - 3_bottom_big: chart[2] big bottom, chart[0] + chart[1] side-by-side top
        - grid: All 4 charts (0.5, 0.5)
        """
        # Normalize mode names (aliases)
        mode_map = {
            'split': 'split_h',
            'split_down': 'split_v'
        }
        mode = mode_map.get(mode, mode)
        
        self._current_view_mode = mode
        
        if not self._is_loaded:
            return
        
        # NOTE: Do NOT save/restore chart ranges on split - charts should maintain
        # their position without automatic modifications after initial render
        
        logger.info(f"[QtSplitChart] set_view_mode: {mode}")
        
        # Define resize dimensions AND positions for each mode
        # Format: {chart_idx: (width, height, left, top)}
        # Positions are percentages (0.0-1.0), None means default positioning
        r = self._split_ratio
        layout_configs = {
            'single': {
                0: (1.0, 1.0, 0, 0),
                1: (0, 0, 0, 0),
                2: (0, 0, 0, 0),
                3: (0, 0, 0, 0)
            },
            'split_h': {  # Horizontal: left/right
                0: (r, 1.0, 0, 0),
                1: (1.0 - r, 1.0, r, 0),
                2: (0, 0, 0, 0),
                3: (0, 0, 0, 0)
            },
            'split_v': {  # Vertical: top/bottom
                0: (1.0, r, 0, 0),
                1: (0, 0, 0, 0),
                2: (1.0, 1.0 - r, 0, r),
                3: (0, 0, 0, 0)
            },
            '3_left_big': {  # Left big, 2 stacked on right
                0: (r, 1.0, 0, 0),
                1: (1.0 - r, 0.5, r, 0),       # Right-top
                2: (0, 0, 0, 0),
                3: (1.0 - r, 0.5, r, 0.5)      # Right-bottom
            },
            '3_top_big': {  # Top big, 2 on bottom
                0: (1.0, r, 0, 0),
                1: (0, 0, 0, 0),
                2: (0.5, 1.0 - r, 0, r),       # Bottom-left
                3: (0.5, 1.0 - r, 0.5, r)      # Bottom-right
            },
            '3_right_big': {  # Right big, 2 stacked on left
                0: (r, 0.5, 0, 0),             # Left-top
                1: (1.0 - r, 1.0, r, 0),       # Right (full height)
                2: (r, 0.5, 0, 0.5),           # Left-bottom
                3: (0, 0, 0, 0)
            },
            '3_bottom_big': {  # Bottom big, 2 on top
                0: (0.5, r, 0, 0),             # Top-left
                1: (0.5, r, 0.5, 0),           # Top-right
                2: (1.0, 1.0 - r, 0, r),       # Bottom (full width)
                3: (0, 0, 0, 0)
            },
            'grid': {  # 2x2 grid
                0: (0.5, 0.5, 0, 0),           # Top-left
                1: (0.5, 0.5, 0.5, 0),         # Top-right
                2: (0.5, 0.5, 0, 0.5),         # Bottom-left
                3: (0.5, 0.5, 0.5, 0.5)        # Bottom-right
            }
        }
        
        config = layout_configs.get(mode, layout_configs['single'])
        
        # Apply resize and position to all charts
        for idx, (width, height, left, top) in config.items():
            if idx < len(self._charts):
                chart = self._charts[idx]
                chart.resize(width, height)
                
                # Inject CSS position and visibility
                if width > 0 and height > 0:
                    # Show and position the chart
                    self._main_chart.run_script(f"""
                        (function() {{
                            var chart = {chart.id};
                            if (chart && chart.wrapper) {{
                                chart.wrapper.style.display = 'block';
                                chart.wrapper.style.position = 'absolute';
                                chart.wrapper.style.left = '{left * 100}%';
                                chart.wrapper.style.top = '{top * 100}%';
                            }}
                        }})();
                    """)
                else:
                    # Hide the chart completely
                    self._main_chart.run_script(f"""
                        (function() {{
                            var chart = {chart.id};
                            if (chart && chart.wrapper) {{
                                chart.wrapper.style.display = 'none';
                            }}
                        }})();
                    """)
                
                logger.debug(f"[QtSplitChart] Chart[{idx}].resize({width}, {height}) pos({left}, {top})")
        
        # Update visible indices based on which charts have non-zero dimensions
        self._visible_indices = {idx for idx, (w, h, l, t) in config.items() if w > 0 and h > 0}
        
        # Reinject context menus for all visible charts
        self._reinject_context_menus()
        
        # Initialize resizers for drag-to-resize functionality
        if mode != 'single':
            self._init_resizers(mode)
        else:
            self._main_chart.run_script("if (window.clearSplitResizers) window.clearSplitResizers(); if (window.clearHighlight) window.clearHighlight();")
        
        # Apply active border
        self._update_active_border()
        
        # [FIX] Re-trigger crosshair sync when transitioning to multi-chart mode
        # Uses ResizeObserver via _sync_visible_charts (no delays)
        if mode != 'single' and self._sync_enabled:
            # Small delay to ensure DOM updates propogate for ResizeObserver to catch
            QTimer.singleShot(50, self._sync_visible_charts)
        
        # NOTE: Do NOT restore chart ranges after resize - charts should stay
        # exactly where the user left them. No automatic modifications.
        
        # Emit ready signal
        self.ready.emit()
    
    def _init_resizers(self, mode: str):
        """Initialize drag-to-resize dividers for the current layout mode."""
        # Get chart IDs
        c0_id = self._charts[0].id if len(self._charts) > 0 else 'null'
        c1_id = self._charts[1].id if len(self._charts) > 1 else 'null'
        c2_id = self._charts[2].id if len(self._charts) > 2 else 'null'
        c3_id = self._charts[3].id if len(self._charts) > 3 else 'null'
        
        script = f"""
            (function() {{
                if (!window.initLayoutResizers) {{
                    console.log('[SplitResizer] Module not loaded');
                    return;
                }}
                
                var charts = {{
                    c0: {c0_id},
                    c1: {c1_id},
                    c2: {c2_id},
                    c3: {c3_id}
                }};
                
                window.initLayoutResizers('{mode}', charts, function(axis, ratio) {{
                    console.log('[SplitResizer] Ratio changed:', axis, ratio);
                    if (window.pythonObject) {{
                        window.pythonObject.callback('on_split_ratio_~_' + axis + '_' + ratio.toFixed(4));
                    }}
                }});
            }})();
        """
        self._main_chart.run_script(script)
        
    def _on_chart_ready(self, *args):
        """Called from JS when charts are fully initialized."""
        logger.info("[QtSplitChart] _on_chart_ready callback received - JS confirmed charts ready")
        
        # Check for pending view mode from restore_layout_state
        if hasattr(self, '_pending_view_mode') and self._pending_view_mode:
            view_mode = self._pending_view_mode
            self._pending_view_mode = None
            logger.info(f"[QtSplitChart] Applying pending view mode: {view_mode}")
            self.set_view_mode(view_mode)
        else:
            # Force apply current view mode now that JS is ready
            self.set_view_mode(self._current_view_mode)
        
        # [FIX] Explicitly reinject context menus after JS confirms readiness
        # This ensures first tab gets context menus even if earlier injection was too early
        # [FIX] Explicitly reinject context menus after JS confirms readiness
        # This ensures first tab gets context menus even if earlier injection was too early
        QTimer.singleShot(200, self._reinject_context_menus)
        
        # [DEBUG] Inject global interceptor to track ALL setVisibleLogicalRange calls
        if hasattr(self, '_charts') and len(self._charts) > 0:
            chart_ids = [c.id for c in self._charts if c is not None]
            logger.info(f"[RangeTracker] Injecting interceptors for charts: {chart_ids}")
            import json
            self.run_script(f'''
                (function() {{
                    console.log('[RangeTracker] ===== INSTALLING INTERCEPTORS =====');
                    var chartIds = {json.dumps(chart_ids)};
                    console.log('[RangeTracker] Chart IDs:', chartIds);
                    chartIds.forEach(function(chartId) {{
                        try {{
                            console.log('[RangeTracker] Processing chart:', chartId);
                            var chartObj = eval(chartId);
                            console.log('[RangeTracker] chartObj:', chartObj ? 'exists' : 'null');
                            if (!chartObj || !chartObj.chart) {{
                                console.log('[RangeTracker] Skipping - no chartObj.chart');
                                return;
                            }}
                            var timeScale = chartObj.chart.timeScale();
                            
                            // Hook setVisibleLogicalRange
                            if (!timeScale._originalSetVisibleLogicalRange) {{
                                timeScale._originalSetVisibleLogicalRange = timeScale.setVisibleLogicalRange.bind(timeScale);
                                timeScale.setVisibleLogicalRange = function(range) {{
                                    var stack = new Error().stack.split('\\n').slice(2, 5).join(' <- ');
                                    console.log('[RangeTracker] setVisibleLogicalRange CALLED on ' + chartId + ': ' + JSON.stringify(range) + ' | FROM: ' + stack);
                                    return timeScale._originalSetVisibleLogicalRange(range);
                                }};
                                console.log('[RangeTracker] Hooked setVisibleLogicalRange for ' + chartId);
                            }}
                            
                            // Hook scrollToRealTime
                            if (!timeScale._originalScrollToRealTime) {{
                                timeScale._originalScrollToRealTime = timeScale.scrollToRealTime.bind(timeScale);
                                timeScale.scrollToRealTime = function() {{
                                    var stack = new Error().stack.split('\\n').slice(2, 5).join(' <- ');
                                    console.log('[RangeTracker] scrollToRealTime CALLED on ' + chartId + ' | FROM: ' + stack);
                                    return timeScale._originalScrollToRealTime();
                                }};
                                console.log('[RangeTracker] Hooked scrollToRealTime for ' + chartId);
                            }}
                            
                            // Hook scrollToPosition
                            if (!timeScale._originalScrollToPosition) {{
                                timeScale._originalScrollToPosition = timeScale.scrollToPosition.bind(timeScale);
                                timeScale.scrollToPosition = function(pos, animate) {{
                                    var stack = new Error().stack.split('\\n').slice(2, 5).join(' <- ');
                                    console.log('[RangeTracker] scrollToPosition CALLED on ' + chartId + ': pos=' + pos + ' | FROM: ' + stack);
                                    return timeScale._originalScrollToPosition(pos, animate);
                                }};
                                console.log('[RangeTracker] Hooked scrollToPosition for ' + chartId);
                            }}
                        }} catch(e) {{
                            console.error('[RangeTracker] Error hooking ' + chartId + ':', e);
                        }}
                    }});
                    console.log('[RangeTracker] Global range API interceptors installed');
                }})();
            ''')
        
        # [FIX] Inject Fast Restore logic (JS-side auto-restore on visibility)
        # This eliminates the "jump" when switching tabs by restoring the range instantly upon resize/visibility
        # By handling this in JS, we avoid the round-trip latency to Python
        if hasattr(self, '_charts') and len(self._charts) > 0:
            chart0 = self._charts[0]
            chart0_id = chart0.id
            restore_script = f"""
            (function() {{
                // [DEBUG] TEMPORARILY DISABLED FastRestore to isolate range drift bug
                console.log('[FastRestore] DISABLED FOR DEBUGGING');
                return;
                
                var chartObj = {chart0_id};
                var chartId = '{chart0_id}';
                if (!chartObj || !chartObj.chart) return;
                
                // Initialize per-chart storage if not exists
                window._chartVisibilityRanges = window._chartVisibilityRanges || {{}};
                
                // Get the container element - use chartObj.wrapper if available, 
                // otherwise try stripping 'window.' from the ID
                var container = chartObj.wrapper || chartObj.div || 
                                document.getElementById(chartId.replace('window.', ''));
                
                if (!container) {{
                    console.warn('[FastRestore] Could not find container for ' + chartId);
                    return;
                }}
                
                // 1. Subscribe to range changes to keep cache fresh (per-chart)
                chartObj.chart.timeScale().subscribeVisibleLogicalRangeChange(range => {{
                    // [SAFEGUARD] Only update if chart is actually visible
                    if (container && container.offsetParent !== null) {{
                        if (range) {{
                            window._chartVisibilityRanges[chartId] = range;
                            // console.log('[FastRestore] Saved range for ' + chartId, range);
                        }}
                    }}
                }});
                
                // 2. Monitor visibility using IntersectionObserver (works even when Qt hides without resizing)
                var wasHidden = false;
                
                new IntersectionObserver((entries) => {{
                    for (let entry of entries) {{
                        if (!entry.isIntersecting) {{
                            // Element is now hidden/off-screen
                            wasHidden = true;
                            console.log('[FastRestore] Chart hidden: ' + chartId);
                        }} else {{
                            // Element is now visible
                            console.log('[FastRestore] Chart visible: ' + chartId + ', wasHidden=' + wasHidden);
                            
                            // [FIX] Check if FastRestore is suppressed (during tab restore)
                            // Check both per-chart flag and global flag
                            var isSuppressed = (window._suppressFastRestore && window._suppressFastRestore[chartId]) || window._suppressFastRestoreAll;
                            if (isSuppressed) {{
                                console.log('[FastRestore] SUPPRESSED for ' + chartId + ' (tab restore in progress, global=' + !!window._suppressFastRestoreAll + ')');
                                // Clear per-chart suppress flag if set
                                if (window._suppressFastRestore && window._suppressFastRestore[chartId]) {{
                                    delete window._suppressFastRestore[chartId];
                                }}
                                wasHidden = false;
                                return;
                            }}
                            
                            var savedRange = window._chartVisibilityRanges[chartId];
                            if (wasHidden && savedRange) {{
                                try {{
                                    console.log('[FastRestore] Restoring range for ' + chartId);
                                    chartObj.chart.timeScale().setVisibleLogicalRange(savedRange);
                                }} catch(e) {{ 
                                    console.error('[FastRestore] Error:', e); 
                                }}
                            }}
                            wasHidden = false;
                        }}
                    }}
                }}, {{ threshold: 0.1 }}).observe(container);
                
                console.log('[FastRestore] Initialized per-chart storage for ' + chartId + ', container:', container);
            }})();
            """
            logger.info(f"[QtSplitChart] FastRestore: Injecting script for chart {chart0_id}")
            self.run_script(restore_script)
            logger.info(f"[QtSplitChart] FastRestore: Script injected successfully")


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
                self.active_chart_changed.emit(index)
            else:
                logger.debug(f"[QtSplitChart] Focus re-asserted on {index}")
        except ValueError:
            logger.error(f"[QtSplitChart] Invalid index: {index_str}")
            
    def _on_ratio_changed(self, ratio_str: str):
        """Handler called from JS when split ratio changes via drag.
        
        Args:
            ratio_str: Format is 'axis_ratio' e.g. 'horizontal_0.6' or legacy float
        """
        try:
            # Parse new format: 'axis_ratio'
            if '_' in ratio_str:
                parts = ratio_str.split('_')
                axis = parts[0]
                ratio = float(parts[1])
                
                if axis == 'horizontal':
                    self._h_ratio = ratio
                    logger.debug(f"[QtSplitChart] H-ratio changed to {ratio}")
                else:
                    self._v_ratio = ratio
                    logger.debug(f"[QtSplitChart] V-ratio changed to {ratio}")
            else:
                # Legacy format: just a float
                ratio = float(ratio_str)
                self._split_ratio = ratio
                logger.debug(f"[QtSplitChart] Ratio changed to {ratio}")
            
            self.ratio_changed.emit(ratio)
        except ValueError as e:
            logger.error(f"[QtSplitChart] Invalid ratio value: {ratio_str}, error: {e}")
            
    def _update_active_border(self):
        """Update the visual border to show which chart is active using detached overlay."""
        if not self._enable_focus_tracking:
            return

        # Prepare config
        width = self._active_border_width
        color = self._active_border_color
        
        # Call JS global highlighter
        # config = {color: "hex", width: int}
        script = f"""
            if (window.setHighlight) {{
                window.setHighlight('{self._active_index}', {{color: '{color}', width: {width}}});
            }}
        """
        
        # Execute on main chart (it shares the same window context)
        if self._main_chart:
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
        """Get the subchart (right/bottom) widget.
        
        Creates the chart if it doesn't exist (for backward compatibility).
        Note: The chart is created hidden and NOT added to the grid until
        split view is activated via set_view_mode().
        """
        if self._sub_chart is None:
            # Create sub chart hidden (NOT in grid yet)
            self._sub_chart = self._main_chart.create_subchart(
                width=1.0,
                height=1.0,
                toolbox=self._toolbox,
                sync=False,
                sync_crosshairs_only=False
            )
            # Style it
            self._style_chart(self._sub_chart)
            # Add click handler
            self._sub_chart.events.click += lambda chart, t, p: self._on_chart_click(0, 1, t, p)
            # Store in data but NOT in grid
            self._charts_data['0,1'] = {'obj': self._sub_chart, 'df': None, 'symbol': None}
            self._charts_data[1] = self._charts_data['0,1']
            logger.info(f"[QtSplitChart] Created hidden sub_chart, id={self._sub_chart.id}")
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
    
    @property
    def is_sync_enabled(self) -> bool:
        """Get whether crosshair sync is enabled."""
        return self._sync_enabled
    
    def set_sync(self, enabled: bool):
        """
        Enable or disable crosshair sync between split charts.
        
        Args:
            enabled: True to enable sync, False to disable
        """
        self._sync_enabled = enabled
        logger.debug(f"[QtSplitChart] Crosshair sync set to {enabled}")
        
        # Update JavaScript flag AND re-trigger native sync if enabling
        if self._is_loaded and self._main_chart:
            script = f"window.crosshairSyncEnabled = {'true' if enabled else 'false'};"
            self._main_chart.run_script(script)
            
            # Re-trigger native sync (safe now: crosshairOnly=true skips range sync)
            if enabled:
                self._sync_visible_charts()
    

    
    def _sync_visible_charts(self):
        """Sync crosshairs between ALL currently visible charts.
        
        This consolidated method handles both initial sync (after split)
        and manual re-sync (toggle). It uses ResizeObserver to ensure
        charts are fully visible before attempting to sync.
        """
        if not self._is_loaded or not self._main_chart:
            return
        
        # Get IDs of visible charts (those with non-zero dimensions)
        visible_ids = []
        for idx in self._visible_indices:
            if idx < len(self._charts):
                visible_ids.append(self._charts[idx].id.replace('window.', ''))
        
        # We need at least 2 charts to sync
        if len(visible_ids) < 2:
            return
        
        logger.debug(f"[QtSplitChart] Syncing visible charts: {visible_ids}")
        
        # Script to sync all unique pairs of visible charts
        sync_script = '''
            (function() {
                var visibleIds = %s;
                
                // Get chart objects
                var charts = visibleIds.map(function(id) {
                    return window[id];
                }).filter(function(c) {
                    return c && c.chart && c.wrapper;
                });
                
                if (charts.length < 2) {
                    console.log("[QtSplitChart] Not enough visible charts for sync");
                    return;
                }
                
                // Function to check if chart wrapper has non-zero dimensions
                function hasVisibleDimensions(chart) {
                    var rect = chart.wrapper.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0;
                }
                
                // Function to setup sync once all charts are visible
                function setupSyncWhenReady() {
                    var allVisible = charts.every(hasVisibleDimensions);
                    
                    if (!allVisible) {
                        console.log("[QtSplitChart] Charts not yet visible, using ResizeObserver");
                        var observer = new ResizeObserver(function(entries) {
                            if (charts.every(hasVisibleDimensions)) {
                                observer.disconnect();
                                setupGlobalSync();
                            }
                        });
                        charts.forEach(function(c) {
                            if (c.wrapper) observer.observe(c.wrapper);
                        });
                        return;
                    }
                    
                    setupGlobalSync();
                }
                
                function setupGlobalSync() {
                    console.log("[QtSplitChart] Setting up global sync for", charts.length, "charts");
                    
                    // Clear any existing subscriptions to prevent duplicates
                    if (window._syncCleanups) {
                        window._syncCleanups.forEach(function(fn) { fn(); });
                    }
                    window._syncCleanups = [];
                    
                    charts.forEach(function(sourceChart) {
                        var handler = function(param) {
                            // Sync check
                            if (window.crosshairSyncEnabled === false) return;
                            if (!param || !param.time || !param.point) {
                                // Clear others if source is cleared
                                charts.forEach(function(target) {
                                    if (target === sourceChart) return;
                                    target.chart.clearCrosshairPosition();
                                    // Also clear legend if possible?
                                });
                                return;
                            }
                            
                            // Get source point data
                            var sourceSeries = sourceChart.series;
                            var dataPoint = param.seriesData.get(sourceSeries);
                            if (!dataPoint) return;
                            
                            // Broadcast to all other charts
                            charts.forEach(function(target) {
                                if (target === sourceChart) return;
                                try {
                                    // Sync Crosshair (Time & Price)
                                    // We use source values assuming charts show same instrument (Split View)
                                    // For price, we use dataPoint.value or close
                                    var price = dataPoint.value || dataPoint.close;
                                    target.chart.setCrosshairPosition(price, param.time, target.series);
                                    
                                    // Sync Legend (using source data point)
                                    if (target.legend && target.legend.legendHandler) {
                                        target.legend.legendHandler(dataPoint, true);
                                    }
                                } catch(e) {
                                    // console.error(e);
                                }
                            });
                        };
                        
                        // Subscribe
                        sourceChart.chart.subscribeCrosshairMove(handler);
                        
                        // Store cleanup
                        window._syncCleanups.push(function() {
                            try {
                                sourceChart.chart.unsubscribeCrosshairMove(handler);
                            } catch(e) {}
                        });
                    });
                    
                    console.log("[QtSplitChart] Global sync setup complete");
                }
                
                setupSyncWhenReady();
            })();
        ''' % str(visible_ids)
        
        self._main_chart.run_script(sync_script)
            
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
        """Configure drawing persistence widget for ALL charts (not just main/sub)."""
        logger.debug("[QtSplitChart] configure_toolbox_save_under called")
        # Configure ALL 4 pre-created charts
        for idx, chart in enumerate(self._charts):
            if chart and chart.toolbox:
                logger.debug(f"[QtSplitChart] Configuring Chart[{idx}] Toolbox ({chart.id})")
                chart.toolbox.save_drawings_under(widget)
            
    def connect_drawing_changed_signal(self, callback):
        """Connect drawing changed callback for ALL chart toolboxes."""
        # Connect ALL 4 pre-created charts
        for idx, chart in enumerate(self._charts):
            if chart and chart.toolbox:
                logger.debug(f"[QtSplitChart] Connecting on_drawing_changed for Chart[{idx}]")
                chart.toolbox.on_drawing_changed = callback
    
    def get_layout_state(self) -> dict:
        """Get serializable layout state for persistence.
        
        Returns:
            Dict with view_mode, visible_indices, split_ratio, h_ratio, v_ratio, active_index
        """
        return {
            'view_mode': self._current_view_mode,
            'visible_indices': list(self._visible_indices),
            'split_ratio': self._split_ratio,
            'h_ratio': getattr(self, '_h_ratio', 0.5),
            'v_ratio': getattr(self, '_v_ratio', 0.5),
            'active_index': self._active_index
        }
    
    def restore_layout_state(self, state: dict):
        """Restore layout from persisted state.
        
        Args:
            state: Dict from get_layout_state()
        """
        if not state:
            return
        
        self._split_ratio = state.get('split_ratio', 0.5)
        self._h_ratio = state.get('h_ratio', 0.5)
        self._v_ratio = state.get('v_ratio', 0.5)
        self._visible_indices = set(state.get('visible_indices', [0]))
        self._active_index = state.get('active_index', 0)
        view_mode = state.get('view_mode', 'single')
        
        logger.info(f"[QtSplitChart] restore_layout_state: mode={view_mode}, visible={self._visible_indices}")
        
        # Defer view mode application to after chart is ready
        if self._is_loaded:
            self.set_view_mode(view_mode)
        else:
            # Store for later application in _on_chart_ready
            self._pending_view_mode = view_mode
    
    def save_visibility_state(self):
        """Save chart visible ranges before tab is hidden.
        
        Called by LiveTradesTabContent.hideEvent() to preserve chart positions
        across tab switches. Each chart saves its own range.
        """
        if not self._is_loaded:
            return
        if not self._main_chart:
            return
        
        # Save range for each chart individually
        for idx, chart in enumerate(self._charts):
            if chart:
                chart_id = chart.id
                self._main_chart.run_script(f"""
                    (function() {{
                        var chartId = '{chart_id}';
                        var handler = {chart_id};
                        if (handler && handler.chart) {{
                            window._chartVisibilityRanges = window._chartVisibilityRanges || {{}};
                            window._chartVisibilityRanges[chartId] = handler.chart.timeScale().getVisibleLogicalRange();
                            console.log('[FastRestore] Saved range for ' + chartId + ':', JSON.stringify(window._chartVisibilityRanges[chartId]));
                        }}
                    }})();
                """)
        logger.debug("[QtSplitChart] save_visibility_state called")
    
    def restore_visibility_state(self, delay_ms: int = 150):
        """Restore chart visible ranges after tab becomes visible.
        
        Called by LiveTradesTabContent.showEvent() to restore chart positions
        across tab switches. Each chart restores its own saved range.
        
        Args:
            delay_ms: Delay before restoring (default 150ms to run after init code)
        """
        if not self._is_loaded:
            return
        
        # Apply saved range to each chart individually (each has its own saved range)
        # Use setTimeout to ensure this runs AFTER crosshair sync and other init code
        for idx, chart in enumerate(self._charts):
            if chart:
                chart_id = chart.id
                self._main_chart.run_script(f"""
                    (function() {{
                        setTimeout(function() {{
                            var chartId = '{chart_id}';
                            
                            // [FIX] Check if restore is suppressed (during tab restore with fresh data load)
                            if (window._suppressFastRestoreAll) {{
                                console.log('[FastRestore] Restore SKIPPED for ' + chartId + ' (initial data load in progress)');
                                return;
                            }}
                            
                            var savedRange = window._chartVisibilityRanges && window._chartVisibilityRanges[chartId];
                            var handler = {chart_id};
                            if (savedRange && handler && handler.chart) {{
                                console.log('[FastRestore] Restoring (delayed) for ' + chartId + ':', JSON.stringify(savedRange));
                                handler.chart.timeScale().setVisibleLogicalRange(savedRange);
                            }} else {{
                                console.log('[FastRestore] No saved range for ' + chartId);
                            }}
                        }}, {delay_ms});
                    }})();
                """)
        logger.debug(f"[QtSplitChart] restore_visibility_state scheduled ({delay_ms}ms delay)")

