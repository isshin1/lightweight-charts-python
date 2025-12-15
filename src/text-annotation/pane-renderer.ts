import { ViewPoint } from "./pane-view";
import { CanvasRenderingTarget2D } from "fancy-canvas";
import { DrawingOptions } from "../drawing/options";
import { DrawingPaneRenderer } from "../drawing/pane-renderer";

export class TextAnnotationPaneRenderer extends DrawingPaneRenderer {
  private _text: string;
  private _fontSize: number;
  private _fontFamily: string;
  private _textColor: string;
  private _backgroundColor: string;
  private _padding: number;
  private _onMeasure: (width: number, height: number) => void;

  constructor(
    point: ViewPoint,
    text: string,
    options: DrawingOptions,
    hovered: boolean,
    onMeasure: (width: number, height: number) => void
  ) {
    super(options);
    this._point = point;
    this._text = text;
    this._hovered = hovered;
    this._onMeasure = onMeasure;
    this._fontSize = 14;  // Increased from 12 for better readability
    this._fontFamily = "Arial";
    this._textColor = "#FFFFFF";  // White text for visibility on dark backgrounds
    this._backgroundColor = "rgba(0, 0, 0, 0.0)";  // Fully transparent background
    this._padding = 6;
  }

  private _point: ViewPoint;
  private _hovered: boolean;

  draw(target: CanvasRenderingTarget2D) {
    target.useBitmapCoordinateSpace(scope => {
      if (this._point.x === null || this._point.y === null) return;

      const ctx = scope.context;
      const x = Math.round(this._point.x * scope.horizontalPixelRatio);
      const y = Math.round(this._point.y * scope.verticalPixelRatio);

      // Set font
      ctx.font = `${this._fontSize}px ${this._fontFamily}`;
      ctx.textBaseline = "top";

      // Measure text
      const metrics = ctx.measureText(this._text);
      const textWidth = metrics.width;
      const textHeight = this._fontSize;

      // Draw background box
      const boxX = x - this._padding;
      const boxY = y - this._padding;
      const boxWidth = textWidth + 2 * this._padding;
      const boxHeight = textHeight + 2 * this._padding;

      this._onMeasure(boxWidth, boxHeight);

      ctx.fillStyle = this._backgroundColor;
      ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

      // Draw border if hovered
      if (this._hovered) {
        ctx.strokeStyle = this._options.lineColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
      }

      // Draw text
      ctx.fillStyle = this._textColor;
      ctx.fillText(this._text, x, y);
    });
  }
}
