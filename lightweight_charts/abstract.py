import asyncio
import json
import os
import time
from base64 import b64decode
from datetime import datetime
from typing import Callable, Union, Literal, List, Optional
import pandas as pd
import logging

logger = logging.getLogger("lightweight_charts")

from .table import Table
from .toolbox import ToolBox
from .drawings import Box, HorizontalLine, RayLine, TrendLine, TwoPointDrawing, VerticalLine, VerticalSpan, PriceLine
from .topbar import TopBar
from .util import (
    BulkRunScript, Pane, Events, IDGen, as_enum, jbool, js_json, TIME, NUM, FLOAT,
    LINE_STYLE, MARKER_POSITION, MARKER_SHAPE, CROSSHAIR_MODE,
    PRICE_SCALE_MODE, marker_position, marker_shape, js_data,
)

current_dir = os.path.dirname(os.path.abspath(__file__))
INDEX = os.path.join(current_dir, 'js', 'index.html')


class Window:
    _id_gen = IDGen()

    def __init__(
        self,
        script_func: Optional[Callable] = None,
        js_api_code: Optional[str] = None,
        run_script: Optional[Callable] = None
    ):
        self.handlers = {}
        self.loaded = False
        self.script_func = script_func
        self.scripts = []
        self.final_scripts = []
        self.bulk_run = BulkRunScript(script_func)

        if run_script:
            self.run_script = run_script

        if js_api_code:
            self.run_script(f'window.callbackFunction = {js_api_code}')

    def on_js_load(self):
        import logging
        logger = logging.getLogger("lightweight_charts")
        logger.info(f"[DEBUG] on_js_load called: loaded={self.loaded}, final_scripts_count={len(self.final_scripts)}")
        
        if self.loaded:
            logger.info("[DEBUG] on_js_load SKIPPED (already loaded)")
            return
        self.loaded = True
        
        # Count syncCharts scripts
        sync_count = sum(1 for s in self.final_scripts if 'syncCharts' in s)
        logger.info(f"[DEBUG] on_js_load executing: {len(self.scripts)} regular + {len(self.final_scripts)} final scripts ({sync_count} syncCharts)")

        if hasattr(self, '_return_q'):
            while not self.run_script_and_get('document.readyState == "complete"'):
                continue    # scary, but works

        initial_script = ''
        self.scripts.extend(self.final_scripts)
        for script in self.scripts:
            initial_script += f'\n{script}'
        self.script_func(initial_script)

    def run_script(self, script: str, run_last: bool = False):
        """
        For advanced users; evaluates JavaScript within the Webview.
        """
        import logging
        logger = logging.getLogger("lightweight_charts")
        if self.script_func is None:
            raise AttributeError("script_func has not been set")
        
        # Debug: log if this is a syncCharts script
        is_sync_script = 'syncCharts' in script[:100] if len(script) > 100 else 'syncCharts' in script
        if is_sync_script:
            logger.info(f"[DEBUG] run_script syncCharts: loaded={self.loaded}, run_last={run_last}")
        
        if self.loaded:
            if self.bulk_run.enabled:
                self.bulk_run.add_script(script)
            else:
                if is_sync_script:
                    logger.info("[DEBUG] Executing syncCharts IMMEDIATELY (loaded=True)")
                self.script_func(script)
        elif run_last:
            if is_sync_script:
                logger.info("[DEBUG] Queueing syncCharts for later (run_last=True, loaded=False)")
            self.final_scripts.append(script)
        else:
            self.scripts.append(script)

    def run_script_and_get(self, script: str):
        self.run_script(f'_~_~RETURN~_~_{script}')
        return self._return_q.get()

    def create_table(
        self,
        width: NUM,
        height: NUM,
        headings: tuple,
        widths: Optional[tuple] = None,
        alignments: Optional[tuple] = None,
        position: FLOAT = 'left',
        draggable: bool = False,
        background_color: str = '#121417',
        border_color: str = 'rgb(70, 70, 70)',
        border_width: int = 1,
        heading_text_colors: Optional[tuple] = None,
        heading_background_colors: Optional[tuple] = None,
        return_clicked_cells: bool = False,
        func: Optional[Callable] = None
    ) -> 'Table':
        return Table(*locals().values())

    def create_subchart(
        self,
        position: FLOAT = 'left',
        width: float = 0.5,
        height: float = 0.5,
        sync_id: Optional[str] = None,
        scale_candles_only: bool = False,
        sync_crosshairs_only: bool = False,
        toolbox: bool = False
    ) -> 'AbstractChart':
        subchart = AbstractChart(
            self,
            width,
            height,
            scale_candles_only,
            toolbox,
            position=position
        )
        if not sync_id:
            return subchart
        # Use a robust retry mechanism that handles all timing scenarios
        # The script checks for chart existence at the JS level, not Python level
        import logging
        logger = logging.getLogger("lightweight_charts")
        logger.info(f"[DEBUG] Queueing syncCharts script for {subchart.id} + {sync_id}")
        self.run_script(f'''
            console.log("[DEBUG] syncCharts SCRIPT STARTING for {subchart.id} + {sync_id}");
            (function initSync() {{
                var retries = 0;
                var maxRetries = 20;  // 10 seconds total (20 * 500ms)
                
                function doSync() {{
                    retries++;
                    
                    // Get chart objects fresh each retry (they may be created after script starts)
                    var chart1 = window["{subchart.id.replace('window.', '')}"];
                    var chart2 = window["{sync_id.replace('window.', '')}"];
                    
                    console.log("[DEBUG] syncCharts attempt " + retries + 
                                ": chart1=" + !!chart1 + " chart1.wrapper=" + !!(chart1 && chart1.wrapper) +
                                " chart2=" + !!chart2 + " chart2.wrapper=" + !!(chart2 && chart2.wrapper));
                    
                    // Check if both charts and their wrappers exist
                    if (!chart1 || !chart1.wrapper || !chart2 || !chart2.wrapper) {{
                        if (retries < maxRetries) {{
                            setTimeout(doSync, 500);
                            return;
                        }} else {{
                            console.error("[DEBUG] syncCharts failed after " + maxRetries + " retries: charts not ready");
                            console.error("[DEBUG] chart1=" + !!chart1 + " chart2=" + !!chart2);
                            return;
                        }}
                    }}
                    
                    console.log("[DEBUG] Calling Lib.Handler.syncCharts for " + "{subchart.id}" + " and " + "{sync_id}");
                    try {{
                        Lib.Handler.syncCharts(chart1, chart2, {jbool(sync_crosshairs_only)});
                        console.log("[DEBUG] syncCharts call completed successfully!");
                    }} catch(e) {{
                        console.error("[DEBUG] syncCharts error:", e);
                    }}
                }}
                
                // Start with a delay to ensure we're called after chart creation
                setTimeout(doSync, 500);
            }})();
        ''', run_last=True)
        return subchart

    def style(
        self,
        background_color: str = '#0c0d0f',
        hover_background_color: str = '#3c434c',
        click_background_color: str = '#50565E',
        active_background_color: str = 'rgba(0, 122, 255, 0.7)',
        muted_background_color: str = 'rgba(0, 122, 255, 0.3)',
        border_color: str = '#3C434C',
        color: str = '#d8d9db',
        active_color: str = '#ececed'
    ):
        self.run_script(f'Lib.Handler.setRootStyles({js_json(locals())});')


class SeriesCommon(Pane):
    def __init__(self, chart: 'AbstractChart', name: str = ''):
        super().__init__(chart.win)
        self._chart = chart
        if hasattr(chart, '_interval'):
            self._interval = chart._interval
        else:
            self._interval = 1
        self._last_bar = None
        self.name = name
        self.num_decimals = 2
        self.offset = 0
        self.data = pd.DataFrame()
        self.markers = {}

    def _set_interval(self, df: pd.DataFrame):
        if not pd.api.types.is_datetime64_any_dtype(df['time']):
            df['time'] = pd.to_datetime(df['time'])
        common_interval = df['time'].diff().value_counts()
        if common_interval.empty:
            return
        self._interval = common_interval.index[0].total_seconds()

        units = [
            pd.Timedelta(microseconds=df['time'].dt.microsecond.value_counts().index[0]),
            pd.Timedelta(seconds=df['time'].dt.second.value_counts().index[0]),
            pd.Timedelta(minutes=df['time'].dt.minute.value_counts().index[0]),
            pd.Timedelta(hours=df['time'].dt.hour.value_counts().index[0]),
            pd.Timedelta(days=df['time'].dt.day.value_counts().index[0]),
        ]
        self.offset = 0
        for value in units:
            value = value.total_seconds()
            if value == 0:
                continue
            elif value >= self._interval:
                break
            self.offset = value
            break

    @staticmethod
    def _format_labels(data, labels, index, exclude_lowercase):
        def rename(la, mapper):
            return [mapper[key] if key in mapper else key for key in la]
        if 'date' not in labels and 'time' not in labels:
            labels = labels.str.lower()
            if exclude_lowercase:
                labels = rename(labels, {exclude_lowercase.lower(): exclude_lowercase})
        if 'date' in labels:
            labels = rename(labels, {'date': 'time'})
        elif 'time' not in labels:
            data['time'] = index
            labels = [*labels, 'time']
        return labels

    def _df_datetime_format(self, df: pd.DataFrame, exclude_lowercase=None):
        df = df.copy()
        df.columns = self._format_labels(df, df.columns, df.index, exclude_lowercase)
        self._set_interval(df)
        if not pd.api.types.is_datetime64_any_dtype(df['time']):
            df['time'] = pd.to_datetime(df['time'])
        df['time'] = df['time'].astype('int64') // 10 ** 9
        return df

    def _series_datetime_format(self, series: pd.Series, exclude_lowercase=None):
        series = series.copy()
        series.index = self._format_labels(series, series.index, series.name, exclude_lowercase)
        series['time'] = self._single_datetime_format(series['time'])
        return series

    def _single_datetime_format(self, arg) -> float:
        if isinstance(arg, (str, int, float)) or not pd.api.types.is_datetime64_any_dtype(arg):
            try:
                arg = pd.to_datetime(arg, unit='ms')
            except ValueError:
                arg = pd.to_datetime(arg)
        
        # [FIX] If _interval is unset (default 1) or invalid, skip rounding
        # This prevents incorrect timestamp bucketing for charts that haven't loaded data
        if self._interval <= 1:
            return arg.timestamp()
        
        arg = self._interval * (arg.timestamp() // self._interval) + self.offset
        return arg

    def set(self, df: Optional[pd.DataFrame] = None, format_cols: bool = True):
        if df is None or df.empty:
            self.run_script(f'{self.id}.series.setData([])')
            self.data = pd.DataFrame()
            return
        if format_cols:
            df = self._df_datetime_format(df, exclude_lowercase=self.name)
        if self.name:
            if self.name not in df:
                raise NameError(f'No column named "{self.name}".')
            df = df.rename(columns={self.name: 'value'})
        self.data = df.copy()
        self._last_bar = df.iloc[-1]
        self.run_script(f'{self.id}.series.setData({js_data(df)}); ')

    def update(self, series: pd.Series):
        series = self._series_datetime_format(series, exclude_lowercase=self.name)
        if self.name in series.index:
            series.rename({self.name: 'value'}, inplace=True)
        if self._last_bar is not None and series['time'] != self._last_bar['time']:
            self.data.loc[self.data.index[-1]] = self._last_bar
            self.data = pd.concat([self.data, series.to_frame().T], ignore_index=True)
        self._last_bar = series
        self.run_script(f'''
            try {{
                if (typeof {self.id} !== 'undefined' && {self.id} && {self.id}.series && typeof {self.id}.series.update === 'function') {{
                    {self.id}.series.update({js_data(series)});
                }}
            }} catch(e) {{
                // Silently ignore - chart may be destroyed or not yet initialized
            }}
        ''')

    def _update_markers(self):
        markers = list(self.markers.values())
        markers.sort(key=lambda x: x['time'])
        self.run_script(f"""
            if ({self.id}.series && typeof {self.id}.series.setMarkers === 'function') {{
                {self.id}.series.setMarkers({json.dumps(markers)});
            }} else {{
                console.warn('setMarkers not supported on series for chart {self.id}');
            }}
        """)

    def marker_list(self, markers: list):
        """
        Creates multiple markers.\n
        :param markers: The list of markers to set. These should be in the format:\n
        [
            {"time": "2021-01-21", "position": "below", "shape": "circle", "color": "#2196F3", "text": ""},
            {"time": "2021-01-22", "position": "below", "shape": "circle", "color": "#2196F3", "text": ""},
            ...
        ]
        :return: a list of marker ids.
        """
        markers = markers.copy()
        marker_ids = []
        for marker in markers:
            marker_id = self.win._id_gen.generate()
            self.markers[marker_id] = {
                "time": self._single_datetime_format(marker['time']),
                "position": marker_position(marker['position']),
                "color": marker['color'],
                "shape": marker_shape(marker['shape']),
                "text": marker['text'],
            }
            marker_ids.append(marker_id)
        self._update_markers()
        return marker_ids

    def marker(self, time: Optional[datetime] = None, position: MARKER_POSITION = 'below',
               shape: MARKER_SHAPE = 'arrow_up', color: str = '#2196F3', text: str = ''
               ) -> str:
        """
        Creates a new marker.\n
        :param time: Time location of the marker. If no time is given, it will be placed at the last bar.
        :param position: The position of the marker.
        :param color: The color of the marker (rgb, rgba or hex).
        :param shape: The shape of the marker.
        :param text: The text to be placed with the marker.
        :return: The id of the marker placed.
        """
        try:
            formatted_time = self._last_bar['time'] if not time else self._single_datetime_format(time)
        except TypeError:
            raise TypeError('Chart marker created before data was set.')
        marker_id = self.win._id_gen.generate()

        self.markers[marker_id] = {
            "time": formatted_time,
            "position": marker_position(position),
            "color": color,
            "shape": marker_shape(shape),
            "text": text,
        }
        self._update_markers()
        return marker_id

    def remove_marker(self, marker_id: str):
        """
        Removes the marker with the given id.\n
        """
        self.markers.pop(marker_id)
        self._update_markers()

    def horizontal_line(self, price: NUM, color: str = 'rgb(122, 146, 202)', width: int = 2,
                        style: LINE_STYLE = 'solid', text: str = '', axis_label_visible: bool = True,
                        func: Optional[Callable] = None
                        ) -> 'HorizontalLine':
        """
        Creates a horizontal line at the given price.
        """
        return HorizontalLine(self, price, color, width, style, text, axis_label_visible, func)

    def trend_line(
        self,
        start_time: TIME,
        start_value: NUM,
        end_time: TIME,
        end_value: NUM,
        round: bool = False,
        line_color: str = '#1E80F0',
        width: int = 2,
        style: LINE_STYLE = 'solid',
        text: str = '',
        text_position: str = 'above',
        label_pos: float = 0.5,
    ) -> TwoPointDrawing:
        return TrendLine(*locals().values())

    def box(
        self,
        start_time: TIME,
        start_value: NUM,
        end_time: TIME,
        end_value: NUM,
        round: bool = False,
        color: str = '#1E80F0',
        fill_color: str = 'rgba(255, 255, 255, 0.2)',
        width: int = 2,
        style: LINE_STYLE = 'solid',
    ) -> TwoPointDrawing:
        return Box(*locals().values())

    def ray_line(
        self,
        start_time: TIME,
        value: NUM,
        round: bool = False,
        color: str = '#1E80F0',
        width: int = 2,
        style: LINE_STYLE = 'solid',
        text: str = ''
    ) -> RayLine:
    # TODO
        return RayLine(*locals().values())

    def vertical_line(
        self,
        time: TIME,
        color: str = '#1E80F0',
        width: int = 2,
        style: LINE_STYLE ='solid',
        text: str = ''
    ) -> VerticalLine:
        return VerticalLine(*locals().values())

    def clear_markers(self):
        """
        Clears the markers displayed on the data.\n
        """
        self.markers.clear()
        self._update_markers()

    def price_line(self, label_visible: bool = True, line_visible: bool = True, title: str = ''):
        self.run_script(f'''
        {self.id}.series.applyOptions({{
            lastValueVisible: {jbool(label_visible)},
            priceLineVisible: {jbool(line_visible)},
            title: '{title}',
        }})''')

    def create_price_line(self, price: float = 0.0, title: str = '', color: str = '#FF0000', width: int = 1, style: LINE_STYLE = 'solid') -> 'PriceLine':
        return PriceLine(self, price, title, color, width, style)

    def precision(self, precision: int):
        """
        Sets the precision and minMove.\n
        :param precision: The number of decimal places.
        """
        min_move = 1 / (10**precision)
        self.run_script(f'''
        {self.id}.series.applyOptions({{
            priceFormat: {{precision: {precision}, minMove: {min_move}}}
        }})''')
        self.num_decimals = precision

    def hide_data(self):
        self._toggle_data(False)

    def show_data(self):
        self._toggle_data(True)

    def _toggle_data(self, arg):
        self.run_script(f'''
        {self.id}.series.applyOptions({{visible: {jbool(arg)}}})
        if ('volumeSeries' in {self.id}) {self.id}.volumeSeries.applyOptions({{visible: {jbool(arg)}}})
        if ({self._chart.id}.legend) {{
            try {{
                {self._chart.id}.legend.updateSeriesVisibility('{self.name}')
            }} catch (e) {{
                console.warn('Legend sync failed:', e);
            }}
        }}
        ''')

    def vertical_span(
        self,
        start_time: Union[TIME, tuple, list],
        end_time: Optional[TIME] = None,
        color: str = 'rgba(252, 219, 3, 0.2)',
        round: bool = False
    ):
        """
        Creates a vertical line or span across the chart.\n
        Start time and end time can be used together, or end_time can be
        omitted and a single time or a list of times can be passed to start_time.
        """
        if round:
            start_time = self._single_datetime_format(start_time)
            end_time = self._single_datetime_format(end_time) if end_time else None
        return VerticalSpan(self, start_time, end_time, color)


class Line(SeriesCommon):
    def __init__(self, chart, name, color, style, width, price_line, price_label, price_scale_id=None, crosshair_marker=True):

        super().__init__(chart, name)
        self.color = color

        self.run_script(f'''
            {self.id} = {self._chart.id}.createLineSeries(
                "{name}",
                {{
                    color: '{color}',
                    lineStyle: {as_enum(style, LINE_STYLE)},
                    lineWidth: {width},
                    lastValueVisible: {jbool(price_label)},
                    priceLineVisible: {jbool(price_line)},
                    crosshairMarkerVisible: {jbool(crosshair_marker)},
                    priceScaleId: {f'"{price_scale_id}"' if price_scale_id else 'undefined'}
                    {"""autoscaleInfoProvider: () => ({
                            priceRange: {
                                minValue: 1_000_000_000,
                                maxValue: 0,
                            },
                        }),
                    """ if chart._scale_candles_only else ''}
                }}
            )
        null''')

    # def _set_trend(self, start_time, start_value, end_time, end_value, ray=False, round=False):
    #     if round:
    #         start_time = self._single_datetime_format(start_time)
    #         end_time = self._single_datetime_format(end_time)
    #     else:
    #         start_time, end_time = pd.to_datetime((start_time, end_time)).astype('int64') // 10 ** 9

    #     self.run_script(f'''
    #     {self._chart.id}.chart.timeScale().applyOptions({{shiftVisibleRangeOnNewBar: false}})
    #     {self.id}.series.setData(
    #         calculateTrendLine({start_time}, {start_value}, {end_time}, {end_value},
    #                             {self._chart.id}, {jbool(ray)}))
    #     {self._chart.id}.chart.timeScale().applyOptions({{shiftVisibleRangeOnNewBar: true}})
    #     ''')

    def delete(self):
        """
        Irreversibly deletes the line, as well as the object that contains the line.
        """
        self._chart._lines.remove(self) if self in self._chart._lines else None
        self.run_script(f'''
            {self.id}legendItem = {self._chart.id}.legend._lines.find((line) => line.series == {self.id}.series)
            if ({self.id}legendItem) {{
                {self._chart.id}.legend._lines = {self._chart.id}.legend._lines.filter((item) => item != {self.id}legendItem)
                try {{
                    if ({self.id}legendItem.row && {self.id}legendItem.row.parentNode) {{
                        {self.id}legendItem.row.parentNode.removeChild({self.id}legendItem.row)
                    }}
                }} catch(e) {{
                     console.warn('Delete legend item failed:', e)
                }}
            }}

            try {{
                {self._chart.id}.chart.removeSeries({self.id}.series)
            }} catch(e) {{
                console.warn('Remove series failed:', e)
            }}
            delete {self.id}legendItem
            delete {self.id}
        ''')


class Histogram(SeriesCommon):
    def __init__(self, chart, name, color, price_line, price_label, scale_margin_top, scale_margin_bottom):
        super().__init__(chart, name)
        self.color = color
        self.run_script(f'''
        {self.id} = {chart.id}.createHistogramSeries(
            "{name}",
            {{
                color: '{color}',
                lastValueVisible: {jbool(price_label)},
                priceLineVisible: {jbool(price_line)},
                priceScaleId: '{self.id}',
                priceFormat: {{type: "volume"}},
            }},
            // precision: 2,
        )
        {self.id}.series.priceScale().applyOptions({{
            scaleMargins: {{top:{scale_margin_top}, bottom: {scale_margin_bottom}}}
        }})''')

    def delete(self):
        """
        Irreversibly deletes the histogram.
        """
        self.run_script(f'''
            {self.id}legendItem = {self._chart.id}.legend._lines.find((line) => line.series == {self.id}.series)
            if ({self.id}legendItem) {{
                {self._chart.id}.legend._lines = {self._chart.id}.legend._lines.filter((item) => item != {self.id}legendItem)
                try {{
                    if ({self.id}legendItem.row && {self.id}legendItem.row.parentNode) {{
                        {self.id}legendItem.row.parentNode.removeChild({self.id}legendItem.row)
                    }}
                }} catch(e) {{
                   console.warn('Delete histogram legend item failed:', e)
                }}
            }}

            try {{
                {self._chart.id}.chart.removeSeries({self.id}.series)
            }} catch(e) {{
                console.warn('Remove histogram series failed:', e)
            }}
            delete {self.id}legendItem
            delete {self.id}
        ''')

    def scale(self, scale_margin_top: float = 0.0, scale_margin_bottom: float = 0.0):
        self.run_script(f'''
        {self.id}.series.priceScale().applyOptions({{
            scaleMargins: {{top: {scale_margin_top}, bottom: {scale_margin_bottom}}}
        }})''')


class Candlestick(SeriesCommon):
    def __init__(self, chart: 'AbstractChart'):
        super().__init__(chart)
        self._volume_up_color = 'rgba(83,141,131,0.8)'
        self._volume_down_color = 'rgba(200,127,130,0.8)'

        self.candle_data = pd.DataFrame()

        # self.run_script(f'{self.id}.makeCandlestickSeries()')

    def set(self, df: Optional[pd.DataFrame] = None, keep_drawings=False, chart_state: dict = None):
        """
        Sets the initial data for the chart.\n
        :param df: columns: date/time, open, high, low, close, volume (if volume enabled).
        :param keep_drawings: keeps any drawings made through the toolbox. Otherwise, they will be deleted.
        :param chart_state: Optional dict with chart state to restore. Keys:
            - barSpacing: float - horizontal zoom level
            - scrollPosition: float - horizontal scroll position  
            - autoScale: bool - whether price scale auto-scales
            - mode: int - price scale mode (0=normal, 1=log, 2=percentage, 3=indexed)
            When provided, applies this state atomically to prevent flicker.
        """
        if df is None or df.empty:
            self.run_script(f'{self.id}.series.setData([])')
            self.run_script(f'{self.id}.volumeSeries.setData([])')
            self.candle_data = pd.DataFrame()
            return
        
        df = self._df_datetime_format(df)
        
        # [REVERTED] Auto-correction removed as it caused label issues on chart
        # We accept Naive IST timestamps as "UTC" for display purposes
        
        self.candle_data = df.copy()
        self._last_bar = df.iloc[-1]
        
        # If chart_state provided, apply everything atomically in one JS call
        if chart_state:
            bar_spacing = chart_state.get('barSpacing')
            scroll_position = chart_state.get('scrollPosition')
            auto_scale = chart_state.get('autoScale', True)
            mode = chart_state.get('mode', 0)
            price_range_top = chart_state.get('priceRangeTop')
            price_range_bottom = chart_state.get('priceRangeBottom')
            
            # Build atomic JS that:
            # 1. Pre-applies priceScale options
            # 2. Pre-applies timeScale options (barSpacing)
            # 3. Sets data
            # 4. Applies scrollPosition (needs data to exist)
            # 5. Applies setPriceRange if we have vertical position data
            # All in one execution to prevent intermediate renders
            
            restore_js = f'''
                (function() {{
                    var chartHeight = {self.id}.chart.chartElement().clientHeight;
                    function logVertical(step) {{
                        try {{
                            var top = {self.id}.series.coordinateToPrice(0);
                            var bottom = {self.id}.series.coordinateToPrice(chartHeight);
                            console.log('[Restore ' + step + '] vertical: top=' + top + ' bottom=' + bottom);
                        }} catch(e) {{ console.log('[Restore ' + step + '] No vertical data yet'); }}
                    }}
                    
                    logVertical('0-Before');
                    
                    // NOTE: Do NOT call priceScale.applyOptions() here!
                    // ANY call to applyOptions() triggers a vertical recalculation
                    // The vertical position will be set by setPriceRange after all data loads
            '''
            
            if bar_spacing:
                restore_js += f'''
                    // 2. Pre-apply time scale (horizontal) zoom
                    {self.id}.chart.timeScale().applyOptions({{
                        barSpacing: {bar_spacing}
                    }});
                    logVertical('2-AfterBarSpacing');
                '''
            
            restore_js += f'''
                    // 3. Set the data
                    {self.id}.series.setData({js_data(df)});
                    logVertical('3-AfterSetData');
            '''
            
            if 'volume' in df:
                volume = df.drop(columns=['open', 'high', 'low', 'close']).rename(columns={'volume': 'value'})
                volume['color'] = self._volume_down_color
                volume.loc[df['close'] > df['open'], 'color'] = self._volume_up_color
                restore_js += f'''
                    {self.id}.volumeSeries.setData({js_data(volume)});
                    logVertical('3b-AfterVolume');
                '''
            
            if scroll_position is not None:
                restore_js += f'''
                    // 4. Apply scroll position (horizontal position)
                    {self.id}.chart.timeScale().scrollToPosition({scroll_position}, false);
                    logVertical('4-AfterScrollPosition');
                '''
            
            # NOTE: Vertical price range restoration is handled by mainwindow.py
            # AFTER extensions are applied, to prevent timing conflicts
            
            
            restore_js += '''
                    console.log('[Restore] Immediate restore complete');
                })();
            '''
            
            self.run_script(restore_js)
            
            # Handle lines
            for line in self._lines:
                if line.name not in df.columns:
                    continue
                line.set(df[['time', line.name]], format_cols=False)
        else:
            # Standard path - no chart_state, use default behavior
            self.run_script(f'{self.id}.series.setData({js_data(df)})')

            if 'volume' in df:
                volume = df.drop(columns=['open', 'high', 'low', 'close']).rename(columns={'volume': 'value'})
                volume['color'] = self._volume_down_color
                volume.loc[df['close'] > df['open'], 'color'] = self._volume_up_color
                self.run_script(f'{self.id}.volumeSeries.setData({js_data(volume)})')

            for line in self._lines:
                if line.name not in df.columns:
                    continue
                line.set(df[['time', line.name]], format_cols=False)
            
            # Set autoScale to true in case the user has dragged the price scale
            self.run_script(f'''
                if (!{self.id}.chart.priceScale("right").options.autoScale)
                    {self.id}.chart.priceScale("right").applyOptions({{autoScale: true}})
            ''')
            
            # Force visible range to last 300 bars
            data_len = len(df)
            if data_len > 0:
                start_idx = max(0, data_len - 300)
                from_time = int(df.iloc[start_idx]['time'])
                last_time = int(df.iloc[-1]['time'])
                bar_interval = self._interval if 0 < self._interval <= 86400 else 300
                margin_seconds = min(20 * bar_interval, 604800)
                to_time = int(last_time + margin_seconds)
                
                from datetime import datetime as dt
                logger.debug(f"DEBUG: Set Range - Len: {data_len}, Interval: {bar_interval}s")
                logger.debug(f"DEBUG:   From: {from_time} ({dt.fromtimestamp(from_time).strftime('%Y-%m-%d %H:%M')})")
                logger.debug(f"DEBUG:   To:   {to_time} ({dt.fromtimestamp(to_time).strftime('%Y-%m-%d %H:%M')})")
                
                self.run_script(f'''
                    setTimeout(() => {{
                        try {{
                            {self._chart.id}.chart.timeScale().setVisibleRange({{ from: {from_time}, to: {to_time} }});
                        }} catch (e) {{
                            {self._chart.id}.chart.timeScale().fitContent();
                        }}
                    }}, 50);
                ''')

        # Handle drawings
        if keep_drawings:
            self.run_script(f'{self._chart.id}.toolBox?._drawingTool.repositionOnTime()')
        else:
            self.run_script(f"{self._chart.id}.toolBox?.clearDrawings()")

    def update(self, series: pd.Series, _from_tick=False):
        """
        Updates the data from a bar;
        if series['time'] is the same time as the last bar, the last bar will be overwritten.\n
        :param series: labels: date/time, open, high, low, close, volume (if using volume).
        """
        series = self._series_datetime_format(series) if not _from_tick else series
        if self._last_bar is not None and series['time'] != self._last_bar['time']:
            if not self.candle_data.empty:
                self.candle_data.loc[self.candle_data.index[-1]] = self._last_bar
            else:
                 self.candle_data = pd.concat([self.candle_data, self._last_bar.to_frame().T], ignore_index=True)
            self.candle_data = pd.concat([self.candle_data, series.to_frame().T], ignore_index=True)
            self._chart.events.new_bar._emit(self)

        self._last_bar = series
        self.run_script(f'{self.id}.series.update({js_data(series)})')
        if 'volume' not in series:
            return
        volume = series.drop(['open', 'high', 'low', 'close']).rename({'volume': 'value'})
        volume['color'] = self._volume_up_color if series['close'] > series['open'] else self._volume_down_color
        self.run_script(f'{self.id}.volumeSeries.update({js_data(volume)})')

    def update_from_tick(self, series: pd.Series, cumulative_volume: bool = False):
        """
        Updates the data from a tick.\n
        :param series: labels: date/time, price, volume (if using volume).
        :param cumulative_volume: Adds the given volume onto the latest bar.
        """
        series = self._series_datetime_format(series)
        if self._last_bar is not None and series['time'] < self._last_bar['time']:
            raise ValueError(f'Trying to update tick of time "{pd.to_datetime(series["time"])}", which occurs before the last bar time of "{pd.to_datetime(self._last_bar["time"])}".')
        bar = pd.Series(dtype='float64')
        if self._last_bar is not None and series['time'] == self._last_bar['time']:
            bar = self._last_bar
            bar['high'] = max(self._last_bar['high'], series['price'])
            bar['low'] = min(self._last_bar['low'], series['price'])
            bar['close'] = series['price']
            if 'volume' in series:
                if cumulative_volume:
                    bar['volume'] += series['volume']
                else:
                    bar['volume'] = series['volume']
        else:
            # New bar - use tick price for all OHLC values
            # Note: We DON'T use prev_close as open because it corrupts data
            # (e.g., if market gaps up, we'd record wrong high/low)
            for key in ('open', 'high', 'low', 'close'):
                bar[key] = series['price']
            
            bar['time'] = series['time']
            if 'volume' in series:
                bar['volume'] = series['volume']
        self.update(bar, _from_tick=True)

    def price_scale(
        self,
        auto_scale: bool = True,
        mode: PRICE_SCALE_MODE = 'normal',
        invert_scale: bool = False,
        align_labels: bool = True,
        scale_margin_top: float = 0.2,
        scale_margin_bottom: float = 0.2,
        border_visible: bool = False,
        border_color: Optional[str] = None,
        text_color: Optional[str] = None,
        entire_text_only: bool = False,
        visible: bool = True,
        ticks_visible: bool = False,
        minimum_width: int = 0
    ):
        self.run_script(f'''
            {self.id}.series.priceScale().applyOptions({{
                autoScale: {jbool(auto_scale)},
                mode: {as_enum(mode, PRICE_SCALE_MODE)},
                invertScale: {jbool(invert_scale)},
                alignLabels: {jbool(align_labels)},
                scaleMargins: {{top: {scale_margin_top}, bottom: {scale_margin_bottom}}},
                borderVisible: {jbool(border_visible)},
                {f'borderColor: "{border_color}",' if border_color else ''}
                {f'textColor: "{text_color}",' if text_color else ''}
                entireTextOnly: {jbool(entire_text_only)},
                visible: {jbool(visible)},
                ticksVisible: {jbool(ticks_visible)},
                minimumWidth: {minimum_width}
            }})''')

    def candle_style(
            self, up_color: str = 'rgba(39, 157, 130, 100)', down_color: str = 'rgba(200, 97, 100, 100)',
            wick_visible: bool = True, border_visible: bool = True, border_up_color: str = '',
            border_down_color: str = '', wick_up_color: str = '', wick_down_color: str = ''):
        """
        Candle styling for each of its parts.\n
        If only `up_color` and `down_color` are passed, they will color all parts of the candle.
        """
        border_up_color = border_up_color if border_up_color else up_color
        border_down_color = border_down_color if border_down_color else down_color
        wick_up_color = wick_up_color if wick_up_color else up_color
        wick_down_color = wick_down_color if wick_down_color else down_color
        self.run_script(f"{self.id}.series.applyOptions({js_json(locals())})")

    def volume_config(self, scale_margin_top: float = 0.8, scale_margin_bottom: float = 0.0,
                      up_color='rgba(83,141,131,0.8)', down_color='rgba(200,127,130,0.8)'):
        """
        Configure volume settings.\n
        Numbers for scaling must be greater than 0 and less than 1.\n
        Volume colors must be applied prior to setting/updating the bars.\n
        """
        self._volume_up_color = up_color if up_color else self._volume_up_color
        self._volume_down_color = down_color if down_color else self._volume_down_color
        self.run_script(f'''
        {self.id}.volumeSeries.priceScale().applyOptions({{
            scaleMargins: {{
            top: {scale_margin_top},
            bottom: {scale_margin_bottom},
            }}
        }})''')


class AbstractChart(Candlestick, Pane):
    def __init__(self, window: Window, width: float = 1.0, height: float = 1.0,
                 scale_candles_only: bool = False, toolbox: bool = False,
                 autosize: bool = True, position: FLOAT = 'left'):
        Pane.__init__(self, window)

        self._lines = []
        self._scale_candles_only = scale_candles_only
        self._width = width
        self._height = height
        self.events: Events = Events(self)

        from lightweight_charts.polygon import PolygonAPI
        self.polygon: PolygonAPI = PolygonAPI(self)

        self.run_script(
            f'{self.id} = new Lib.Handler("{self.id}", {width}, {height}, "{position}", {jbool(autosize)})')

        Candlestick.__init__(self, self)

        self.topbar: TopBar = TopBar(self)
        if toolbox:
            self.toolbox: ToolBox = ToolBox(self)

    def fit(self):
        """
        Fits the maximum amount of the chart data within the viewport.
        """
        self.run_script(f'{self.id}.chart.timeScale().fitContent()')

    def create_line(
            self, name: str = '', color: str = 'rgba(214, 237, 255, 0.6)',
            style: LINE_STYLE = 'solid', width: int = 2,
            price_line: bool = True, price_label: bool = True, price_scale_id: Optional[str] = None,
            crosshair_marker: bool = True
    ) -> Line:
        """
        Creates and returns a Line object.
        """
        self._lines.append(Line(self, name, color, style, width, price_line, price_label, price_scale_id, crosshair_marker))
        return self._lines[-1]

    def create_histogram(
            self, name: str = '', color: str = 'rgba(214, 237, 255, 0.6)',
            price_line: bool = True, price_label: bool = True,
            scale_margin_top: float = 0.0, scale_margin_bottom: float = 0.0
    ) -> Histogram:
        """
        Creates and returns a Histogram object.
        """
        return Histogram(
            self, name, color, price_line, price_label,
            scale_margin_top, scale_margin_bottom)

    def lines(self) -> List[Line]:
        """
        Returns all lines for the chart.
        """
        return self._lines.copy()

    def set_visible_range(self, start_time: TIME, end_time: TIME):
        self.run_script(f'''
        {self.id}.chart.timeScale().setVisibleRange({{
            from: {pd.to_datetime(start_time).timestamp()},
            to: {pd.to_datetime(end_time).timestamp()}
        }})
        ''')

    def resize(self, width: Optional[float] = None, height: Optional[float] = None):
        """
        Resizes the chart within the window.
        Dimensions should be given as a float between 0 and 1.
        """
        self._width = width if width is not None else self._width
        self._height = height if height is not None else self._height
        self.run_script(f'''
        {self.id}.scale.width = {self._width}
        {self.id}.scale.height = {self._height}
        if ({self.id} && typeof {self.id}.reSize === 'function') {{
            {self.id}.reSize()
        }} else {{
            console.warn("[Resize] {self.id}.reSize is not a function/object. Exists:", !!{self.id});
        }}
        ''')

    def time_scale(self, right_offset: int = 0, min_bar_spacing: float = 0.5,
                   visible: bool = True, time_visible: bool = True, seconds_visible: bool = False,
                   border_visible: bool = True, border_color: Optional[str] = None):
        """
        Options for the timescale of the chart.
        """
        self.run_script(f'''{self.id}.chart.applyOptions({{timeScale: {js_json(locals())}}})''')

    def layout(self, background_color: str = '#000000', text_color: Optional[str] = None,
               font_size: Optional[int] = None, font_family: Optional[str] = None):
        """
        Global layout options for the chart.
        """
        self.run_script(f"""
            document.getElementById('container').style.backgroundColor = '{background_color}'
            {self.id}.chart.applyOptions({{
            layout: {{
                background: {{color: "{background_color}"}},
                {f'textColor: "{text_color}",' if text_color else ''}
                {f'fontSize: {font_size},' if font_size else ''}
                {f'fontFamily: "{font_family}",' if font_family else ''}
            }}}})""")

    def grid(self, vert_enabled: bool = True, horz_enabled: bool = True,
             color: str = 'rgba(29, 30, 38, 5)', style: LINE_STYLE = 'solid'):
        """
        Grid styling for the chart.
        """
        self.run_script(f"""
           {self.id}.chart.applyOptions({{
           grid: {{
               vertLines: {{
                   visible: {jbool(vert_enabled)},
                   color: "{color}",
                   style: {as_enum(style, LINE_STYLE)},
               }},
               horzLines: {{
                   visible: {jbool(horz_enabled)},
                   color: "{color}",
                   style: {as_enum(style, LINE_STYLE)},
               }},
           }}
           }})""")

    def crosshair(
        self,
        mode: CROSSHAIR_MODE = 'normal',
        vert_visible: bool = True,
        vert_width: int = 1,
        vert_color: Optional[str] = None,
        vert_style: LINE_STYLE = 'large_dashed',
        vert_label_background_color: str = 'rgb(46, 46, 46)',
        horz_visible: bool = True,
        horz_width: int = 1,
        horz_color: Optional[str] = None,
        horz_style: LINE_STYLE = 'large_dashed',
        horz_label_background_color: str = 'rgb(55, 55, 55)'
    ):
        """
        Crosshair formatting for its vertical and horizontal axes.
        """
        self.run_script(f'''
        {self.id}.chart.applyOptions({{
            crosshair: {{
                mode: {as_enum(mode, CROSSHAIR_MODE)},
                vertLine: {{
                    visible: {jbool(vert_visible)},
                    width: {vert_width},
                    {f'color: "{vert_color}",' if vert_color else ''}
                    style: {as_enum(vert_style, LINE_STYLE)},
                    labelBackgroundColor: "{vert_label_background_color}"
                }},
                horzLine: {{
                    visible: {jbool(horz_visible)},
                    width: {horz_width},
                    {f'color: "{horz_color}",' if horz_color else ''}
                    style: {as_enum(horz_style, LINE_STYLE)},
                    labelBackgroundColor: "{horz_label_background_color}"
                }}
            }}
        }})''')

    def watermark(self, text: str, font_size: int = 44, color: str = 'rgba(180, 180, 200, 0.5)'):
        """
        Adds a watermark to the chart.
        """
        self.run_script(f'''
          {self.id}.chart.applyOptions({{
              watermark: {{
                  visible: true,
                  horzAlign: 'center',
                  vertAlign: 'center',
                  ...{js_json(locals())}
              }}
          }})''')

    def legend(self, visible: bool = False, ohlc: bool = True, percent: bool = True, lines: bool = True,
               color: str = 'rgb(191, 195, 203)', font_size: int = 11, font_family: str = 'Monaco',
               text: str = '', color_based_on_candle: bool = False):
        """
        Configures the legend of the chart.
        """
        l_id = f'{self.id}.legend'
        if not visible:
            self.run_script(f'''
            {l_id}.div.style.display = "none"
            {l_id}.ohlcEnabled = false
            {l_id}.percentEnabled = false
            {l_id}.linesEnabled = false
            ''')
            return
        self.run_script(f'''
        {l_id}.div.style.display = 'flex'
        {l_id}.ohlcEnabled = {jbool(ohlc)}
        {l_id}.percentEnabled = {jbool(percent)}
        {l_id}.linesEnabled = {jbool(lines)}
        {l_id}.colorBasedOnCandle = {jbool(color_based_on_candle)}
        {l_id}.div.style.color = '{color}'
        {l_id}.color = '{color}'
        {l_id}.div.style.fontSize = '{font_size}px'
        {l_id}.div.style.fontFamily = '{font_family}'
        {l_id}.text.innerText = '{text}'
        ''')

    def add_legend_item(self, name: str, color: str, callback: callable, initial_state: bool = True):
        """
        Add a custom toggleable legend item for non-series indicators.
        
        Args:
            name: Display name in the legend
            color: Color of the indicator symbol
            callback: Python function called with (visible: bool) when toggled
            initial_state: Initial visibility state (True = visible)
        """
        # [SPLIT CHART FIX] Include chart ID in callback to isolate per-chart
        callback_id = f'legend_toggle_{name.replace(" ", "_").lower()}_{self.id}'
        
        # Register Python callback
        self.win.handlers[callback_id] = lambda state_str: callback(state_str == 'true')
        
        # Create legend row with toggle switch
        self.run_script(f'''
            (function() {{
                const legend = {self.id}.legend;
                if (!legend) return;
                
                // Check if already exists
                if (legend._customItems && legend._customItems['{name}']) return;
                if (!legend._customItems) legend._customItems = {{}};
                
                const row = document.createElement('div');
                row.style.display = 'flex';
                row.style.alignItems = 'center';
                row.style.marginRight = '10px';
                
                const colorBox = document.createElement('span');
                colorBox.style.color = '{color}';
                colorBox.innerHTML = '▨';
                colorBox.style.marginRight = '5px';
                
                const nameSpan = document.createElement('span');
                nameSpan.innerText = '{name}';
                nameSpan.style.marginRight = '8px';
                
                const toggle = document.createElement('div');
                toggle.classList.add('legend-toggle-switch');
                toggle.style.cursor = 'pointer';
                toggle.style.width = '22px';
                toggle.style.height = '16px';
                toggle.style.display = 'flex';
                toggle.style.alignItems = 'center';
                toggle.style.justifyContent = 'center';
                
                // SVG eye icons
                const eyeOpen = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
                const eyeClosed = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
                
                let visible = {str(initial_state).lower()};
                toggle.innerHTML = visible ? eyeOpen : eyeClosed;
                toggle.style.opacity = visible ? '1' : '0.5';
                nameSpan.style.opacity = visible ? '1' : '0.5';
                colorBox.style.opacity = visible ? '1' : '0.5';
                
                toggle.onclick = function() {{
                    visible = !visible;
                    toggle.innerHTML = visible ? eyeOpen : eyeClosed;
                    toggle.style.opacity = visible ? '1' : '0.5';
                    nameSpan.style.opacity = visible ? '1' : '0.5';
                    colorBox.style.opacity = visible ? '1' : '0.5';
                    window.callbackFunction('{callback_id}_~_' + visible);
                }};
                
                row.appendChild(colorBox);
                row.appendChild(nameSpan);
                row.appendChild(toggle);
                
                // Add to legend series container
                if (legend.seriesContainer) {{
                    legend.seriesContainer.appendChild(row);
                }} else {{
                    legend.div.appendChild(row);
                }}
                
                legend._customItems['{name}'] = {{ row: row, visible: visible }};
            }})();
        ''')

    def spinner(self, visible):
        self.run_script(f"{self.id}.spinner.style.display = '{'block' if visible else 'none'}'")

    def hotkey(self, modifier_key: Literal['ctrl', 'alt', 'shift', 'meta', None],
               keys: Union[str, tuple, int], func: Callable):
        if not isinstance(keys, tuple):
            keys = (keys,)
        for key in keys:
            key = str(key)
            if key.isalnum() and len(key) == 1:
                key_code = f'Digit{key}' if key.isdigit() else f'Key{key.upper()}'
                key_condition = f'event.code === "{key_code}"'
            else:
                key_condition = f'event.key === "{key}"'
            if modifier_key is not None:
                key_condition += f'&& event.{modifier_key}Key'

            self.run_script(f'''
                    {self.id}.commandFunctions.unshift((event) => {{
                        if ({key_condition}) {{
                            event.preventDefault()
                            window.callbackFunction(`{modifier_key, keys}_~_{key}`)
                            return true
                        }}
                        else return false
                    }})''')
        self.win.handlers[f'{modifier_key, keys}'] = func

    def create_table(
        self,
        width: NUM,
        height: NUM,
        headings: tuple,
        widths: Optional[tuple] = None,
        alignments: Optional[tuple] = None,
        position: FLOAT = 'left',
        draggable: bool = False,
        background_color: str = '#121417',
        border_color: str = 'rgb(70, 70, 70)',
        border_width: int = 1,
        heading_text_colors: Optional[tuple] = None,
        heading_background_colors: Optional[tuple] = None,
        return_clicked_cells: bool = False,
        func: Optional[Callable] = None
    ) -> Table:
        args = locals()
        del args['self']
        return self.win.create_table(*args.values())

    def screenshot(self) -> bytes:
        """
        Takes a screenshot. This method can only be used after the chart window is visible.
        :return: a bytes object containing a screenshot of the chart.
        """
        serial_data = self.win.run_script_and_get(f'{self.id}.chart.takeScreenshot().toDataURL()')
        return b64decode(serial_data.split(',')[1])

    def create_subchart(self, position: FLOAT = 'left', width: float = 0.5, height: float = 0.5,
                        sync: Optional[Union[str, bool]] = None, scale_candles_only: bool = False,
                        sync_crosshairs_only: bool = False,
                        toolbox: bool = False) -> 'AbstractChart':
        import logging
        logger = logging.getLogger("lightweight_charts")
        logger.info(f"[DEBUG] AbstractChart.create_subchart called: sync={sync}, self.id={self.id}")
        if sync is True:
            sync = self.id
            logger.info(f"[DEBUG] sync=True converted to sync={sync}")
        result = self.win.create_subchart(
            position=position,
            width=width,
            height=height,
            sync_id=sync,
            scale_candles_only=scale_candles_only,
            sync_crosshairs_only=sync_crosshairs_only,
            toolbox=toolbox
        )
        logger.info(f"[DEBUG] Window.create_subchart returned subchart.id={result.id}")
        return result
