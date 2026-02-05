import {
    DeepPartial,
    MouseEventParams
} from "lightweight-charts";
import { Point } from "../drawing/data-source";
import { Drawing, InteractionState } from "../drawing/drawing";
import { DrawingOptions } from "../drawing/options";
import { HorizontalLinePaneView } from "./pane-view";
import { GlobalParams } from "../general/global-params";
import { HorizontalLineAxisView } from "./axis-view";


declare const window: GlobalParams;

export class HorizontalLine extends Drawing {
    _type = 'HorizontalLine';
    _paneViews: HorizontalLinePaneView[];
    _point: Point;
    private _callbackName: string | null;
    private _dismissCallback: string | null;
    _priceAxisViews: HorizontalLineAxisView[];
    _labelRect: { x: number, y: number, width: number, height: number } | null = null;
    _labelHovered: boolean = false;

    protected _startDragPoint: Point | null = null;

    constructor(point: Point, options: DeepPartial<DrawingOptions>, callbackName = null, dismissCallback = null) {
        super(options)
        this._point = point;
        this._point.time = null;    // time is null for horizontal lines
        this._paneViews = [new HorizontalLinePaneView(this)];
        this._priceAxisViews = [new HorizontalLineAxisView(this)];

        this._callbackName = callbackName;
        this._dismissCallback = dismissCallback;
    }

    public get points() {
        return [this._point];
    }

    public updatePoints(...points: (Point | null)[]) {
        for (const p of points) if (p) this._point.price = p.price;
        this.requestUpdate();
    }

    updateAllViews() {
        this._paneViews.forEach((pw) => pw.update());
        this._priceAxisViews.forEach((tw) => tw.update());
    }

    priceAxisViews() {
        return this._priceAxisViews;
    }

    _moveToState(state: InteractionState) {
        switch (state) {
            case InteractionState.NONE:
                document.body.style.cursor = "default";
                this._unsubscribe("mousedown", this._handleMouseDownInteraction);
                break;

            case InteractionState.HOVERING:
                document.body.style.cursor = "pointer";
                this._unsubscribe("mouseup", this._childHandleMouseUpInteraction);
                this._subscribe("mousedown", this._handleMouseDownInteraction)
                this.chart.applyOptions({ handleScroll: true });
                break;

            case InteractionState.DRAGGING:
                document.body.style.cursor = "grabbing";
                this._subscribe("mouseup", this._childHandleMouseUpInteraction);
                this.chart.applyOptions({ handleScroll: false });
                break;
        }
        this._state = state;
    }

    _onDrag(diff: any) {
        this._addDiffToPoint(this._point, 0, diff.price);
        this.requestUpdate();
    }

    _mouseIsOverDrawing(param: MouseEventParams, tolerance = 4) {
        if (!param.point) {
            if (this._labelHovered) {
                this._labelHovered = false;
                this.requestUpdate();
            }
            return false;
        }

        // Check if hovering over label or close icon (if label exists and dismiss is enabled)
        if (this._labelRect && this._options.text && this._dismissCallback) {
            const closeIconRect = this._getCloseIconRect();
            const overLabel = this._pointInRect(param.point, this._labelRect);
            const overIcon = closeIconRect && this._pointInRect(param.point, closeIconRect);

            if (overLabel || overIcon) {
                // console.log(`[Hover] Mouse: ${param.point.x},${param.point.y} | Label: ${JSON.stringify(this._labelRect)} | Over: ${overLabel}/${overIcon}`);
                if (!this._labelHovered) {
                    // console.log('[Hover] ENTER label/icon');
                    this._labelHovered = true;
                    this.requestUpdate();
                }
                return true;
            } else {
                // console.log(`[Hover] MISS Mouse: ${param.point.x},${param.point.y} | Label: ${JSON.stringify(this._labelRect)}`);
            }
        }

        // Reset hover state if not over icon
        if (this._labelHovered) {
            this._labelHovered = false;
            this.requestUpdate();
        }

        // Otherwise check line tolerance
        const y = this.series.priceToCoordinate(this._point.price);
        if (!y) return false;
        return (Math.abs(y - param.point.y) < tolerance);
    }

    private _getCloseIconRect(): { x: number, y: number, width: number, height: number } | null {
        if (!this._labelRect) return null;
        const iconSize = 14;
        const iconMargin = 5;
        return {
            x: this._labelRect.x + this._labelRect.width + iconMargin,
            y: this._labelRect.y,
            width: iconSize,
            height: iconSize
        };
    }

    private _pointInRect(point: { x: number, y: number }, rect: { x: number, y: number, width: number, height: number }): boolean {
        return point.x >= rect.x && point.x <= rect.x + rect.width &&
            point.y >= rect.y && point.y <= rect.y + rect.height;
    }

    protected _onMouseDown() {
        // Check if clicking on close icon
        if (this._labelHovered && this._dismissCallback && this._options.text) {
            window.callbackFunction(`${this._dismissCallback}_~_${this._options.text}`);
            return;
        }

        this._startDragPoint = null;
        const hoverPoint = this._latestHoverPoint;
        if (!hoverPoint) return;
        return this._moveToState(InteractionState.DRAGGING);
    }

    protected _childHandleMouseUpInteraction = () => {
        this._handleMouseUpInteraction();
        if (!this._callbackName) return;
        window.callbackFunction(`${this._callbackName}_~_${this._point.price.toFixed(8)}`);
    }
}