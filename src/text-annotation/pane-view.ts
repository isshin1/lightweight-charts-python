import { TextAnnotationPaneRenderer } from "./pane-renderer";
import { DrawingPaneView } from "../drawing/pane-view";

export interface ViewPoint {
  x: number | null;
  y: number | null;
}

export class TextAnnotationPaneView extends DrawingPaneView {
  _source: any;
  _point: ViewPoint = { x: null, y: null };
  _text: string;

  constructor(source: any) {
    super(source);  // Pass source to parent constructor
    this._source = source;
    this._text = source._text || "";
  }

  update() {
    const point = this._source._point;
    const timeScale = this._source.chart.timeScale();
    const series = this._source.series;

    this._point.x = point.time
      ? timeScale.timeToCoordinate(point.time)
      : timeScale.logicalToCoordinate(point.logical);
    this._point.y = series.priceToCoordinate(point.price);
    this._text = this._source._text;
  }

  renderer() {
    return new TextAnnotationPaneRenderer(
      this._point,
      this._text,
      this._source._options,
      this._source.hovered
    );
  }
}
