import {
    MouseEventParams,
} from 'lightweight-charts';


import { TrendLinePaneView } from './pane-view';
import { Point, DiffPoint } from '../drawing/data-source';
import { InteractionState } from '../drawing/drawing';
import { DrawingOptions } from '../drawing/options';
import { TwoPointDrawing } from '../drawing/two-point-drawing';
import { showInputModal } from '../drawings/input-modal';


// Custom state for label dragging (extends InteractionState)
const DRAGGING_LABEL = 7;


export class TrendLine extends TwoPointDrawing {
    _type = "TrendLine";

    // Label rectangle for hit testing (set by renderer)
    _labelRect: { x: number; y: number; width: number; height: number } | null = null;

    // Double-click detection
    private _lastClickTime = 0;

    constructor(
        p1: Point,
        p2: Point,
        options?: Partial<DrawingOptions>
    ) {
        super(p1, p2, options)
        this._paneViews = [new TrendLinePaneView(this)];
    }

    _moveToState(state: InteractionState | number) {
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
                this._unsubscribe("mouseup", this._handleMouseDownInteraction);
                this.chart.applyOptions({ handleScroll: true });
                break;

            case InteractionState.DRAGGINGP1:
            case InteractionState.DRAGGINGP2:
            case InteractionState.DRAGGING:
            case DRAGGING_LABEL:
                document.body.style.cursor = "grabbing";
                this._subscribe("mouseup", this._handleMouseUpInteraction);
                this.chart.applyOptions({ handleScroll: false });
                break;
        }
        this._state = state as InteractionState;
    }

    // Override to handle label dragging
    protected _handleDragInteraction(param: MouseEventParams, shiftPressed: boolean) {
        // Handle label dragging along the line
        if ((this._state as number) === DRAGGING_LABEL) {
            const p1 = this._paneViews[0]._p1;
            const p2 = this._paneViews[0]._p2;
            if (!p1 || !p2 || !param.point) return;

            const dx = (p2.x || 0) - (p1.x || 0);
            const dy = (p2.y || 0) - (p1.y || 0);
            const lenSq = dx * dx + dy * dy;
            if (lenSq === 0) return;

            const px = param.point.x - (p1.x || 0);
            const py = param.point.y - (p1.y || 0);

            // Project mouse position onto the line segment
            let proj = (px * dx + py * dy) / lenSq;
            proj = Math.max(0, Math.min(1, proj));

            this._options.labelPos = proj;
            this._hasDragged = true;
            this.requestUpdate();
            return;
        }

        // Call parent implementation for normal dragging
        super._handleDragInteraction(param, shiftPressed);
    }

    _onDrag(diff: DiffPoint, shiftPressed: boolean) {
        if (this._state == InteractionState.DRAGGING || this._state == InteractionState.DRAGGINGP1) {
            this._addDiffToPoint(this.p1, diff.logical, diff.price);
            if (shiftPressed && this._state == InteractionState.DRAGGINGP1 && this.p1 && this.p2) {
                this.p1.price = this.p2.price;
            }
        }
        if (this._state == InteractionState.DRAGGING || this._state == InteractionState.DRAGGINGP2) {
            this._addDiffToPoint(this.p2, diff.logical, diff.price);
            if (shiftPressed && this._state == InteractionState.DRAGGINGP2 && this.p2 && this.p1) {
                this.p2.price = this.p1.price;
            }
        }
    }

    protected _onMouseDown() {
        this._startDragPoint = null;
        const hoverPoint = this._latestHoverPoint;
        if (!hoverPoint) return;

        // Double-click detection - open label modal
        const now = Date.now();
        if (this._lastClickTime && now - this._lastClickTime < 300) {
            this._lastClickTime = 0;
            showInputModal(
                this._options.text || "",
                this._options.textPosition || "above",
                (result) => {
                    this.applyOptions({
                        text: result.text,
                        textPosition: result.position
                    });
                    document.body.dispatchEvent(new CustomEvent('drawing-changed', {
                        detail: { type: this._type }
                    }));
                },
                this.chart.chartElement().parentElement
            );
            return;
        }
        this._lastClickTime = now;

        // Label hit test - start label dragging
        if (this._labelRect && this._options.text) {
            const margin = 4;
            if (hoverPoint.x >= this._labelRect.x - margin &&
                hoverPoint.x <= this._labelRect.x + this._labelRect.width + margin &&
                hoverPoint.y >= this._labelRect.y - margin &&
                hoverPoint.y <= this._labelRect.y + this._labelRect.height + margin) {
                return this._moveToState(DRAGGING_LABEL);
            }
        }

        const p1 = this._paneViews[0]._p1;
        const p2 = this._paneViews[0]._p2;

        if (!p1.x || !p2.x || !p1.y || !p2.y) return this._moveToState(InteractionState.DRAGGING);

        const tolerance = 10;
        if (Math.abs(hoverPoint.x - p1.x) < tolerance && Math.abs(hoverPoint.y - p1.y) < tolerance) {
            this._moveToState(InteractionState.DRAGGINGP1)
        }
        else if (Math.abs(hoverPoint.x - p2.x) < tolerance && Math.abs(hoverPoint.y - p2.y) < tolerance) {
            this._moveToState(InteractionState.DRAGGINGP2)
        }
        else {
            this._moveToState(InteractionState.DRAGGING);
        }
    }

    protected _mouseIsOverDrawing(param: MouseEventParams, tolerance = 4) {
        if (!param.point) return false;

        // Label hit test
        if (this._labelRect && this._options.text) {
            const r = this._labelRect;
            if (param.point.x >= r.x && param.point.x <= r.x + r.width &&
                param.point.y >= r.y && param.point.y <= r.y + r.height) {
                return true;
            }
        }

        const x1 = this._paneViews[0]._p1.x;
        const y1 = this._paneViews[0]._p1.y;
        const x2 = this._paneViews[0]._p2.x;
        const y2 = this._paneViews[0]._p2.y;
        if (!x1 || !x2 || !y1 || !y2) return false;

        const mouseX = param.point.x;
        const mouseY = param.point.y;

        if (mouseX <= Math.min(x1, x2) - tolerance ||
            mouseX >= Math.max(x1, x2) + tolerance) {
            return false;
        }

        const distance = Math.abs((y2 - y1) * mouseX - (x2 - x1) * mouseY + x2 * y1 - y2 * x1
        ) / Math.sqrt((y2 - y1) ** 2 + (x2 - x1) ** 2);

        return distance <= tolerance;
    }
}

