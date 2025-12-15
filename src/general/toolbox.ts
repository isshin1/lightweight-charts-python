import { DrawingTool } from "../drawing/drawing-tool";
import { TrendLine } from "../trend-line/trend-line";
import { Box } from "../box/box";
import { Drawing } from "../drawing/drawing";
import { ContextMenu } from "../context-menu/context-menu";
import { GlobalParams } from "./global-params";
import { IChartApi, ISeriesApi, SeriesType } from "lightweight-charts";
import { HorizontalLine } from "../horizontal-line/horizontal-line";
import { RayLine } from "../horizontal-line/ray-line";
import { VerticalLine } from "../vertical-line/vertical-line";
import { TextAnnotation } from "../text-annotation/text-annotation";


interface Icon {
    div: HTMLDivElement,
    group: SVGGElement,
    type: new (...args: any[]) => Drawing
}

declare const window: GlobalParams

export class ToolBox {
    private static readonly TREND_SVG: string = '<rect x="3.84" y="13.67" transform="matrix(0.7071 -0.7071 0.7071 0.7071 -5.9847 14.4482)" width="21.21" height="1.56"/><path d="M23,3.17L20.17,6L23,8.83L25.83,6L23,3.17z M23,7.41L21.59,6L23,4.59L24.41,6L23,7.41z"/><path d="M6,20.17L3.17,23L6,25.83L8.83,23L6,20.17z M6,24.41L4.59,23L6,21.59L7.41,23L6,24.41z"/>';
    private static readonly HORZ_SVG: string = '<rect x="4" y="14" width="9" height="1"/><rect x="16" y="14" width="9" height="1"/><path d="M11.67,14.5l2.83,2.83l2.83-2.83l-2.83-2.83L11.67,14.5z M15.91,14.5l-1.41,1.41l-1.41-1.41l1.41-1.41L15.91,14.5z"/>';
    private static readonly RAY_SVG: string = '<rect x="8" y="14" width="17" height="1"/><path d="M3.67,14.5l2.83,2.83l2.83-2.83L6.5,11.67L3.67,14.5z M7.91,14.5L6.5,15.91L5.09,14.5l1.41-1.41L7.91,14.5z"/>';
    private static readonly BOX_SVG: string = '<rect x="8" y="6" width="12" height="1"/><rect x="9" y="22" width="11" height="1"/><path d="M3.67,6.5L6.5,9.33L9.33,6.5L6.5,3.67L3.67,6.5z M7.91,6.5L6.5,7.91L5.09,6.5L6.5,5.09L7.91,6.5z"/><path d="M19.67,6.5l2.83,2.83l2.83-2.83L22.5,3.67L19.67,6.5z M23.91,6.5L22.5,7.91L21.09,6.5l1.41-1.41L23.91,6.5z"/><path d="M19.67,22.5l2.83,2.83l2.83-2.83l-2.83-2.83L19.67,22.5z M23.91,22.5l-1.41,1.41l-1.41-1.41l1.41-1.41L23.91,22.5z"/><path d="M3.67,22.5l2.83,2.83l2.83-2.83L6.5,19.67L3.67,22.5z M7.91,22.5L6.5,23.91L5.09,22.5l1.41-1.41L7.91,22.5z"/><rect x="22" y="9" width="1" height="11"/><rect x="6" y="9" width="1" height="11"/>';
    private static readonly VERT_SVG: string = ToolBox.RAY_SVG;
    // Text icon using paths instead of text element for proper fill color
    private static readonly TEXT_SVG: string = '<path d="M7,6 L7,8 L12,8 L12,22 L10,22 L10,24 L19,24 L19,22 L17,22 L17,8 L22,8 L22,6 Z"/>';
    private static readonly TRASH_SVG: string = '<path d="M6,19c0,1.1,0.9,2,2,2h8c1.1,0,2-0.9,2-2V7H6V19z M19,4h-3.5l-1-1h-5l-1,1H5v2h14V4z"/>';

    div: HTMLDivElement;
    private activeIcon: Icon | null = null;

    private buttons: HTMLDivElement[] = [];

    private _commandFunctions: Function[];
    private _handlerID: string;

    private _drawingTool: DrawingTool;

    constructor(handlerID: string, chart: IChartApi, series: ISeriesApi<SeriesType>, commandFunctions: Function[]) {
        this._handlerID = handlerID;
        this._commandFunctions = commandFunctions;
        this._drawingTool = new DrawingTool(chart, series, () => this.removeActiveAndSave());
        this.div = this._makeToolBox()
        new ContextMenu(this.saveDrawings, this._drawingTool);

        commandFunctions.push((event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.code === 'KeyZ') {
                const drawingToDelete = this._drawingTool.drawings.pop();
                if (drawingToDelete) {
                    this._drawingTool.delete(drawingToDelete);
                    this.saveDrawings();
                }
                return true;
            }
            return false;
        });

        document.body.addEventListener('mouseup', () => {
            if (Drawing.hoveredObject) this.saveDrawings();
        });

        document.body.addEventListener('drawing-changed', () => {
            this.saveDrawings();
        });

        commandFunctions.push((event: KeyboardEvent) => {
            if (event.code === 'Delete' || event.code === 'Backspace') {
                if (Drawing.hoveredObject) {
                    this._drawingTool.delete(Drawing.hoveredObject);
                    this.saveDrawings();
                    return true;
                }
            }
            if (event.code === 'Escape') {
                if (this._drawingTool.activeDrawing) return false;
                if (this.activeIcon) {
                    this._onIconClick(this.activeIcon);
                    return true;
                }
            }
            return false;
        });
    }

    toJSON() {
        // Exclude the chart attribute from serialization
        const { ...serialized } = this;
        return serialized;
    }

    private _makeToolBox() {
        let div = document.createElement('div')
        div.classList.add('toolbox');
        this.buttons.push(this._makeToolBoxElement(TrendLine, 'KeyT', ToolBox.TREND_SVG))
        this.buttons.push(this._makeToolBoxElement(HorizontalLine, 'KeyH', ToolBox.HORZ_SVG));
        this.buttons.push(this._makeToolBoxElement(RayLine, 'KeyR', ToolBox.RAY_SVG));
        this.buttons.push(this._makeToolBoxElement(Box, 'KeyB', ToolBox.BOX_SVG));
        this.buttons.push(this._makeToolBoxElement(VerticalLine, 'KeyV', ToolBox.VERT_SVG, true));
        this.buttons.push(this._makeToolBoxElement(TextAnnotation, 'KeyA', ToolBox.TEXT_SVG));
        this.buttons.push(this._makeActionButton(ToolBox.TRASH_SVG, () => {
            this._showConfirmationModal('Delete all drawings?', () => {
                this.clearDrawings();
                this.saveDrawings();
            });
        }));
        for (const button of this.buttons) {
            div.appendChild(button);
        }
        return div
    }

    private _showConfirmationModal(message: string, onConfirm: () => void) {
        const modal = document.createElement('div');
        modal.classList.add('confirmation-modal');

        const content = document.createElement('div');
        content.classList.add('modal-content');

        const text = document.createElement('div');
        text.classList.add('modal-text');
        text.innerText = message;

        const buttons = document.createElement('div');
        buttons.classList.add('modal-buttons');

        const confirmBtn = document.createElement('button');
        confirmBtn.innerText = 'Yes';
        confirmBtn.classList.add('modal-button', 'confirm');

        const cancelBtn = document.createElement('button');
        cancelBtn.innerText = 'No';
        cancelBtn.classList.add('modal-button', 'cancel');

        const close = () => {
            document.body.removeChild(modal);
            document.removeEventListener('keydown', onKeyDown);
        };

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') close();
            if (e.key === 'Enter') {
                onConfirm();
                close();
            }
        };

        confirmBtn.addEventListener('click', () => {
            onConfirm();
            close();
        });

        cancelBtn.addEventListener('click', close);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) close();
        });

        document.addEventListener('keydown', onKeyDown);

        buttons.appendChild(cancelBtn);
        buttons.appendChild(confirmBtn);
        content.appendChild(text);
        content.appendChild(buttons);
        modal.appendChild(content);
        document.body.appendChild(modal);
    }

    private _makeActionButton(paths: string, action: () => void) {
        const elem = document.createElement('div')
        elem.classList.add("toolbox-button");

        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("width", "29");
        svg.setAttribute("height", "29");

        const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
        group.innerHTML = paths
        group.setAttribute("fill", window.pane.color)

        svg.appendChild(group)
        elem.appendChild(svg);

        elem.addEventListener('click', action);

        // Add transform if needed, copying from makeToolBoxElement logic if generic
        // but for now simple icon is enough

        return elem;
    }

    private _makeToolBoxElement(DrawingType: new (...args: any[]) => Drawing, keyCmd: string, paths: string, rotate = false) {
        const elem = document.createElement('div')
        elem.classList.add("toolbox-button");

        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("width", "29");
        svg.setAttribute("height", "29");

        const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
        group.innerHTML = paths
        group.setAttribute("fill", window.pane.color)

        svg.appendChild(group)
        elem.appendChild(svg);

        const icon: Icon = { div: elem, group: group, type: DrawingType }

        elem.addEventListener('click', () => this._onIconClick(icon));

        this._commandFunctions.push((event: KeyboardEvent) => {
            if (this._handlerID !== window.handlerInFocus) return false;

            if (event.altKey && event.code === keyCmd) {
                event.preventDefault()
                this._onIconClick(icon);
                return true
            }
            return false;
        })

        if (rotate == true) {
            svg.style.transform = 'rotate(90deg)';
            svg.style.transformBox = 'fill-box';
            svg.style.transformOrigin = 'center';
        }

        return elem
    }

    private _onIconClick(icon: Icon) {
        if (this.activeIcon) {

            this.activeIcon.div.classList.remove('active-toolbox-button');
            window.setCursor('crosshair');
            this._drawingTool?.stopDrawing()

            // Re-enable chart interaction when deselecting tool
            this._drawingTool.chart.applyOptions({ handleScroll: true, handleScale: true });

            if (this.activeIcon === icon) {
                this.activeIcon = null
                return
            }
        }
        this.activeIcon = icon
        this.activeIcon.div.classList.add('active-toolbox-button')
        window.setCursor('crosshair');

        // Disable chart interaction when selecting tool
        this._drawingTool.chart.applyOptions({ handleScroll: false, handleScale: false });

        this._drawingTool?.beginDrawing(this.activeIcon.type);
    }

    removeActiveAndSave = () => {
        window.setCursor('default');
        if (this.activeIcon) this.activeIcon.div.classList.remove('active-toolbox-button')
        this.activeIcon = null

        // Re-enable chart interaction when drawing finishes
        this._drawingTool.chart.applyOptions({ handleScroll: true, handleScale: true });

        this.saveDrawings()
    }

    addNewDrawing(d: Drawing) {
        this._drawingTool.addNewDrawing(d);
    }

    clearDrawings() {
        this._drawingTool.clearDrawings();
    }

    updateTextAnnotation(id: string, newText: string): boolean {
        // Find the text annotation with the given ID and update its text
        for (const drawing of this._drawingTool.drawings) {
            if (drawing._type === 'TextAnnotation' && (drawing as any)._id === id) {
                (drawing as any).setText(newText);
                this.saveDrawings(); // Auto-save after update
                return true;
            }
        }
        return false; // Annotation not found
    }

    saveDrawings = () => {
        const drawingMeta = []
        for (const d of this._drawingTool.drawings) {
            const meta: any = {
                type: d._type,
                points: d.points,
                options: d._options
            };
            // For TextAnnotation, ensure text is stored in options
            if (d._type === 'TextAnnotation' && (d as any)._text) {
                meta.options = { ...meta.options, text: (d as any)._text };
            }
            drawingMeta.push(meta);
        }
        const string = JSON.stringify(drawingMeta);
        window.callbackFunction(`save_drawings${this._handlerID}_~_${string}`)
    }

    loadDrawings(drawings: any[]) { // TODO any
        drawings.forEach((d) => {
            switch (d.type) {
                case "Box":
                    this._drawingTool.addNewDrawing(new Box(d.points[0], d.points[1], d.options));
                    break;
                case "TrendLine":
                    this._drawingTool.addNewDrawing(new TrendLine(d.points[0], d.points[1], d.options));
                    break;
                case "HorizontalLine":
                    this._drawingTool.addNewDrawing(new HorizontalLine(d.points[0], d.options));
                    break;
                case "RayLine":
                    this._drawingTool.addNewDrawing(new RayLine(d.points[0], d.options));
                    break;
                case "VerticalLine":
                    this._drawingTool.addNewDrawing(new VerticalLine(d.points[0], d.options));
                    break;
                case "TextAnnotation":
                    // Extract text from options, default to "Text" if not found
                    const text = (d.options && typeof d.options.text === 'string') ? d.options.text : "Text";
                    this._drawingTool.addNewDrawing(new TextAnnotation(d.points[0], text, d.options));
                    break;
            }
        })
    }
}
