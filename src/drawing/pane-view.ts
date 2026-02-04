import { Coordinate, ISeriesPrimitivePaneView } from 'lightweight-charts';
import { Drawing } from './drawing';
import { Point } from './data-source';
import { DrawingPaneRenderer } from './pane-renderer';
import { TwoPointDrawing } from './two-point-drawing';


export abstract class DrawingPaneView implements ISeriesPrimitivePaneView {
    _source: Drawing;

    constructor(source: Drawing) {
        this._source = source;
    }

    abstract update(): void;
    abstract renderer(): DrawingPaneRenderer;
}

export interface ViewPoint {
    x: Coordinate | null;
    y: Coordinate | null;
}

export abstract class TwoPointDrawingPaneView extends DrawingPaneView {
    _p1: ViewPoint = { x: null, y: null };
    _p2: ViewPoint = { x: null, y: null };

    _source: TwoPointDrawing;

    constructor(source: TwoPointDrawing) {
        super(source);
        this._source = source;
    }

    update() {
        if (!this._source.p1 || !this._source.p2) return;
        const series = this._source.series;
        const y1 = series.priceToCoordinate(this._source.p1.price);
        const y2 = series.priceToCoordinate(this._source.p2.price);
        const x1 = this._getX(this._source.p1);
        const x2 = this._getX(this._source.p2);
        this._p1 = { x: x1, y: y1 };
        this._p2 = { x: x2, y: y2 };
        if (!x1 || !x2 || !y1 || !y2) return;
    }

    abstract renderer(): DrawingPaneRenderer;

    _getX(p: Point): Coordinate | null {
        const timeScale = this._source.chart.timeScale();

        // Fast path: Try using stored logical index first (most common case during drag)
        if (p.logical !== null && p.logical !== undefined) {
            const coord = timeScale.logicalToCoordinate(p.logical);
            if (coord !== null) return coord;
        }

        // Slower path: Recalculate from time (needed for timeframe changes)
        if (p.time) {
            const coord = timeScale.timeToCoordinate(p.time);
            if (coord !== null) return coord;

            // Last resort: expensive extrapolation
            const newLogical = Drawing._getExtrapolatedLogical(p.time, this._source.series, this._source.chart);
            if (newLogical !== null) {
                return timeScale.logicalToCoordinate(newLogical);
            }
        }

        return null;
    }
}
