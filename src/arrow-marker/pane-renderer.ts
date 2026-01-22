import { ViewPoint } from "./pane-view";
import { CanvasRenderingTarget2D } from "fancy-canvas";
import { DrawingOptions } from "../drawing/options";
import { DrawingPaneRenderer } from "../drawing/pane-renderer";
import { ArrowDirection } from "./arrow-marker";

export class ArrowMarkerPaneRenderer extends DrawingPaneRenderer {
    private _point: ViewPoint;
    private _direction: ArrowDirection;
    private _arrowColor: string;
    private _arrowSize: number;
    private _hovered: boolean;

    constructor(
        point: ViewPoint,
        direction: ArrowDirection,
        arrowColor: string,
        arrowSize: number,
        options: DrawingOptions,
        hovered: boolean
    ) {
        super(options);
        this._point = point;
        this._direction = direction;
        this._arrowColor = arrowColor;
        this._arrowSize = arrowSize;
        this._hovered = hovered;
    }

    draw(target: CanvasRenderingTarget2D) {
        target.useBitmapCoordinateSpace(scope => {
            if (this._point.x === null || this._point.y === null) return;

            const ctx = scope.context;
            const x = Math.round(this._point.x * scope.horizontalPixelRatio);
            const y = Math.round(this._point.y * scope.verticalPixelRatio);

            // Scale arrow size by pixel ratio
            const size = Math.round(this._arrowSize * scope.horizontalPixelRatio);
            const halfSize = size / 2;

            ctx.save();
            ctx.fillStyle = this._arrowColor;
            ctx.strokeStyle = this._hovered ? this._options.lineColor : this._arrowColor;
            ctx.lineWidth = this._hovered ? 2 * scope.horizontalPixelRatio : 1 * scope.horizontalPixelRatio;

            ctx.beginPath();

            if (this._direction === 'up') {
                // Draw upward arrow (triangle pointing up)
                ctx.moveTo(x, y - halfSize);           // Top point
                ctx.lineTo(x - halfSize, y + halfSize); // Bottom left
                ctx.lineTo(x + halfSize, y + halfSize); // Bottom right
                ctx.closePath();
            } else {
                // Draw downward arrow (triangle pointing down)
                ctx.moveTo(x, y + halfSize);           // Bottom point
                ctx.lineTo(x - halfSize, y - halfSize); // Top left
                ctx.lineTo(x + halfSize, y - halfSize); // Top right
                ctx.closePath();
            }

            ctx.fill();

            if (this._hovered) {
                ctx.stroke();
            }

            ctx.restore();
        });
    }
}
