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
import { VolumeProfile } from "../volume-profile/volume-profile";
import { drawingSyncManager } from "../drawing/drawing-sync";


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
    private static readonly TEXT_SVG: string = '<path d="M8 6.5c0-.28.22-.5.5-.5H14v16h-2v1h5v-1h-2V6h5.5c.28 0 .5.22.5.5V9h1V6.5c0-.83-.67-1.5-1.5-1.5h-12C7.67 5 7 5.67 7 6.5V9h1V6.5Z"/>';
    private static readonly VOLUME_PROFILE_SVG: string = '<rect x="4" y="6" width="14" height="2"/><rect x="4" y="10" width="20" height="2"/><rect x="4" y="14" width="16" height="2"/><rect x="4" y="18" width="10" height="2"/><rect x="4" y="22" width="7" height="2"/>';
    private static readonly TRASH_SVG: string = '<path d="M18 7h5v1h-2.01l-1.33 14.64a1.5 1.5 0 0 1-1.5 1.36H9.84a1.5 1.5 0 0 1-1.49-1.36L7.01 8H5V7h5V6c0-1.1.9-2 2-2h4a2 2 0 0 1 2 2v1Zm-6-2a1 1 0 0 0-1 1v1h6V6a1 1 0 0 0-1-1h-4ZM8.02 8l1.32 14.54a.5.5 0 0 0 .5.46h8.33a.5.5 0 0 0 .5-.46L19.99 8H8.02Z"/>';

    div: HTMLDivElement;
    private activeIcon: Icon | null = null;

    private buttons: HTMLDivElement[] = [];

    private _commandFunctions: Function[];
    private _handlerID: string;

    private _drawingTool: DrawingTool;
    private _currentSymbol: string = '';

    constructor(handlerID: string, chart: IChartApi, series: ISeriesApi<SeriesType>, commandFunctions: Function[]) {
        this._handlerID = handlerID;
        this._commandFunctions = commandFunctions;
        this._drawingTool = new DrawingTool(chart, series, (type?: string) => this.removeActiveAndSave(type));
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



        document.body.addEventListener('drawing-changed', (e: Event) => {
            // If a drawing changed, it might be provided in the event detail (CustomEvent)
            // fallback to hoveredObject or undefined
            let type = undefined;
            if ((e as CustomEvent).detail && (e as CustomEvent).detail.type) {
                type = (e as CustomEvent).detail.type;
            } else {
                type = Drawing.hoveredObject ? Drawing.hoveredObject._type : undefined;
            }
            this.saveDrawings(type);
        });

        commandFunctions.push((event: KeyboardEvent) => {
            // Skip if user is typing in an input element (e.g., label modal)
            const activeElement = document.activeElement;
            const isInputElement = activeElement && (
                activeElement.tagName === 'INPUT' ||
                activeElement.tagName === 'TEXTAREA' ||
                (activeElement as HTMLElement).isContentEditable
            );
            if (isInputElement) return false;

            if (event.code === 'Delete' || event.code === 'Backspace') {
                if (Drawing.hoveredObject) {
                    const type = Drawing.hoveredObject._type; // Capture type before deletion
                    this._drawingTool.delete(Drawing.hoveredObject);
                    this.saveDrawings(type);
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

        // Create drag handle (6-dot widget)
        const dragHandle = document.createElement('div');
        dragHandle.classList.add('toolbox-drag-handle');
        dragHandle.style.cssText = 'display: flex; align-items: center; justify-content: center; padding: 0 4px 0 6px; cursor: move;';

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '12');
        svg.setAttribute('height', '18');
        svg.setAttribute('viewBox', '0 0 12 18');

        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        group.innerHTML = '<circle cx="3.5" cy="3.5" r="1.2"/><circle cx="8.5" cy="3.5" r="1.2"/><circle cx="3.5" cy="9" r="1.2"/><circle cx="8.5" cy="9" r="1.2"/><circle cx="3.5" cy="14.5" r="1.2"/><circle cx="8.5" cy="14.5" r="1.2"/>';
        group.setAttribute('fill', '#B2B5BE');

        svg.appendChild(group);
        dragHandle.appendChild(svg);
        div.appendChild(dragHandle);

        // Implement drag-to-move functionality
        let isDragging = false;
        let offsetX = 0;
        let offsetY = 0;

        const onMouseDown = (e: MouseEvent) => {
            if (e.button !== 0) return;  // Only left click
            isDragging = true;
            offsetX = e.clientX - div.offsetLeft;
            offsetY = e.clientY - div.offsetTop;
            e.preventDefault();
        };

        const onMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;
            div.style.left = (e.clientX - offsetX) + 'px';
            div.style.top = (e.clientY - offsetY) + 'px';
            div.style.right = 'auto';  // Override right positioning when dragging
        };

        const onMouseUp = () => {
            isDragging = false;
        };

        dragHandle.addEventListener('mousedown', onMouseDown);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);

        // Create tool buttons with identifiers for reordering
        const toolDefs = [
            { id: 'trend', factory: () => this._makeToolBoxElement(TrendLine, 'KeyT', ToolBox.TREND_SVG) },
            { id: 'horz', factory: () => this._makeToolBoxElement(HorizontalLine, 'KeyH', ToolBox.HORZ_SVG) },
            { id: 'ray', factory: () => this._makeToolBoxElement(RayLine, 'KeyR', ToolBox.RAY_SVG) },
            { id: 'box', factory: () => this._makeToolBoxElement(Box, 'KeyB', ToolBox.BOX_SVG) },
            { id: 'vert', factory: () => this._makeToolBoxElement(VerticalLine, 'KeyV', ToolBox.VERT_SVG, true) },
            { id: 'text', factory: () => this._makeToolBoxElement(TextAnnotation, 'KeyA', ToolBox.TEXT_SVG) },
            { id: 'volProfile', factory: () => this._makeToolBoxElement(VolumeProfile, 'KeyP', ToolBox.VOLUME_PROFILE_SVG) },
            {
                id: 'trash', factory: () => this._makeActionButton(ToolBox.TRASH_SVG, () => {
                    this._showConfirmationModal('Delete all drawings?', () => {
                        this.clearDrawings();
                        this.saveDrawings();
                    });
                })
            }
        ];

        // Load saved order from window.TOOLBOX_ORDER if available
        let orderedIds = toolDefs.map(t => t.id);
        if ((window as any).TOOLBOX_ORDER && Array.isArray((window as any).TOOLBOX_ORDER)) {
            const savedOrder = (window as any).TOOLBOX_ORDER as string[];
            // Ensure all IDs are present
            const validOrder = savedOrder.filter(id => orderedIds.includes(id));
            const missingIds = orderedIds.filter(id => !validOrder.includes(id));
            orderedIds = [...validOrder, ...missingIds];
        }

        // Create buttons in the saved order
        const toolMap = new Map(toolDefs.map(t => [t.id, t]));
        for (const id of orderedIds) {
            const def = toolMap.get(id);
            if (def) {
                const btn = def.factory();
                btn.dataset.toolId = id;
                this.buttons.push(btn);
            }
        }

        for (const button of this.buttons) {
            div.appendChild(button);
        }

        // Setup tool reordering drag-and-drop
        this._setupToolReordering(div);

        return div
    }

    private _setupToolReordering(toolbox: HTMLDivElement) {
        let draggedButton: HTMLDivElement | null = null;
        let dragStartX = 0;

        const getToolButtons = (): HTMLDivElement[] => {
            return Array.from(toolbox.querySelectorAll('.toolbox-button')) as HTMLDivElement[];
        };

        const saveOrder = () => {
            const buttons = getToolButtons();
            const order = buttons.map(btn => btn.dataset.toolId).filter(Boolean);
            window.callbackFunction(`save_toolbox_order_~_${JSON.stringify(order)}`);
        };

        const onMouseDown = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const button = target.closest('.toolbox-button') as HTMLDivElement;
            if (!button || e.button !== 0) return;

            draggedButton = button;
            dragStartX = e.clientX;

            // Light blue background when dragging
            button.style.backgroundColor = 'rgba(41, 98, 255, 0.3)';
            button.style.position = 'relative';
            button.style.zIndex = '100';
            button.style.transition = 'none';

            e.preventDefault();
            e.stopPropagation();
        };

        const onMouseMove = (e: MouseEvent) => {
            if (!draggedButton) return;

            const deltaX = e.clientX - dragStartX;
            draggedButton.style.transform = `translateX(${deltaX}px)`;

            // Check for swap with adjacent buttons only
            const buttons = getToolButtons();
            const draggedIndex = buttons.indexOf(draggedButton);
            const draggedRect = draggedButton.getBoundingClientRect();
            const draggedCenter = draggedRect.left + draggedRect.width / 2;

            // Only check immediate neighbors for swapping
            // Check left neighbor (if exists)
            if (draggedIndex > 0) {
                const leftBtn = buttons[draggedIndex - 1];
                const leftRect = leftBtn.getBoundingClientRect();
                const leftCenter = leftRect.left + leftRect.width / 2;

                // Swap left when dragged center goes past left button's center (moving left)
                if (draggedCenter < leftCenter) {
                    toolbox.insertBefore(draggedButton, leftBtn);
                    dragStartX = e.clientX;
                    draggedButton.style.transform = 'translateX(0)';
                    return;
                }
            }

            // Check right neighbor (if exists)
            if (draggedIndex < buttons.length - 1) {
                const rightBtn = buttons[draggedIndex + 1];
                const rightRect = rightBtn.getBoundingClientRect();
                const rightCenter = rightRect.left + rightRect.width / 2;

                // Swap right when dragged center goes past right button's center (moving right)
                if (draggedCenter > rightCenter) {
                    if (rightBtn.nextSibling) {
                        toolbox.insertBefore(draggedButton, rightBtn.nextSibling);
                    } else {
                        toolbox.appendChild(draggedButton);
                    }
                    dragStartX = e.clientX;
                    draggedButton.style.transform = 'translateX(0)';
                    return;
                }
            }
        };

        const onMouseUp = () => {
            if (!draggedButton) return;

            // Reset styles
            draggedButton.style.backgroundColor = '';
            draggedButton.style.position = '';
            draggedButton.style.zIndex = '';
            draggedButton.style.transform = '';
            draggedButton.style.transition = '';

            // Save the new order
            saveOrder();

            draggedButton = null;
        };

        // Attach listeners to the toolbox
        toolbox.addEventListener('mousedown', onMouseDown);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
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

    removeActiveAndSave = (type?: string) => {
        window.setCursor('default');
        if (this.activeIcon) this.activeIcon.div.classList.remove('active-toolbox-button')
        this.activeIcon = null

        // Re-enable chart interaction when drawing finishes
        this._drawingTool.chart.applyOptions({ handleScroll: true, handleScale: true });

        this.saveDrawings(type)
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

    saveDrawings = (type?: string) => {
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
        // Append drawingType to the message to allow filtering on Python side
        window.callbackFunction(`save_drawings${this._handlerID}_~_${string}_~_${type || ''}`)

        // [DISABLED] JS sync disabled - Python handles all cross-chart sync
        // to avoid dual-sync conflicts that cause drawings to appear/disappear
        // drawingSyncManager.syncFromChart(this._handlerID);
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
                case "VolumeProfile":
                    this._drawingTool.addNewDrawing(new VolumeProfile(d.points[0], d.points[1], d.options));
                    break;
            }
        })
    }

    /**
     * Register this chart with the DrawingSyncManager for cross-chart drawing sync.
     * Call this when a chart is assigned a symbol.
     */
    registerForSync(symbol: string): void {
        this._currentSymbol = symbol;
        drawingSyncManager.registerChart(this._handlerID, symbol, this);
    }

    /**
     * Unregister this chart from the DrawingSyncManager (e.g., when closing a split).
     */
    unregisterFromSync(): void {
        drawingSyncManager.unregisterChart(this._handlerID);
        this._currentSymbol = '';
    }

    /**
     * Update the symbol for this chart (triggers re-registration with DrawingSyncManager).
     */
    setSymbol(symbol: string): void {
        if (this._currentSymbol !== symbol) {
            this._currentSymbol = symbol;
            drawingSyncManager.updateSymbol(this._handlerID, symbol);
        }
    }

    /**
     * Get the current symbol for this chart.
     */
    getSymbol(): string {
        return this._currentSymbol;
    }

    /**
     * Get the handler ID for this chart.
     */
    getHandlerID(): string {
        return this._handlerID;
    }

    /**
     * Get the DrawingTool instance (for DrawingSyncManager access).
     */
    getDrawingTool(): DrawingTool {
        return this._drawingTool;
    }

    /**
     * Reposition all drawings based on their stored timestamps.
     * This recalculates the logical (bar index) from the time coordinate,
     * enabling cross-timeframe drawing sync.
     */
    repositionOnTime(): void {
        this._drawingTool.repositionOnTime();
    }
}
