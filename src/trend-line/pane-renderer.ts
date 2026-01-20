import { ViewPoint } from "./pane-view";

import { CanvasRenderingTarget2D, BitmapCoordinatesRenderingScope } from "fancy-canvas";
import { TwoPointDrawingPaneRenderer } from "../drawing/pane-renderer";
import { DrawingOptions } from "../drawing/options";
import { setLineStyle } from "../helpers/canvas-rendering";

export class TrendLinePaneRenderer extends TwoPointDrawingPaneRenderer {
    constructor(p1: ViewPoint, p2: ViewPoint, options: DrawingOptions, hovered: boolean) {
        super(p1, p2, options, hovered);
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
        const fontSize = 11 * scope.verticalPixelRatio;
        ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
        ctx.fillStyle = this._options.lineColor;
        ctx.textAlign = labelPos < 0.5 ? 'left' : labelPos > 0.5 ? 'right' : 'center';

        // Position above or below the line
        const textPosition = this._options.textPosition || 'above';
        const offsetY = textPosition === 'above' ? -6 * scope.verticalPixelRatio : 14 * scope.verticalPixelRatio;

        ctx.fillText(text, x, y + offsetY);
    }
}