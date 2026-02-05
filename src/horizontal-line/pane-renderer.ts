import { CanvasRenderingTarget2D, BitmapCoordinatesRenderingScope } from "fancy-canvas";
import { DrawingOptions } from "../drawing/options";
import { DrawingPaneRenderer } from "../drawing/pane-renderer";
import { ViewPoint } from "../drawing/pane-view";
import { setLineStyle } from "../helpers/canvas-rendering";
import { HorizontalLine } from "./horizontal-line";

export class HorizontalLinePaneRenderer extends DrawingPaneRenderer {
    _point: ViewPoint = { x: null, y: null };
    private _source: HorizontalLine | null;

    constructor(point: ViewPoint, options: DrawingOptions, source?: HorizontalLine) {
        super(options);
        this._point = point;
        this._source = source || null;
    }

    draw(target: CanvasRenderingTarget2D) {
        target.useBitmapCoordinateSpace(scope => {
            if (this._point.y == null) return;
            const ctx = scope.context;

            const scaledY = Math.round(this._point.y * scope.verticalPixelRatio);
            const totalWidth = scope.bitmapSize.width;

            // Right margin to leave space before price axis (40px)
            const rightMargin = this._options.fixedWidth ? 40 * scope.horizontalPixelRatio : 0;
            const endX = totalWidth - rightMargin;

            // Calculate start X based on fixedWidth option
            let startX: number;
            if (this._options.fixedWidth && this._options.fixedWidth > 0) {
                // Fixed width: draw from (endX - fixedWidth) to endX
                const fixedWidthScaled = this._options.fixedWidth * scope.horizontalPixelRatio;
                startX = Math.max(0, endX - fixedWidthScaled);
            } else {
                // Full width: use provided x or start from 0
                startX = this._point.x ? this._point.x * scope.horizontalPixelRatio : 0;
            }

            ctx.lineWidth = this._options.width;
            ctx.strokeStyle = this._options.lineColor;
            setLineStyle(ctx, this._options.lineStyle);
            ctx.beginPath();

            ctx.moveTo(startX, scaledY);
            ctx.lineTo(endX, scaledY);

            ctx.stroke();

            // Draw text label if text is provided
            if (this._options.text && this._options.text.length > 0) {
                this._drawTextLabelAndIcon(scope, endX, scaledY);
            }
        });
    }

    private _drawTextLabelAndIcon(
        scope: BitmapCoordinatesRenderingScope,
        x: number,
        y: number
    ) {
        const ctx = scope.context;
        const text = this._options.text || '';
        if (!text) return;

        // Scale font size for pixel ratio
        const scaledFontSize = Math.round(12 * scope.verticalPixelRatio);
        ctx.font = `bold ${scaledFontSize}px sans-serif`;
        ctx.fillStyle = this._options.lineColor;
        ctx.textAlign = 'right';  // Right-align at the end of line
        ctx.textBaseline = 'bottom';  // Above the line

        // Position above the line (5px offset, scaled)
        const offsetY = -5 * scope.verticalPixelRatio;

        // Measure text for label rect
        const metrics = ctx.measureText(text);
        const textWidth = metrics.width / scope.horizontalPixelRatio;
        const textHeight = 14; // approximate logical height

        // Store label rect on source (convert to logical coordinates)
        if (this._source) {
            this._source._labelRect = {
                x: (x / scope.horizontalPixelRatio) - textWidth,
                y: ((y + offsetY) / scope.verticalPixelRatio) - textHeight,
                width: textWidth,
                height: textHeight
            };
        }

        // Draw text
        ctx.fillText(text, x, y + offsetY);

        // Draw close icon if label is hovered
        if (this._source && this._source._labelHovered) {
            this._drawCloseIcon(scope, x, y + offsetY);
        }
    }

    private _drawCloseIcon(
        scope: BitmapCoordinatesRenderingScope,
        labelX: number,
        labelY: number
    ) {
        const ctx = scope.context;
        const iconSize = 14 * scope.horizontalPixelRatio;
        const iconMargin = 5 * scope.horizontalPixelRatio;

        // Position to the right of the label
        const iconX = labelX + iconMargin;
        const iconY = labelY - (iconSize / 2);

        // Draw background circle
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.beginPath();
        ctx.arc(iconX + iconSize / 2, iconY + iconSize / 2, iconSize / 2, 0, Math.PI * 2);
        ctx.fill();

        // Draw × symbol
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 2;
        const padding = 3 * scope.horizontalPixelRatio;

        ctx.beginPath();
        ctx.moveTo(iconX + padding, iconY + padding);
        ctx.lineTo(iconX + iconSize - padding, iconY + iconSize - padding);
        ctx.moveTo(iconX + iconSize - padding, iconY + padding);
        ctx.lineTo(iconX + padding, iconY + iconSize - padding);
        ctx.stroke();
    }

}