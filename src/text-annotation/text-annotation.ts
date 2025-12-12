import { MouseEventParams } from 'lightweight-charts';
import { TextAnnotationPaneView } from './pane-view';
import { Point } from '../drawing/data-source';
import { InteractionState } from '../drawing/drawing';
import { DrawingOptions } from '../drawing/options';
import { Drawing } from '../drawing/drawing';

export interface TextAnnotationOptions extends DrawingOptions {
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  textColor?: string;
  backgroundColor?: string;
}

export class TextAnnotation extends Drawing {
  _type = "TextAnnotation";
  _point: Point;
  _text: string;
  _hovered: boolean = false;
  _editing: boolean = false;
  _id: string;

  private static _idCounter: number = 0;

  constructor(
    point: Point,
    text: any = "Text",  // Accept any type to be defensive
    options?: Partial<TextAnnotationOptions>
  ) {
    super(options);
    this._point = point;

    // Ensure text is always a string (defensive programming)
    if (typeof text === 'string') {
      this._text = text;
    } else if (text === null || text === undefined) {
      this._text = "Text";
    } else if (typeof text === 'object') {
      // If it's an object (like a Point), use default text
      console.warn('TextAnnotation received object instead of string:', text);
      this._text = "Text";
    } else {
      // Convert other types to string
      this._text = String(text);
    }

    this._points = [point];
    this._paneViews = [new TextAnnotationPaneView(this)];

    // Generate unique ID for this annotation
    this._id = `text_annotation_${TextAnnotation._idCounter++}_${Date.now()}`;
  }

  get hovered() {
    return this._hovered;
  }

  get points() {
    return [this._point];
  }

  setText(text: string) {
    this._text = text;
    this.requestUpdate();
  }

  getText(): string {
    return this._text;
  }

  updatePoints(...points: (Point | null)[]) {
    if (points[0]) {
      this._point = points[0];
    }
    this.requestUpdate();
  }

  _moveToState(state: InteractionState) {
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
        this._unsubscribe("mouseup", this._handleMouseUpInteraction);
        this.chart.applyOptions({ handleScroll: true });
        break;

      case InteractionState.DRAGGING:
        document.body.style.cursor = "grabbing";
        this._subscribe("mouseup", this._handleMouseUpInteraction);
        this.chart.applyOptions({ handleScroll: false });
        break;
    }
    this._state = state;
  }

  protected _onDrag(diff: any) {
    this._addDiffToPoint(this._point, diff.logical, diff.price);
  }

  protected _onMouseDown() {
    this._startDragPoint = null;
    if (this._latestHoverPoint) {
      // Check for double-click first
      const now = Date.now();
      if (this._lastClickTime && (now - this._lastClickTime) < 300) {
        // Double-click detected - trigger text edit
        this._editText();
        this._lastClickTime = 0;
        return; // Don't enter drag mode
      }
      this._lastClickTime = now;

      // Single click - enter drag mode after a short delay to allow double-click
      setTimeout(() => {
        if (this._lastClickTime !== 0) {
          this._moveToState(InteractionState.DRAGGING);
        }
      }, 100);
    }
  }

  private _lastClickTime: number = 0;

  private _editText() {
    // Call back to Python with the point data, current text, and annotation ID
    const pointData = {
      id: this._id,
      time: this._point.time,
      logical: this._point.logical,
      price: this._point.price,
      currentText: this._text
    };

    const callbackName = `edit_text_annotation_~_${JSON.stringify(pointData)}`;
    (window as any).callbackFunction(callbackName);
  }

  protected _mouseIsOverDrawing(param: MouseEventParams, tolerance = 20) {
    if (!param.point) return false;

    const viewPoint = this._paneViews[0]._point;
    if (viewPoint.x === null || viewPoint.y === null) return false;

    const mouseX = param.point.x;
    const mouseY = param.point.y;

    // Simple bounding box check
    return (
      Math.abs(mouseX - viewPoint.x) < tolerance &&
      Math.abs(mouseY - viewPoint.y) < tolerance
    );
  }
}
