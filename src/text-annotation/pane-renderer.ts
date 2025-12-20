import { ViewPoint } from "./pane-view";
import { CanvasRenderingTarget2D } from "fancy-canvas";
import { DrawingOptions } from "../drawing/options";
import { DrawingPaneRenderer } from "../drawing/pane-renderer";
import { TextAnnotation } from "./text-annotation";

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
    source: TextAnnotation,
    onMeasure: (width: number, height: number) => void
  ) {
    super(options);
    this._point = point;
    this._text = text;
    this._hovered = hovered;
    this._source = source;
    this._onMeasure = onMeasure;
    this._fontSize = 14;  // Increased from 12 for better readability
    this._fontFamily = "Arial";
    this._fontFamily = "Arial";
    // Fix: Use color from source options, or default to black if not set.
    // 'textColor' might be on _source._options (as generic options) or specific property
    this._textColor = (source._options as any).textColor || "#000000";
    this._backgroundColor = "rgba(0, 0, 0, 0.0)";  // Fully transparent background
    this._padding = 6;
  }

  private _point: ViewPoint;
  private _hovered: boolean;
  private _source: TextAnnotation;

  draw(target: CanvasRenderingTarget2D) {
    target.useBitmapCoordinateSpace(scope => {
      if (this._point.x === null || this._point.y === null) return;

      const ctx = scope.context;
      const x = Math.round(this._point.x * scope.horizontalPixelRatio);
      const y = Math.round(this._point.y * scope.verticalPixelRatio);

      // Scale font size by pixel ratio to ensure it renders at correct size
      const fontSize = Math.round(this._fontSize * scope.verticalPixelRatio);

      const fontWeight = this._source.bold ? 'bold' : 'normal';
      const fontStyle = this._source.italic ? 'italic' : 'normal';

      ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${this._fontFamily}`;
      ctx.textBaseline = "top";

      // Measure text
      const metrics = ctx.measureText(this._text);
      const textWidth = metrics.width;
      const textHeight = fontSize;

      // Draw background box
      // Padding should be scaled too
      const padding = Math.round(this._padding * scope.horizontalPixelRatio); // scaled padding

      const boxX = x - padding;
      const boxY = y - padding;
      const boxWidth = textWidth + 2 * padding;
      const boxHeight = textHeight + 2 * padding;

      // Report dimensions back in CSS pixels
      this._onMeasure(
        boxWidth / scope.horizontalPixelRatio,
        boxHeight / scope.verticalPixelRatio
      );

      ctx.fillStyle = this._backgroundColor;
      ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

      // Draw border if hovered
      if (this._hovered) {
        ctx.strokeStyle = this._options.lineColor;
        ctx.lineWidth = 2 * scope.horizontalPixelRatio; // Scale line width
        ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
      }

      // Draw text
      ctx.fillStyle = this._textColor;
      ctx.fillText(this._text, x, y);

      // Draw Underline
      if (this._source.underline) {
        // Underline slightly below text
        const underlineY = y + textHeight + (2 * scope.verticalPixelRatio);
        ctx.beginPath();
        ctx.moveTo(x, underlineY);
        ctx.lineTo(x + textWidth, underlineY);
        ctx.strokeStyle = this._textColor;
        ctx.lineWidth = 1 * scope.verticalPixelRatio;
        ctx.stroke();
      }
    });
  }
}
