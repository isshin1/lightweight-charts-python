import {
    IChartApi,
    ISeriesApi,
    Logical,
    MouseEventParams,
    SeriesType
} from 'lightweight-charts';

import { PluginBase } from '../plugin-base';
import { DiffPoint, Point } from './data-source';
import { DrawingOptions, defaultOptions } from './options';
import { DrawingPaneView } from './pane-view';

export enum InteractionState {
    NONE,
    HOVERING,
    DRAGGING,
    DRAGGINGP1,
    DRAGGINGP2,
    DRAGGINGP3,
    DRAGGINGP4,
}

export abstract class Drawing extends PluginBase {
    _paneViews: DrawingPaneView[] = [];
    _options: DrawingOptions;

    abstract _type: string;
    protected _points: (Point | null)[] = [];

    protected _state: InteractionState = InteractionState.NONE;

    protected _startDragPoint: Point | null = null;
    protected _latestHoverPoint: any | null = null;

    protected static _mouseIsDown: boolean = false;

    public static hoveredObject: Drawing | null = null;
    public static lastHoveredObject: Drawing | null = null;

    protected _listeners: any[] = [];

    constructor(
        options?: Partial<DrawingOptions>
    ) {
        super()
        this._options = {
            ...defaultOptions,
            ...options,
        };
    }

    updateAllViews() {
        this._paneViews.forEach(pw => pw.update());
    }

    paneViews() {
        return this._paneViews;
    }

    applyOptions(options: Partial<DrawingOptions>) {
        this._options = {
            ...this._options,
            ...options,
        }
        this.requestUpdate();
    }

    public updatePoints(...points: (Point | null)[]) {
        for (let i = 0; i < this.points.length; i++) {
            if (points[i] == null) continue;
            this.points[i] = points[i] as Point;
        }
        this.requestUpdate();
    }

    detach() {
        this._options.lineColor = 'transparent';
        this.requestUpdate();
        this.series.detachPrimitive(this);
        for (const s of this._listeners) {
            document.body.removeEventListener(s.name, s.listener);
        }

    }

    get points() {
        return this._points;
    }

    protected _subscribe(name: keyof DocumentEventMap, listener: any) {
        document.body.addEventListener(name, listener);
        this._listeners.push({ name: name, listener: listener });
    }

    protected _unsubscribe(name: keyof DocumentEventMap, callback: any) {
        document.body.removeEventListener(name, callback);

        const toRemove = this._listeners.find((x) => x.name === name && x.listener === callback)
        this._listeners.splice(this._listeners.indexOf(toRemove), 1);
    }

    _handleHoverInteraction(param: MouseEventParams, shiftPressed: boolean = false) {
        this._latestHoverPoint = param.point;
        if (Drawing._mouseIsDown) {
            this._handleDragInteraction(param, shiftPressed);
        } else {
            if (this._mouseIsOverDrawing(param)) {
                if (this._state != InteractionState.NONE) return;
                this._moveToState(InteractionState.HOVERING);
                Drawing.hoveredObject = Drawing.lastHoveredObject = this;
            } else {
                if (this._state == InteractionState.NONE) return;
                this._moveToState(InteractionState.NONE);
                if (Drawing.hoveredObject === this) Drawing.hoveredObject = null;
            }
        }
    }

    public static _eventToPoint(param: MouseEventParams, series: ISeriesApi<SeriesType>, chart: IChartApi) {
        if (!series || !param.point || param.logical === null || param.logical === undefined) return null;
        const barPrice = series.coordinateToPrice(param.point.y);
        if (barPrice == null) return null;

        const time = this._getExtrapolatedTime(param.logical, series, chart, param.time);

        return {
            time: time || null,
            logical: param.logical,
            price: barPrice.valueOf(),
        }
    }

    protected static _getExtrapolatedTime(logical: Logical, series: ISeriesApi<SeriesType>, chart: IChartApi, knownTime?: any) {
        let time: any = knownTime;
        if (!time && chart) {
            const coordinate = chart.timeScale().logicalToCoordinate(logical);
            if (coordinate !== null) {
                time = chart.timeScale().coordinateToTime(coordinate);
            }
        }
        if (!time && series && logical !== null) {
            const data = series.dataByIndex(logical);
            if (data) {
                time = data.time;
            } else {
                // Extrapolate time for whitespace
                let lastKnownIndex: number | null = null;
                let lastKnownTime: any = null;
                // Search backwards for the last loaded bar
                for (let i = 1; i < 2000; i++) {
                    const idx = (logical - i) as Logical;
                    const d = series.dataByIndex(idx);
                    if (d) {
                        lastKnownIndex = idx;
                        lastKnownTime = d.time;
                        break;
                    }
                }

                if (lastKnownIndex !== null) {
                    if (typeof lastKnownTime === 'number') {
                        // Estimate interval
                        const prev = series.dataByIndex((lastKnownIndex - 1) as Logical);
                        let interval = 60; // default assumption
                        if (prev && typeof prev.time === 'number') {
                            interval = lastKnownTime - prev.time;
                        }

                        const diff = logical - lastKnownIndex;
                        const discreteDiff = Math.round(diff);
                        time = (lastKnownTime + (discreteDiff * interval)) as any;
                    } else {
                        // Non-numeric time (e.g. String Date), cannot extrapolate easily.
                        // Clamp to last known time to prevent crash
                        time = lastKnownTime;
                    }
                }
            }
        }
        return time;
    }

    public static _getExtrapolatedLogical(time: any, series: ISeriesApi<SeriesType>, chart: IChartApi): Logical | null {
        if (time === null || time === undefined || !chart || !series) return null;

        const timeScale = chart.timeScale();
        const coord = timeScale.timeToCoordinate(time);
        const logical = coord !== null ? timeScale.coordinateToLogical(coord) : null;
        if (logical !== null) return logical;

        // Extrapolate logic
        const currentMsgLogical = timeScale.coordinateToLogical(chart.timeScale().width());
        if (currentMsgLogical === null) return null;

        let lastKnownIndex: number | null = null;
        let lastKnownTime: any = null;

        // Search backwards
        for (let i = 0; i < 5000; i++) {
            const idx = (currentMsgLogical - i) as Logical;
            const d = series.dataByIndex(idx);
            if (d) {
                lastKnownIndex = idx;
                lastKnownTime = d.time;
                break;
            }
        }

        if (lastKnownIndex !== null && typeof lastKnownTime === 'number' && typeof time === 'number') {
            // Estimate interval
            const prev = series.dataByIndex((lastKnownIndex - 1) as Logical);
            let interval = 60; // default to 60s
            if (prev && typeof prev.time === 'number') {
                interval = lastKnownTime - prev.time;
            }

            // Safety: ensure interval is positive and non-zero to avoid Infinity
            if (interval <= 0) interval = 60;

            const timeDiff = time - lastKnownTime;
            const logicalDiff = Math.round(timeDiff / interval);

            if (!isFinite(logicalDiff)) return null;

            return (lastKnownIndex + logicalDiff) as Logical;
        }

        return null;
    }

    protected static _getDiff(p1: Point, p2: Point): DiffPoint {
        const diff: DiffPoint = {
            logical: (p1.logical - p2.logical) as Logical,
            price: p1.price - p2.price,
        }
        return diff;
    }

    protected _addDiffToPoint(point: Point | null, logicalDiff: number, priceDiff: number) {
        if (!point) return;
        point.logical = (point.logical + logicalDiff) as Logical;
        point.price = point.price + priceDiff;
        point.time = Drawing._getExtrapolatedTime(point.logical, this.series, this.chart) || null;
    }

    protected _syncPoints() {
        for (const p of this.points) {
            if (p && p.time) {
                const newLogical = Drawing._getExtrapolatedLogical(p.time, this.series, this.chart);
                if (newLogical !== null) {
                    p.logical = newLogical;
                }
            }
        }
    }

    protected _handleMouseDownInteraction = () => {
        // if (Drawing._mouseIsDown) return;
        this._syncPoints();
        Drawing._mouseIsDown = true;
        this._onMouseDown();
    }

    protected _handleMouseUpInteraction = () => {
        // if (!Drawing._mouseIsDown) return;
        Drawing._mouseIsDown = false;
        this._moveToState(InteractionState.HOVERING);
    }

    private _handleDragInteraction(param: MouseEventParams, shiftPressed: boolean): void {
        if (this._state != InteractionState.DRAGGING &&
            this._state != InteractionState.DRAGGINGP1 &&
            this._state != InteractionState.DRAGGINGP2 &&
            this._state != InteractionState.DRAGGINGP3 &&
            this._state != InteractionState.DRAGGINGP4) {
            return;
        }
        const mousePoint = Drawing._eventToPoint(param, this.series, this.chart);
        if (!mousePoint) return;
        this._startDragPoint = this._startDragPoint || mousePoint;

        const diff = Drawing._getDiff(mousePoint, this._startDragPoint);
        this._onDrag(diff, shiftPressed);
        this.requestUpdate();

        this._startDragPoint = mousePoint;
    }

    protected abstract _onMouseDown(): void;
    protected abstract _onDrag(diff: DiffPoint, shiftPressed: boolean): void;
    protected abstract _moveToState(state: InteractionState): void;
    protected abstract _mouseIsOverDrawing(param: MouseEventParams): boolean;
}
