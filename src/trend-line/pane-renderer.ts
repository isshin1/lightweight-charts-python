import { ViewPoint } from "./pane-view";

import { CanvasRenderingTarget2D, BitmapCoordinatesRenderingScope } from "fancy-canvas";
import { TwoPointDrawingPaneRenderer } from "../drawing/pane-renderer";
import { DrawingOptions } from "../drawing/options";
import { setLineStyle } from "../helpers/canvas-rendering";
import { TrendLine } from "./trend-line";

export class TrendLinePaneRenderer extends TwoPointDrawingPaneRenderer {
    private _source: TrendLine | null;

    constructor(p1: ViewPoint, p2: ViewPoint, options: DrawingOptions, hovered: boolean, source?: TrendLine) {
        super(p1, p2, options, hovered);
        this._source = source || null;
    }

    draw(target: CanvasRenderingTarget2D) {
        target.useBitmapCoordinateSpace(scope => {
            if (
                this._p1.x === null ||
                this._p1.y === null ||
                this._p2.x === null ||
                this._p2.y === null
            )
                return;
            const ctx = scope.context;

            const scaled = this._getScaledCoordinates(scope);
            if (!scaled) return;

            ctx.lineWidth = this._options.width;
            ctx.strokeStyle = this._options.lineColor;
            setLineStyle(ctx, this._options.lineStyle);
            ctx.beginPath();
            ctx.moveTo(scaled.x1, scaled.y1);
            ctx.lineTo(scaled.x2, scaled.y2);
            ctx.stroke();

            // Draw text label if text is provided
            if (this._options.text && this._options.text.length > 0) {
                this._drawTextLabel(scope, scaled);
            }

            if (!this._hovered) return;
            this._drawEndCircle(scope, scaled.x1, scaled.y1);
            this._drawEndCircle(scope, scaled.x2, scaled.y2);
        });
    }

    private _drawTextLabel(
        scope: BitmapCoordinatesRenderingScope,
        scaled: { x1: number; y1: number; x2: number; y2: number }
    ) {
        const ctx = scope.context;
        const text = this._options.text || '';
        if (!text) return;

        // labelPos: 0 = left (p1), 1 = right (p2), 0.5 = middle
        const labelPos = this._options.labelPos ?? 0.5;

        // Calculate position along the line
        const x = scaled.x1 + (scaled.x2 - scaled.x1) * labelPos;
        const y = scaled.y1 + (scaled.y2 - scaled.y1) * labelPos;

        // Text styling
        ctx.font = `bold 12px sans-serif`;
        ctx.fillStyle = this._options.lineColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = this._options.textPosition === 'below' ? 'top' : 'bottom';

        // Position above or below the line
        const offsetY = this._options.textPosition === 'below' ? 5 : -5;

        ctx.fillText(text, x, y + offsetY);

        // Store label rect for hit testing (convert to logical coordinates)
        if (this._source) {
            const metrics = ctx.measureText(text);
            const width = metrics.width / scope.horizontalPixelRatio;
            const height = 14; // approximate text height
            this._source._labelRect = {
                x: (x / scope.horizontalPixelRatio) - (width / 2),
                y: ((y + offsetY) / scope.verticalPixelRatio) - (height / 2),
                width: width,
                height: height
            };
        }
    }
}