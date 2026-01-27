import { ISeriesPrimitivePaneRenderer } from "lightweight-charts";
import { ViewPoint } from "./pane-view";
import { DrawingOptions } from "./options";
import { BitmapCoordinatesRenderingScope, CanvasRenderingTarget2D } from "fancy-canvas";

export abstract class DrawingPaneRenderer implements ISeriesPrimitivePaneRenderer {
    _options: DrawingOptions;

    constructor(options: DrawingOptions) {
        this._options = options;
    }

    abstract draw(target: CanvasRenderingTarget2D): void;

}

export abstract class TwoPointDrawingPaneRenderer extends DrawingPaneRenderer {
    _p1: ViewPoint;
    _p2: ViewPoint;
    protected _hovered: boolean;

    constructor(p1: ViewPoint, p2: ViewPoint, options: DrawingOptions, hovered: boolean) {
        super(options);
        this._p1 = p1;
        this._p2 = p2;
        this._hovered = hovered;
    }

    abstract draw(target: CanvasRenderingTarget2D): void;

    _getScaledCoordinates(scope: BitmapCoordinatesRenderingScope) {
        if (this._p1.x === null || this._p1.y === null ||
            this._p2.x === null || this._p2.y === null) return null;

        // Add 0.5 pixel offset for odd-width lines to prevent anti-aliasing blur
        const scaledWidth = this._options.width * scope.horizontalPixelRatio;
        const offset = scaledWidth % 2 !== 0 ? 0.5 : 0;

        return {
            x1: Math.round(this._p1.x * scope.horizontalPixelRatio) + offset,
            y1: Math.round(this._p1.y * scope.verticalPixelRatio) + offset,
            x2: Math.round(this._p2.x * scope.horizontalPixelRatio) + offset,
            y2: Math.round(this._p2.y * scope.verticalPixelRatio) + offset,
        }
    }

    // _drawTextLabel(scope: BitmapCoordinatesRenderingScope, text: string, x: number, y: number, left: boolean) {
    //  scope.context.font = '24px Arial';
    //  scope.context.beginPath();
    //  const offset = 5 * scope.horizontalPixelRatio;
    //  const textWidth = scope.context.measureText(text);
    //  const leftAdjustment = left ? textWidth.width + offset * 4 : 0;
    //  scope.context.fillStyle = this._options.labelBackgroundColor;
    //  scope.context.roundRect(x + offset - leftAdjustment, y - 24, textWidth.width + offset * 2,  24 + offset, 5);
    //  scope.context.fill();
    //  scope.context.beginPath();
    //  scope.context.fillStyle = this._options.labelTextColor;
    //  scope.context.fillText(text, x + offset * 2 - leftAdjustment, y);
    // }

    _drawEndCircle(scope: BitmapCoordinatesRenderingScope, x: number, y: number) {
        const radius = 8;  // Slightly smaller radius
        scope.context.save();
        scope.context.fillStyle = '#ffffff';  // White fill (hollow look)
        scope.context.strokeStyle = '#2962FF';  // Blue border
        scope.context.lineWidth = 2;
        scope.context.beginPath();
        scope.context.arc(x, y, radius, 0, 2 * Math.PI);
        scope.context.fill();
        scope.context.stroke();
        scope.context.restore();
    }
}