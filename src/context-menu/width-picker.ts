/**
 * Width Picker
 * 
 * A submenu component for selecting line width.
 * Used in the drawing context menu.
 */

import { Drawing } from '../drawing/drawing';

export class WidthPicker {
    private static readonly _widths = [1, 2, 3, 4, 5];
    public _div: HTMLDivElement;
    private _saveDrawings: Function;

    constructor(saveDrawings: Function) {
        this._saveDrawings = saveDrawings;

        this._div = document.createElement('div');
        this._div.classList.add('context-menu');
        this._div.style.position = 'fixed';
        this._div.style.zIndex = '99999';

        WidthPicker._widths.forEach((width) => {
            this._div.appendChild(this._makeTextBox(width + 'px', width));
        });

        document.body.appendChild(this._div);
    }

    private _makeTextBox(label: string, widthValue: number): HTMLSpanElement {
        const item = document.createElement('span');
        item.classList.add('context-menu-item');
        item.innerText = label;

        item.addEventListener('click', () => {
            Drawing.lastHoveredObject?.applyOptions({
                width: widthValue
            });
            this._saveDrawings();
        });

        return item;
    }

    openMenu(rect: DOMRect) {
        this._div.style.top = (rect.top - 30) + 'px';
        this._div.style.left = (rect.right + 5) + 'px';
        this._div.style.display = 'block';

        setTimeout(() => {
            document.addEventListener('mousedown', (e: MouseEvent) => {
                if (!this._div.contains(e.target as Node)) {
                    this.closeMenu();
                }
            });
        }, 10);
    }

    closeMenu() {
        document.removeEventListener('click', this.closeMenu);
        this._div.style.display = 'none';
    }
}
