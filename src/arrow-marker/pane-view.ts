import { ArrowMarkerPaneRenderer } from "./pane-renderer";
import { DrawingPaneView } from "../drawing/pane-view";
import { ArrowMarker } from "./arrow-marker";

export interface ViewPoint {
    x: number | null;
    y: number | null;
}

export class ArrowMarkerPaneView extends DrawingPaneView {
    _source: ArrowMarker;
    _point: ViewPoint = { x: null, y: null };

    constructor(source: ArrowMarker) {
        super(source);
        this._source = source;
    }

    update() {
        const point = this._source._point;
        const timeScale = this._source.chart.timeScale();
        const series = this._source.series;

        // Fallback to logical coordinate if time coordinate is null
        const timeCoord = point.time ? timeScale.timeToCoordinate(point.time) : null;
        this._point.x = timeCoord !== null ? timeCoord : timeScale.logicalToCoordinate(point.logical);
        this._point.y = series.priceToCoordinate(point.price);
    }

    renderer() {
        return new ArrowMarkerPaneRenderer(
            this._point,
            this._source._direction,
            this._source._arrowColor,
            this._source._arrowSize,
            this._source._options,
            this._source.hovered
        );
    }
}
