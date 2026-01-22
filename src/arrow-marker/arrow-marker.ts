import { MouseEventParams } from 'lightweight-charts';
import { ArrowMarkerPaneView } from './pane-view';
import { Point } from '../drawing/data-source';
import { InteractionState } from '../drawing/drawing';
import { DrawingOptions } from '../drawing/options';
import { Drawing } from '../drawing/drawing';

export type ArrowDirection = 'up' | 'down';

export interface ArrowMarkerOptions extends DrawingOptions {
    arrowColor?: string;
    arrowSize?: number;
}

export class ArrowMarker extends Drawing {
    _type: string;
    _point: Point;
    _direction: ArrowDirection;
    _hovered: boolean = false;
    _arrowColor: string;
    _arrowSize: number;

    constructor(
        point: Point,
        direction: ArrowDirection,
        options?: Partial<ArrowMarkerOptions>
    ) {
        super(options);
        this._point = point;
        this._direction = direction;
        this._type = direction === 'up' ? 'ArrowUpMarker' : 'ArrowDownMarker';
        
        // Default colors: green for up, red for down
        this._arrowColor = options?.arrowColor || (direction === 'up' ? '#26a69a' : '#ef5350');
        this._arrowSize = options?.arrowSize || 20;

        this._points = [point];
        this._paneViews = [new ArrowMarkerPaneView(this)];
    }

    get hovered() {
        return this._hovered;
    }

    get points() {
        return [this._point];
    }

    get direction() {
        return this._direction;
    }

    updatePoints(...points: (Point | null)[]) {
        if (points[0]) {
            this._point = points[0];
            this._points[0] = points[0];
        }
        this.requestUpdate();
    }

    _moveToState(state: InteractionState) {
        switch (state) {
            case InteractionState.NONE:
                document.body.style.cursor = "default";
                this._hovered = false;
                this.requestUpdate();
                this._unsubscribe("mousedown", this._handleMouseDownInteraction);
                break;

            case InteractionState.HOVERING:
                document.body.style.cursor = "pointer";
                this._hovered = true;
                this.requestUpdate();
                this._subscribe("mousedown", this._handleMouseDownInteraction);
                this._unsubscribe("mouseup", this._handleMouseUpInteraction);
                this.chart.applyOptions({ handleScroll: true });
                break;

            case InteractionState.DRAGGING:
                document.body.style.cursor = "grabbing";
                this._subscribe("mouseup", this._handleMouseUpInteraction);
                this.chart.applyOptions({ handleScroll: false });
                break;
        }
        this._state = state;
    }

    protected _onDrag(diff: any) {
        this._addDiffToPoint(this._point, diff.logical, diff.price);
    }

    protected _onMouseDown() {
        this._startDragPoint = null;
        if (this._latestHoverPoint) {
            this._moveToState(InteractionState.DRAGGING);
        }
    }

    // Hit detection: check if mouse is over the arrow
    protected _mouseIsOverDrawing(param: MouseEventParams, tolerance = 8) {
        if (!param.point) return false;

        const viewPoint = (this._paneViews[0] as ArrowMarkerPaneView)._point;
        if (viewPoint.x === null || viewPoint.y === null) return false;

        const mouseX = param.point.x;
        const mouseY = param.point.y;

        // Arrow is centered around the point, check bounding box
        const halfSize = this._arrowSize / 2 + tolerance;
        
        return (
            mouseX >= viewPoint.x - halfSize &&
            mouseX <= viewPoint.x + halfSize &&
            mouseY >= viewPoint.y - halfSize &&
            mouseY <= viewPoint.y + halfSize
        );
    }
}

// Convenience classes for easier type identification
export class ArrowUpMarker extends ArrowMarker {
    constructor(point: Point, options?: Partial<ArrowMarkerOptions>) {
        super(point, 'up', options);
    }
}

export class ArrowDownMarker extends ArrowMarker {
    constructor(point: Point, options?: Partial<ArrowMarkerOptions>) {
        super(point, 'down', options);
    }
}
