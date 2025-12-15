import {
    IChartApi,
    ISeriesApi,
    Logical,
    MouseEventParams,
    SeriesType,
} from 'lightweight-charts';
import { Drawing } from './drawing';
import { HorizontalLine } from '../horizontal-line/horizontal-line';
import { TextAnnotation } from '../text-annotation/text-annotation';


export class DrawingTool {
    private _chart: IChartApi;
    private _series: ISeriesApi<SeriesType>;
    private _finishDrawingCallback: Function | null = null;

    private _drawings: Drawing[] = [];
    private _activeDrawing: Drawing | null = null;
    private _isDrawing: boolean = false;
    private _drawingType: (new (...args: any[]) => Drawing) | null = null;

    private _shiftPressed: boolean = false;
    private _lastCrosshairParam: MouseEventParams | null = null;

    constructor(chart: IChartApi, series: ISeriesApi<SeriesType>, finishDrawingCallback: Function | null = null) {
        this._chart = chart;
        this._series = series;
        this._finishDrawingCallback = finishDrawingCallback;

        this._chart.subscribeClick(this._clickHandler);
        this._chart.subscribeCrosshairMove(this._moveHandler);

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Shift') {
                console.log('Shift keydown');
                this._shiftPressed = true;
            }
        });
        document.addEventListener('keyup', (e) => {
            if (e.key === 'Shift') {
                console.log('Shift keyup');
                this._shiftPressed = false;
            }
        });
        document.addEventListener('pointerdown', (e) => {
            console.log('pointerdown', {
                button: e.button,
                isDrawing: this._isDrawing,
                shiftPressed: this._shiftPressed,
                hasLastParam: !!this._lastCrosshairParam
            });
            if (e.button === 0 && this._isDrawing && this._shiftPressed && this._lastCrosshairParam) {
                console.log('Triggering manual onClick');
                this._onClick(this._lastCrosshairParam);
                e.preventDefault();
                e.stopPropagation();
            }
        }, { capture: true });
    }

    private _clickHandler = (param: MouseEventParams) => this._onClick(param);
    private _moveHandler = (param: MouseEventParams) => this._onMouseMove(param);

    beginDrawing(DrawingType: new (...args: any[]) => Drawing) {
        this._drawingType = DrawingType;
        this._isDrawing = true;
    }

    stopDrawing() {
        this._isDrawing = false;
        this._activeDrawing = null;
    }

    get drawings() {
        return this._drawings;
    }

    get activeDrawing() {
        return this._activeDrawing;
    }

    get chart() {
        return this._chart;
    }

    addNewDrawing(drawing: Drawing) {
        // Sync logical indices from time to ensure consistency across timeframes
        const timeScale = this._chart.timeScale();
        for (const point of drawing.points) {
            if (point && point.time) {
                const coord = timeScale.timeToCoordinate(point.time as any);
                if (coord !== null) {
                    const logical = timeScale.coordinateToLogical(coord);
                    if (logical !== null) {
                        point.logical = logical;
                    }
                }
            }
        }

        this._series.attachPrimitive(drawing);
        this._drawings.push(drawing);
    }

    delete(d: Drawing | null) {
        if (d == null) return;
        const idx = this._drawings.indexOf(d);
        if (idx == -1) return;
        this._drawings.splice(idx, 1)
        d.detach();
    }

    clearDrawings() {
        for (const d of this._drawings) d.detach();
        this._drawings = [];
    }

    repositionOnTime() {
        for (const drawing of this.drawings) {
            const newPoints = []
            for (const point of drawing.points) {
                if (!point) {
                    newPoints.push(point);
                    continue;
                }
                const logical = point.time ? this._chart.timeScale()
                    .coordinateToLogical(
                        this._chart.timeScale().timeToCoordinate(point.time) || 0
                    ) : point.logical;
                newPoints.push({
                    time: point.time,
                    logical: logical as Logical,
                    price: point.price,
                })
            }
            drawing.updatePoints(...newPoints);
        }
    }

    private _onClick(param: MouseEventParams) {
        if (!this._isDrawing) return;

        const point = Drawing._eventToPoint(param, this._series, this._chart);
        if (!point) return;

        if (this._activeDrawing == null) {
            if (this._drawingType == null) return;

            // Special handling for TextAnnotation - pass default text
            if (this._drawingType === TextAnnotation) {
                this._activeDrawing = new this._drawingType(point, "Text");
            } else {
                this._activeDrawing = new this._drawingType(point, point);
            }
            this._series.attachPrimitive(this._activeDrawing);
            // Complete single-point drawings immediately
            if (this._drawingType == HorizontalLine || this._drawingType === TextAnnotation) {
                this._onClick(param);
            }
        }
        else {
            if (this._shiftPressed && (this._activeDrawing._type === 'TrendLine' || this._activeDrawing._type === 'RayLine')) {
                const firstPoint = this._activeDrawing.points[0];
                if (firstPoint) {
                    point.price = firstPoint.price;
                }
            }
            this._activeDrawing.updatePoints(null, point);

            this._drawings.push(this._activeDrawing);

            // If it's a TextAnnotation, trigger edit mode immediately
            if (this._activeDrawing instanceof TextAnnotation) {
                this._activeDrawing.startEditing();
            }

            this.stopDrawing();

            if (!this._finishDrawingCallback) return;
            this._finishDrawingCallback();
        }
    }

    private _onMouseMove(param: MouseEventParams) {
        this._lastCrosshairParam = param;
        if (!param) return;

        if (!this._isDrawing) {
            for (const t of this._drawings) t._handleHoverInteraction(param, this._shiftPressed);
        }

        if (!this._isDrawing || !this._activeDrawing) return;

        const point = Drawing._eventToPoint(param, this._series, this._chart);
        if (!point) return;

        if (this._shiftPressed && (this._activeDrawing._type === 'TrendLine' || this._activeDrawing._type === 'RayLine')) {
            const firstPoint = this._activeDrawing.points[0];
            if (firstPoint) {
                point.price = firstPoint.price;
            }
        }

        this._activeDrawing.updatePoints(null, point);
        // this._activeDrawing.setSecondPoint(point);
    }
}