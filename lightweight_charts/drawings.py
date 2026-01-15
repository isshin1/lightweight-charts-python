import asyncio
import json
import pandas as pd

from typing import Union, Optional

from lightweight_charts.util import js_json

from .util import NUM, Pane, as_enum, LINE_STYLE, TIME, snake_to_camel

def make_js_point(chart, time, price):
    formatted_time = chart._single_datetime_format(time)
    return f'''{{
        "time": {formatted_time},
        "logical": {chart.id}.chart.timeScale()
                    .coordinateToLogical(
                        {chart.id}.chart.timeScale()
                        .timeToCoordinate({formatted_time})
                    ),
        "price": {price}
    }}'''

class Drawing(Pane):
    def __init__(self, chart, func=None):
        super().__init__(chart.win)
        self.chart = chart

    def update(self, *points):
        formatted_points = []
        for i in range(0, len(points), 2):
            formatted_points.append(make_js_point(self.chart, points[i], points[i + 1]))
        self.run_script(f'{self.id}.updatePoints({", ".join(formatted_points)})')


    def delete(self):
        """
        Irreversibly deletes the drawing.
        """
        self.run_script(f'{self.id}.detach()')

    def options(self, color='#1E80F0', style='solid', width=4):
        self.run_script(f'''{self.id}.applyOptions({{
            lineColor: '{color}',
            lineStyle: {as_enum(style, LINE_STYLE)},
            width: {width},
        }})''')

class TwoPointDrawing(Drawing):
    def __init__(
        self,
        drawing_type,
        chart,
        start_time: TIME,
        start_value: NUM,
        end_time: TIME,
        end_value: NUM,
        round: bool,
        options: dict,
        func=None
    ):
        super().__init__(chart, func)



        options_string = '\n'.join(f'{key}: {val},' for key, val in options.items())

        self.run_script(f'''
        {self.id} = new Lib.{drawing_type}(
            {make_js_point(self.chart, start_time, start_value)},
            {make_js_point(self.chart, end_time, end_value)},
            {{
                {options_string}
            }}
        )
        if ({chart.id}.series && {chart.id}.series.attachPrimitive) {{
            {chart.id}.series.attachPrimitive({self.id})
        }} else {{
            console.warn('[TwoPointDrawing] attachPrimitive missing for', {chart.id});
        }}
        ''')


class HorizontalLine(Drawing):
    def __init__(self, chart, price, color, width, style, text, axis_label_visible, func):
        super().__init__(chart, func)
        self.price = price
        self.run_script(f'''

        {self.id} = new Lib.HorizontalLine(
            {{price: {price}}},
            {{
                lineColor: '{color}',
                lineStyle: {as_enum(style, LINE_STYLE)},
                width: {width},
                text: `{text}`,
            }},
            callbackName={f"'{self.id}'" if func else 'null'}
        )
        if ({chart.id}.series && {chart.id}.series.attachPrimitive) {{
            {chart.id}.series.attachPrimitive({self.id})
        }} else {{
            console.warn('[HorizontalLine] attachPrimitive missing for', {chart.id});
        }}
        ''')
        if not func:
            return

        def wrapper(p):
            self.price = float(p)
            func(chart, self)

        async def wrapper_async(p):
            self.price = float(p)
            await func(chart, self)

        self.win.handlers[self.id] = wrapper_async if asyncio.iscoroutinefunction(func) else wrapper
        self.run_script(f'{chart.id}.toolBox?.addNewDrawing({self.id})')

    def update(self, price: float):
        """
        Moves the horizontal line to the given price.
        """
        self.run_script(f'{self.id}.updatePoints({{price: {price}}})')
        # self.run_script(f'{self.id}.updatePrice({price})')
        self.price = price

    def options(self, color='#1E80F0', style='solid', width=4, text=''):
        super().options(color, style, width)
        self.run_script(f'{self.id}.applyOptions({{text: `{text}`}})')



class VerticalLine(Drawing):
    def __init__(self, chart, time, color, width, style, text, func=None):
        super().__init__(chart, func)
        self.time = time
        self.run_script(f'''

        {self.id} = new Lib.VerticalLine(
            {{time: {self.chart._single_datetime_format(time)}}},
            {{
                lineColor: '{color}',
                lineStyle: {as_enum(style, LINE_STYLE)},
                width: {width},
                text: `{text}`,
            }},
            callbackName={f"'{self.id}'" if func else 'null'}
        )
        if ({chart.id}.series && {chart.id}.series.attachPrimitive) {{
            {chart.id}.series.attachPrimitive({self.id})
        }} else {{
            console.warn('[VerticalLine] attachPrimitive missing for', {chart.id});
        }}
        ''')

    def update(self, time: TIME):
        self.run_script(f'{self.id}.updatePoints({{time: {time}}})')
        # self.run_script(f'{self.id}.updatePrice({price})')
        self.price = price

    def options(self, color='#1E80F0', style='solid', width=4, text=''):
        super().options(color, style, width)
        self.run_script(f'{self.id}.applyOptions({{text: `{text}`}})')


class RayLine(Drawing):
    def __init__(self,
        chart,
        start_time: TIME,
        value: NUM,
        round: bool = False,
        color: str = '#1E80F0',
        width: int = 2,
        style: LINE_STYLE = 'solid',
        text: str = '',
        func = None,
    ):
        super().__init__(chart, func)
        self.run_script(f'''
        {self.id} = new Lib.RayLine(
            {{time: {self.chart._single_datetime_format(start_time)}, price: {value}}},
            {{
                lineColor: '{color}',
                lineStyle: {as_enum(style, LINE_STYLE)},
                width: {width},
                text: `{text}`,
            }},
            callbackName={f"'{self.id}'" if func else 'null'}
        )
        if ({chart.id}.series && {chart.id}.series.attachPrimitive) {{
            {chart.id}.series.attachPrimitive({self.id})
        }} else {{
            console.warn('[RayLine] attachPrimitive missing for', {chart.id});
        }}
        ''')




class Box(TwoPointDrawing):
    def __init__(self,
        chart,
        start_time: TIME,
        start_value: NUM,
        end_time: TIME,
        end_value: NUM,
        round: bool,
        line_color: str,
        fill_color: str,
        width: int,
        style: LINE_STYLE,
        func=None):

        super().__init__(
            "Box",
            chart,
            start_time,
            start_value,
            end_time,
            end_value,
            round,
            {
                "lineColor": f'"{line_color}"',
                "fillColor": f'"{fill_color}"',
                "width": width,
                "lineStyle": as_enum(style, LINE_STYLE)
            },
            func
        )


class TrendLine(TwoPointDrawing):
    def __init__(self,
        chart,
        start_time: TIME,
        start_value: NUM,
        end_time: TIME,
        end_value: NUM,
        round: bool,
        line_color: str,
        width: int,
        style: LINE_STYLE,
        text: str = '',
        text_position: str = 'above',
        func=None):

        super().__init__(
            "TrendLine",
            chart,
            start_time,
            start_value,
            end_time,
            end_value,
            round,
            {
                "lineColor": f'"{line_color}"',
                "width": width,
                "lineStyle": as_enum(style, LINE_STYLE),
                "text": f'"{text}"',
                "textPosition": f'"{text_position}"',
            },
            func
        )

# TODO reimplement/fix
class VerticalSpan(Pane):
    def __init__(self, series: 'SeriesCommon', start_time: Union[TIME, tuple, list], end_time: Optional[TIME] = None,
                 color: str = 'rgba(252, 219, 3, 0.2)'):
        self._chart = series._chart
        super().__init__(self._chart.win)
        start_time, end_time = pd.to_datetime(start_time), pd.to_datetime(end_time)
        self.run_script(f'''
        {self.id} = {self._chart.id}.chart.addHistogramSeries({{
                color: '{color}',
                priceFormat: {{type: 'volume'}},
                priceScaleId: 'vertical_line',
                lastValueVisible: false,
                priceLineVisible: false,
        }})
        {self.id}.priceScale('').applyOptions({{
            scaleMargins: {{top: 0, bottom: 0}}
        }})
        ''')
        if end_time is None:
            if isinstance(start_time, pd.DatetimeIndex):
                data = [{'time': time.timestamp(), 'value': 1} for time in start_time]
            else:
                data = [{'time': start_time.timestamp(), 'value': 1}]
            self.run_script(f'{self.id}.setData({data})')
        else:
            self.run_script(f'''
            {self.id}.setData(calculateTrendLine(
            {start_time.timestamp()}, 1, {end_time.timestamp()}, 1, {series.id}))
            ''')

    def delete(self):
        """
        Irreversibly deletes the vertical span.
        """
        self.run_script(f'{self._chart.id}.chart.removeSeries({self.id})')


class PriceLine(Pane):
    def __init__(self, series, price, title, color, width, style):
        super().__init__(series._chart.win)
        self._series = series
        # Safe ID handling: ensure we access window explicitly
        # self.id is likely 'window.abcdef'. We want 'abcdef'.
        var_name = self.id.split('.')[1] if '.' in self.id else self.id
        
        self.run_script(f'''
        try {{
            console.log("[PriceLine] Init start for price {price}");
            if (typeof {series.id} !== 'undefined' && {series.id}.series) {{
                window['{var_name}'] = {series.id}.series.createPriceLine({{
                    price: {price},
                    title: '{title}',
                    color: '{color}',
                    lineWidth: {width},
                    lineStyle: {as_enum(style, LINE_STYLE)},
                    axisLabelVisible: {str(title != "").lower()}
                }});
                console.log("[PriceLine] Created successfully: {var_name}");
            }} else {{
                console.error("[PriceLine] Series not found for {var_name}");
            }}
        }} catch(e) {{
            console.error("[PriceLine] Creation FAILED:", e);
        }}''')

    def delete(self):
        var_name = self.id.split('.')[1] if '.' in self.id else self.id
        self.run_script(f'''
        try {{
            console.log("[PriceLine] Request delete {var_name}");
            if (typeof window['{var_name}'] !== 'undefined') {{
                {self._series.id}.series.removePriceLine(window['{var_name}']);
                delete window['{var_name}'];
                console.log("[PriceLine] Deleted {var_name}");
            }} else {{
                 console.warn("[PriceLine] Delete skipped: {var_name} not found");
            }}
        }} catch(e) {{
            console.error("[PriceLine] Deletion failed:", e);
        }}''')

    def update(self, price):
        var_name = self.id.split('.')[1] if '.' in self.id else self.id
        self.run_script(f'''
        try {{
            if (typeof window['{var_name}'] !== 'undefined') {{
                window['{var_name}'].applyOptions({{price: {price}}});
            }}
        }} catch(e) {{
            console.error("[PriceLine] Update failed:", e);
        }}''')
