import {
    ColorType,
    CrosshairMode,
    DeepPartial,
    HistogramStyleOptions,
    IChartApi,
    ISeriesApi,
    LineStyleOptions,
    LogicalRange,
    LogicalRangeChangeEventHandler,
    MouseEventHandler,
    MouseEventParams,
    SeriesOptionsCommon,
    SeriesType,
    Time,
    createChart
} from "lightweight-charts";

import { GlobalParams, globalParamInit } from "./global-params";
import { Legend } from "./legend";
import { ToolBox } from "./toolbox";
import { TopBar } from "./topbar";
import { registerChartForCountdown } from "../countdown-timer";


export interface Scale {
    width: number,
    height: number,
}


globalParamInit();
declare const window: GlobalParams;

export class Handler {
    public id: string;
    public commandFunctions: Function[] = [];

    public wrapper: HTMLDivElement;
    public div: HTMLDivElement;

    public chart: IChartApi;
    public scale: Scale;
    public precision: number = 2;

    public series: ISeriesApi<SeriesType>;
    public volumeSeries: ISeriesApi<SeriesType>;

    public legend: Legend;
    private _topBar: TopBar | undefined;
    public toolBox: ToolBox | undefined;
    public spinner: HTMLDivElement | undefined;
    public alertPlugin: any;  // AlertPlugin from external JS file
    public orderPlugin: any;  // OrderPlugin from external JS file

    public _seriesList: ISeriesApi<SeriesType>[] = [];

    // TODO find a better solution rather than the 'position' parameter
    constructor(
        chartId: string,
        innerWidth: number,
        innerHeight: number,
        position: string,
        autoSize: boolean
    ) {
        this.reSize = this.reSize.bind(this)

        this.id = chartId

        // Register in global handlers array for split view support
        window.activeHandler = this;
        if (!window.allChartHandlers) window.allChartHandlers = [];
        window.allChartHandlers.push(this);

        this.scale = {
            width: innerWidth,
            height: innerHeight,
        }

        this.wrapper = document.createElement('div')
        this.wrapper.classList.add("handler");
        this.wrapper.style.float = position

        this.div = document.createElement('div')
        this.div.style.position = 'relative'

        this.wrapper.appendChild(this.div);
        window.containerDiv.append(this.wrapper)

        this.chart = this._createChart();
        this.series = this.createCandlestickSeries();
        this.volumeSeries = this.createVolumeSeries();

        // Register for async countdown timer updates (updates every second independent of ticks)
        try {
            const chartInternal = this.chart as any;
            const chartWidget = chartInternal._private__chartWidget;
            if (chartWidget) {
                const model = typeof chartWidget._internal_model === 'function'
                    ? chartWidget._internal_model()
                    : chartWidget._private__model;
                if (model) {
                    registerChartForCountdown(model);
                }
            }
        } catch (e) {
            console.error('[Handler] Failed to register for countdown timer:', e);
        }

        this.legend = new Legend(this)

        // Initialize AlertPlugin if available (loaded from external JS file)
        try {
            // @ts-ignore - AlertPlugin is defined in alert_plugin.js
            if (typeof AlertPlugin !== 'undefined') {
                // @ts-ignore
                this.alertPlugin = new AlertPlugin(this);
                console.log('AlertPlugin Created');
            }
        } catch (e) {
            console.error('AlertPlugin Init Fail', e);
        }

        // Initialize OrderPlugin if available (loaded from external JS file)
        try {
            // @ts-ignore - OrderPlugin is defined in order_plugin.js
            if (typeof OrderPlugin !== 'undefined') {
                // @ts-ignore
                this.orderPlugin = new OrderPlugin(this);
                console.log('OrderPlugin Created');
            }
        } catch (e) {
            console.error('OrderPlugin Init Fail', e);
        }

        document.addEventListener('keydown', (event) => {
            for (let i = 0; i < this.commandFunctions.length; i++) {
                if (this.commandFunctions[i](event)) break
            }
        })
        window.handlerInFocus = this.id;
        this.wrapper.addEventListener('mouseover', () => {
            window.handlerInFocus = this.id;
            window.activeHandler = this;
        })

        // [FIX] Auto-initialize context menu for this chart
        // Emit event for chart_context_menu.js to handle
        this._initContextMenu();

        this.reSize()
        if (!autoSize) return
        window.addEventListener('resize', () => this.reSize())
    }

    /**
     * Initialize context menu for this chart by emitting a chartCreated event.
     * The chart_context_menu.js module listens for this event and sets up the menu.
     */
    private _initContextMenu() {
        // Emit custom event for chart_context_menu.js to handle
        const event = new CustomEvent('chartCreated', {
            detail: { chartId: this.id, handler: this }
        });
        document.dispatchEvent(event);
        console.log('[Handler] Emitted chartCreated event for', this.id);
    }


    reSize() {
        let topBarOffset = this.scale.height !== 0 ? this._topBar?._div.offsetHeight || 0 : 0
        this.chart.resize(window.innerWidth * this.scale.width, (window.innerHeight * this.scale.height) - topBarOffset)
        this.wrapper.style.width = `${100 * this.scale.width}%`
        this.wrapper.style.height = `${100 * this.scale.height}%`

        // TODO definitely a better way to do this
        if (this.scale.height === 0 || this.scale.width === 0) {
            // if (this.legend.div.style.display == 'flex') this.legend.div.style.display = 'none'
            if (this.toolBox) {
                this.toolBox.div.style.display = 'none'
            }
        }
        else {
            // this.legend.div.style.display = 'flex'
            if (this.toolBox) {
                this.toolBox.div.style.display = 'flex'
            }
        }
    }

    private _createChart() {
        return createChart(this.div, {
            width: window.innerWidth * this.scale.width,
            height: window.innerHeight * this.scale.height,
            layout: {
                textColor: window.pane.color,
                background: {
                    color: '#000000',
                    type: ColorType.Solid,
                },
                fontSize: 12
            },
            rightPriceScale: {
                scaleMargins: { top: 0.3, bottom: 0.25 },
            },
            timeScale: { timeVisible: true, secondsVisible: false },
            crosshair: {
                mode: CrosshairMode.Normal,
                vertLine: {
                    labelBackgroundColor: 'rgb(46, 46, 46)'
                },
                horzLine: {
                    labelBackgroundColor: 'rgb(55, 55, 55)'
                }
            },
            grid: {
                vertLines: { color: 'rgba(29, 30, 38, 5)' },
                horzLines: { color: 'rgba(29, 30, 58, 5)' },
            },
            handleScroll: { vertTouchDrag: true },
        })
    }

    createCandlestickSeries() {
        const up = 'rgba(39, 157, 130, 100)'
        const down = 'rgba(200, 97, 100, 100)'
        const candleSeries = this.chart.addCandlestickSeries({
            upColor: up, borderUpColor: up, wickUpColor: up,
            downColor: down, borderDownColor: down, wickDownColor: down
        });
        candleSeries.priceScale().applyOptions({
            scaleMargins: { top: 0.2, bottom: 0.2 },
        });
        return candleSeries;
    }

    createVolumeSeries() {
        const volumeSeries = this.chart.addHistogramSeries({
            color: '#26a69a',
            priceFormat: { type: 'volume' },
            priceScaleId: 'volume_scale',
        })
        volumeSeries.priceScale().applyOptions({
            scaleMargins: { top: 0.8, bottom: 0 },
        });
        return volumeSeries;
    }

    createLineSeries(name: string, options: DeepPartial<LineStyleOptions & SeriesOptionsCommon>) {
        const line = this.chart.addLineSeries({ ...options });
        this._seriesList.push(line);
        this.legend.makeSeriesRow(name, line)
        return {
            name: name,
            series: line,
        }
    }

    createHistogramSeries(name: string, options: DeepPartial<HistogramStyleOptions & SeriesOptionsCommon>) {
        const line = this.chart.addHistogramSeries({ ...options });
        this._seriesList.push(line);
        this.legend.makeSeriesRow(name, line)
        return {
            name: name,
            series: line,
        }
    }

    createToolBox() {
        this.toolBox = new ToolBox(this.id, this.chart, this.series, this.commandFunctions);
        this.div.appendChild(this.toolBox.div);
    }

    createTopBar() {
        this._topBar = new TopBar(this);
        this.wrapper.prepend(this._topBar._div)
        return this._topBar;
    }

    /**
     * Set the visible price range for the chart.
     * Uses direct internal API access to avoid autoscale recalculation.
     */
    setPriceRange(topPrice: number, bottomPrice: number): void {
        try {
            console.log(`[setPriceRange] Called with top=${topPrice}, bottom=${bottomPrice}`);
            if (topPrice === bottomPrice || topPrice < bottomPrice) return;

            // Check if already at target position (within 0.1% tolerance)
            try {
                const h = this.chart.chartElement().clientHeight;
                const currentTop = this.series.coordinateToPrice(0);
                const currentBottom = this.series.coordinateToPrice(h);
                const range = topPrice - bottomPrice;
                const tolerance = range * 0.001; // 0.1% tolerance

                if (currentTop !== null && currentBottom !== null &&
                    Math.abs(currentTop - topPrice) < tolerance &&
                    Math.abs(currentBottom - bottomPrice) < tolerance) {
                    console.log('[setPriceRange] Already at target position, skipping');
                    // Just ensure autoScale is off
                    this.chart.priceScale('right').applyOptions({ autoScale: false });
                    return;
                }
            } catch (e) {
                // If we can't check, proceed with setPriceRange
            }

            const priceScale = this.chart.priceScale('right');
            const chartInternal = (this.chart as any);

            // Get the model through chartWidget
            const chartWidget = chartInternal._private__chartWidget;
            if (!chartWidget) {
                console.error('[setPriceRange] Cannot access chartWidget');
                return;
            }

            // Get model via internal method call
            const model = typeof chartWidget._internal_model === 'function'
                ? chartWidget._internal_model()
                : chartWidget._private__model;
            if (!model) {
                console.error('[setPriceRange] Cannot access chart model');
                return;
            }

            // Get the first pane and its default price scale
            const panes = model._private__panes;
            if (!panes || panes.length === 0) {
                console.error('[setPriceRange] No panes found');
                return;
            }

            const pane = panes[0];

            // Get internal price scale - try multiple paths
            let internalPS = null;

            // Path 1: _internal_defaultPriceScale() method
            if (typeof pane._internal_defaultPriceScale === 'function') {
                internalPS = pane._internal_defaultPriceScale();
            }
            // Path 2: Direct access via _private__defaultPriceScale
            else if (pane._private__defaultPriceScale) {
                internalPS = pane._private__defaultPriceScale;
            }
            // Path 3: Via _private__priceScales map
            else if (pane._private__priceScales && typeof pane._private__priceScales.get === 'function') {
                internalPS = pane._private__priceScales.get('right');
            }

            if (internalPS && typeof internalPS._internal_setPriceRange === 'function') {
                // Create a PriceRangeImpl-like object
                const priceRangeObj = {
                    _private__minValue: bottomPrice,
                    _private__maxValue: topPrice,
                    _internal_minValue: () => bottomPrice,
                    _internal_maxValue: () => topPrice,
                    _internal_length: () => topPrice - bottomPrice,
                    _internal_isEmpty: () => false,
                    _internal_equals: (other: any) => other && other._internal_minValue() === bottomPrice && other._internal_maxValue() === topPrice,
                    _internal_clone: function () { return this; }
                };

                // First disable autoScale to prevent recalculation
                priceScale.applyOptions({ autoScale: false });

                // Directly set the price range using internal API
                internalPS._internal_setPriceRange(priceRangeObj, true); // true = force set

                // Trigger a redraw
                if (typeof model._internal_lightUpdate === 'function') {
                    model._internal_lightUpdate();
                }

                console.log('[setPriceRange] Set via internal API');

                // Add delayed logging to track post-restore changes
                const self = this;
                const logVertical = (step: string) => {
                    try {
                        const h = self.chart.chartElement().clientHeight;
                        const t = self.series.coordinateToPrice(0);
                        const b = self.series.coordinateToPrice(h);
                        console.log(`[PostRestore ${step}] vertical: top=${t} bottom=${b}`);
                    } catch (e) { console.log(`[PostRestore ${step}] error`); }
                };

                setTimeout(() => logVertical('100ms'), 100);
                setTimeout(() => logVertical('300ms'), 300);
                setTimeout(() => logVertical('600ms'), 600);
                setTimeout(() => logVertical('1000ms'), 1000);
            } else {
                // Fallback: use autoscaleInfoProvider (causes a brief shift but works)
                console.log('[setPriceRange] Internal API not available, using autoscaleInfoProvider fallback');

                const series = this.series;
                (series as any).applyOptions({
                    autoscaleInfoProvider: () => ({
                        priceRange: {
                            minValue: bottomPrice,
                            maxValue: topPrice,
                        },
                    }),
                });

                priceScale.applyOptions({ autoScale: true });

                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        priceScale.applyOptions({ autoScale: false });
                        setTimeout(() => {
                            (series as any).applyOptions({ autoscaleInfoProvider: undefined });
                        }, 100);
                    });
                });
            }
        } catch (e) {
            console.error('[setPriceRange] error:', e);
        }
    }

    toJSON() {
        // Exclude the chart attribute from serialization
        const { chart, ...serialized } = this;
        return serialized;
    }

    public static syncCharts(childChart: Handler, parentChart: Handler, crosshairOnly = false) {
        function crosshairHandler(chart: Handler, point: any) {
            if (!point) {
                chart.chart.clearCrosshairPosition()
                return
            }
            chart.chart.setCrosshairPosition(point.value || point!.close, point.time, chart.series);
            chart.legend.legendHandler(point, true)
        }

        function getPoint(series: ISeriesApi<SeriesType>, param: MouseEventParams) {
            if (!param.time) return null;
            return param.seriesData.get(series) || null;
        }

        const childTimeScale = childChart.chart.timeScale();
        const parentTimeScale = parentChart.chart.timeScale();

        const setChildRange = (timeRange: LogicalRange | null) => {
            if (timeRange) childTimeScale.setVisibleLogicalRange(timeRange);
        }
        const setParentRange = (timeRange: LogicalRange | null) => {
            if (timeRange) parentTimeScale.setVisibleLogicalRange(timeRange);
        }

        // Throttled crosshair handlers using requestAnimationFrame
        let pendingParentCrosshair: any = null;
        let pendingChildCrosshair: any = null;
        let rafParent: number | null = null;
        let rafChild: number | null = null;

        const setParentCrosshair = (param: MouseEventParams) => {
            pendingParentCrosshair = { chart: parentChart, point: getPoint(childChart.series, param) };
            if (rafParent === null) {
                rafParent = requestAnimationFrame(() => {
                    if (pendingParentCrosshair) {
                        crosshairHandler(pendingParentCrosshair.chart, pendingParentCrosshair.point);
                    }
                    rafParent = null;
                });
            }
        }
        const setChildCrosshair = (param: MouseEventParams) => {
            pendingChildCrosshair = { chart: childChart, point: getPoint(parentChart.series, param) };
            if (rafChild === null) {
                rafChild = requestAnimationFrame(() => {
                    if (pendingChildCrosshair) {
                        crosshairHandler(pendingChildCrosshair.chart, pendingChildCrosshair.point);
                    }
                    rafChild = null;
                });
            }
        }

        let selected = parentChart
        function addMouseOverListener(
            thisChart: Handler,
            otherChart: Handler,
            thisCrosshair: MouseEventHandler<Time>,
            otherCrosshair: MouseEventHandler<Time>,
            thisRange: LogicalRangeChangeEventHandler,
            otherRange: LogicalRangeChangeEventHandler) {
            thisChart.wrapper.addEventListener('mouseover', () => {
                if (selected === thisChart) return
                selected = thisChart
                otherChart.chart.unsubscribeCrosshairMove(thisCrosshair)
                thisChart.chart.subscribeCrosshairMove(otherCrosshair)
                if (crosshairOnly) return;
                otherChart.chart.timeScale().unsubscribeVisibleLogicalRangeChange(thisRange)
                thisChart.chart.timeScale().subscribeVisibleLogicalRangeChange(otherRange)
            })
        }
        addMouseOverListener(
            parentChart,
            childChart,
            setParentCrosshair,
            setChildCrosshair,
            setParentRange,
            setChildRange
        )
        addMouseOverListener(
            childChart,
            parentChart,
            setChildCrosshair,
            setParentCrosshair,
            setChildRange,
            setParentRange
        )

        parentChart.chart.subscribeCrosshairMove(setChildCrosshair)

        const parentRange = parentTimeScale.getVisibleLogicalRange()
        if (parentRange) childTimeScale.setVisibleLogicalRange(parentRange)

        if (crosshairOnly) return;
        parentChart.chart.timeScale().subscribeVisibleLogicalRangeChange(setChildRange)
    }

    public static makeSearchBox(chart: Handler) {
        const searchWindow = document.createElement('div')
        searchWindow.classList.add('searchbox');
        searchWindow.style.display = 'none';

        const magnifyingGlass = document.createElement('div');
        magnifyingGlass.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="24px" height="24px" viewBox="0 0 24 24" version="1.1"><path style="fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;stroke:lightgray;stroke-opacity:1;stroke-miterlimit:4;" d="M 15 15 L 21 21 M 10 17 C 6.132812 17 3 13.867188 3 10 C 3 6.132812 6.132812 3 10 3 C 13.867188 3 17 6.132812 17 10 C 17 13.867188 13.867188 17 10 17 Z M 10 17 "/></svg>`

        const sBox = document.createElement('input');
        sBox.type = 'text';

        searchWindow.appendChild(magnifyingGlass)
        searchWindow.appendChild(sBox)
        chart.div.appendChild(searchWindow);

        chart.commandFunctions.push((event: KeyboardEvent) => {
            if (window.handlerInFocus !== chart.id || window.textBoxFocused) return false
            if (searchWindow.style.display === 'none') {
                if (/^[a-zA-Z0-9]$/.test(event.key)) {
                    searchWindow.style.display = 'flex';
                    sBox.focus();
                    return true
                }
                else return false
            }
            else if (event.key === 'Enter' || event.key === 'Escape') {
                if (event.key === 'Enter') window.callbackFunction(`search${chart.id}_~_${sBox.value}`)
                searchWindow.style.display = 'none'
                sBox.value = ''
                return true
            }
            else return false
        })
        sBox.addEventListener('input', () => sBox.value = sBox.value.toUpperCase())
        return {
            window: searchWindow,
            box: sBox,
        }
    }

    public static makeSpinner(chart: Handler) {
        chart.spinner = document.createElement('div');
        chart.spinner.classList.add('spinner');
        chart.wrapper.appendChild(chart.spinner)

        // TODO below can be css (animate)
        let rotation = 0;
        const speed = 10;
        function animateSpinner() {
            if (!chart.spinner) return;
            rotation += speed
            chart.spinner.style.transform = `translate(-50%, -50%) rotate(${rotation}deg)`
            requestAnimationFrame(animateSpinner)
        }
        animateSpinner();
    }

    private static readonly _styleMap = {
        '--bg-color': 'backgroundColor',
        '--hover-bg-color': 'hoverBackgroundColor',
        '--click-bg-color': 'clickBackgroundColor',
        '--active-bg-color': 'activeBackgroundColor',
        '--muted-bg-color': 'mutedBackgroundColor',
        '--border-color': 'borderColor',
        '--color': 'color',
        '--active-color': 'activeColor',
    }
    public static setRootStyles(styles: any) {
        const rootStyle = document.documentElement.style;
        for (const [property, valueKey] of Object.entries(this._styleMap)) {
            rootStyle.setProperty(property, styles[valueKey]);
        }
    }
}
