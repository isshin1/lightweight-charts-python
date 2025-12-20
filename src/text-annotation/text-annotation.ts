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
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

export class TextAnnotation extends Drawing {
  _type = "TextAnnotation";
  _point: Point;
  _text: string;
  _hovered: boolean = false;
  _editing: boolean = false;
  _id: string;

  _bold: boolean = false;
  _italic: boolean = false;
  _underline: boolean = false;
  _fontSize: number = 14;

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

    if (options) {
      this._bold = options.bold ?? false;
      this._italic = options.italic ?? false;
      this._underline = options.underline ?? false;
      if (options.fontSize) this._fontSize = options.fontSize;
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

  get bold() { return this._bold; }
  set bold(val: boolean) { this._bold = val; this.requestUpdate(); }

  get italic() { return this._italic; }
  set italic(val: boolean) { this._italic = val; this.requestUpdate(); }

  get underline() { return this._underline; }
  set underline(val: boolean) { this._underline = val; this.requestUpdate(); }

  get fontSize() { return this._fontSize; }
  set fontSize(val: number) { this._fontSize = val; this.requestUpdate(); }

  getText(): string {
    return this._text;
  }

  updatePoints(...points: (Point | null)[]) {
    if (points[0]) {
      this._point = points[0];
      this._points[0] = points[0];
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

  public startEditing() {
    this._editText();
  }

  private _editText() {
    this._showInputModal(this._text, (newText) => {
      if (newText && newText !== this._text) {
        this.setText(newText);
        document.body.dispatchEvent(new CustomEvent('drawing-changed', { detail: { type: this._type } }));
      }
    });
  }

  private _showInputModal(currentText: string, onConfirm: (text: string) => void) {
    const modal = document.createElement('div');
    modal.classList.add('confirmation-modal');

    const content = document.createElement('div');
    content.classList.add('modal-content');

    const textDisplay = document.createElement('div');
    textDisplay.classList.add('modal-text');
    textDisplay.innerText = 'Enter Text:';

    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentText;
    input.classList.add('modal-input');

    const buttons = document.createElement('div');
    buttons.classList.add('modal-buttons');

    const confirmBtn = document.createElement('button');
    confirmBtn.innerText = 'OK';
    confirmBtn.classList.add('modal-button', 'confirm');

    const cancelBtn = document.createElement('button');
    cancelBtn.innerText = 'Cancel';
    cancelBtn.classList.add('modal-button', 'cancel');

    const close = () => {
      document.body.removeChild(modal);
      document.removeEventListener('keydown', onKeyDown);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'Enter') {
        onConfirm(input.value);
        close();
      }
    };

    confirmBtn.addEventListener('click', () => {
      onConfirm(input.value);
      close();
    });

    cancelBtn.addEventListener('click', close);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });

    document.addEventListener('keydown', onKeyDown);

    buttons.appendChild(cancelBtn);
    buttons.appendChild(confirmBtn);
    content.appendChild(textDisplay);
    content.appendChild(input);
    content.appendChild(buttons);
    modal.appendChild(content);
    document.body.appendChild(modal);

    setTimeout(() => {
      input.focus();
      input.select();
    }, 10);
  }

  private _boxWidth: number = 0;
  private _boxHeight: number = 0;

  _updateDimensions(width: number, height: number) {
    this._boxWidth = width;
    this._boxHeight = height;
  }

  protected _mouseIsOverDrawing(param: MouseEventParams, tolerance = 0) {
    if (!param.point) return false;

    const viewPoint = (this._paneViews[0] as TextAnnotationPaneView)._point;
    if (viewPoint.x === null || viewPoint.y === null) return false;

    const mouseX = param.point.x;
    const mouseY = param.point.y;

    // Renderer draws box normalized to top-left at (x - padding, y - padding)
    // The padding is defined in renderer (6px). We should probably match it or just use the box dimensions returned.
    // The rendered box is at (viewPoint.x - padding, viewPoint.y - padding)
    // With dimensions (boxWidth, boxHeight).
    // Let's assume the padding logic is internal to the renderer's visual output, but
    // the boxWidth/Height returned INCLUDES the padding (textWidth + 2*padding).
    // So logic:
    // Left: viewPoint.x - 6
    // Top: viewPoint.y - 6
    // Right: Left + boxWidth
    // Bottom: Top + boxHeight

    // We can just rely on the box dimensions.
    // Ideally we should import padding but let's hardcode 6 to match renderer for now since it's private there.
    const padding = 6;
    const boxLeft = viewPoint.x - padding;
    const boxTop = viewPoint.y - padding;

    return (
      mouseX >= boxLeft - tolerance &&
      mouseX <= boxLeft + this._boxWidth + tolerance &&
      mouseY >= boxTop - tolerance &&
      mouseY <= boxTop + this._boxHeight + tolerance
    );
  }
}
