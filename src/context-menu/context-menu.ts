import { Drawing } from "../drawing/drawing";
import { DrawingTool } from "../drawing/drawing-tool";
import { DrawingOptions } from "../drawing/options";
import { GlobalParams } from "../general/global-params";
import { ColorPicker } from "./color-picker";
import { StylePicker } from "./style-picker";
import { TextToolbar } from "./text-toolbar";


export function camelToTitle(inputString: string) {
    const result = [];
    for (const c of inputString) {
        if (result.length == 0) {
            result.push(c.toUpperCase());
        } else if (c == c.toUpperCase()) {
            result.push(' ' + c);
        } else result.push(c);
    }
    return result.join('');
}

interface Item {
    elem: HTMLSpanElement;
    action: Function;
    closeAction: Function | null;
}

declare const window: GlobalParams;


export class ContextMenu {
    private div: HTMLDivElement
    private hoverItem: Item | null;
    private items: HTMLElement[] = []

    constructor(
        private saveDrawings: Function,
        private drawingTool: DrawingTool,
    ) {
        this._onRightClick = this._onRightClick.bind(this);
        this.div = document.createElement('div');
        this.div.classList.add('context-menu');
        document.body.appendChild(this.div);
        this.hoverItem = null;
        document.body.addEventListener('contextmenu', this._onRightClick);
    }

    _handleClick = (ev: MouseEvent) => this._onClick(ev);

    private _onClick(ev: MouseEvent) {
        if (!ev.target) return;
        if (!this.div.contains(ev.target as Node)) {
            this.div.style.display = 'none';
            document.body.removeEventListener('click', this._handleClick);
        }
    }

    private _onRightClick(ev: MouseEvent) {
        if (!Drawing.hoveredObject) return;

        ev.preventDefault();

        for (const item of this.items) {
            this.div.removeChild(item);
        }
        this.items = [];

        // Check if it's a TextAnnotation
        if (Drawing.hoveredObject._type === 'TextAnnotation') {
            const toolbar = new TextToolbar(Drawing.hoveredObject as any, this.saveDrawings);
            this.div.appendChild(toolbar.div);
            this.items.push(toolbar.div);

            // Color Picker Integration
            const colorBox = (toolbar.div as any)._colorBox;
            if (colorBox) {
                // Cast 'textColor' to any to bypass strict keyof check if DrawingOptions definition is incomplete or extended dynamically
                const subMenu = new ColorPicker(this.saveDrawings, 'textColor' as any);

                colorBox.addEventListener('click', () => {
                    const rect = colorBox.getBoundingClientRect();
                    subMenu.openMenu(rect);
                });
            }

            // Add Separator and Delete
            this.separator();
            let onClickDelete = () => {
                const type = Drawing.lastHoveredObject ? Drawing.lastHoveredObject._type : undefined;
                this.drawingTool.delete(Drawing.lastHoveredObject);
                this.saveDrawings(type);
            }
            this.menuItem('Delete Drawing', onClickDelete);
            this.div.style.left = ev.clientX + 'px';
            this.div.style.top = ev.clientY + 'px';
            this.div.style.display = 'block';
            document.body.addEventListener('click', this._handleClick);

            return;
        }

        for (const optionName of Object.keys(Drawing.hoveredObject._options)) {
            let subMenu;
            if (optionName.toLowerCase().includes('color')) {
                subMenu = new ColorPicker(this.saveDrawings, optionName as keyof DrawingOptions);
            } else if (optionName === 'lineStyle') {
                subMenu = new StylePicker(this.saveDrawings)
            } else continue;

            let onClick = (rect: DOMRect) => subMenu.openMenu(rect)
            this.menuItem(camelToTitle(optionName), onClick, () => {
                document.removeEventListener('click', subMenu.closeMenu)
                subMenu._div.style.display = 'none'
            })
        }

        let onClickDelete = () => {
            const type = Drawing.lastHoveredObject ? Drawing.lastHoveredObject._type : undefined;
            this.drawingTool.delete(Drawing.lastHoveredObject);
            this.saveDrawings(type);
        }
        this.separator()
        this.menuItem('Delete Drawing', onClickDelete)

        // const colorPicker = new ColorPicker(this.saveDrawings)
        // const stylePicker = new StylePicker(this.saveDrawings)

        // let onClickDelete = () => this._drawingTool.delete(Drawing.lastHoveredObject);
        // let onClickColor = (rect: DOMRect) => colorPicker.openMenu(rect)
        // let onClickStyle = (rect: DOMRect) => stylePicker.openMenu(rect)

        // contextMenu.menuItem('Color Picker', onClickColor, () => {
        //     document.removeEventListener('click', colorPicker.closeMenu)
        //     colorPicker._div.style.display = 'none'
        // })
        // contextMenu.menuItem('Style', onClickStyle, () => {
        //     document.removeEventListener('click', stylePicker.closeMenu)
        //     stylePicker._div.style.display = 'none'
        // })
        // contextMenu.separator()
        // contextMenu.menuItem('Delete Drawing', onClickDelete)


        this.div.style.left = ev.clientX + 'px';
        this.div.style.top = ev.clientY + 'px';
        this.div.style.display = 'block';
        document.body.addEventListener('click', this._handleClick);
    }

    public menuItem(text: string, action: Function, hover: Function | null = null) {
        const item = document.createElement('span');
        item.classList.add('context-menu-item');
        this.div.appendChild(item);

        const elem = document.createElement('span');
        elem.innerText = text;
        elem.style.pointerEvents = 'none';
        item.appendChild(elem);

        if (hover) {
            let arrow = document.createElement('span')
            arrow.innerText = `►`
            arrow.style.fontSize = '8px'
            arrow.style.pointerEvents = 'none'
            item.appendChild(arrow)
        }

        item.addEventListener('mouseover', () => {
            if (this.hoverItem && this.hoverItem.closeAction) this.hoverItem.closeAction()
            this.hoverItem = { elem: elem, action: action, closeAction: hover }
        })
        if (!hover) item.addEventListener('click', (event) => { action(event); this.div.style.display = 'none' })
        else {
            let timeout: number;
            item.addEventListener('mouseover', () => timeout = setTimeout(() => action(item.getBoundingClientRect()), 100))
            item.addEventListener('mouseout', () => clearTimeout(timeout))
        }

        this.items.push(item);

    }
    public separator() {
        const separator = document.createElement('div')
        separator.style.width = '90%'
        separator.style.height = '1px'
        separator.style.margin = '3px 0px'
        separator.style.backgroundColor = window.pane.borderColor
        this.div.appendChild(separator)

        this.items.push(separator);
    }

}
