import { TextAnnotation } from "../text-annotation/text-annotation";


export class TextToolbar {
  private _div: HTMLDivElement;

  constructor(
    private annotation: TextAnnotation,
    private saveDrawings: Function
  ) {
    this._div = document.createElement('div');
    this._div.classList.add('text-toolbar');
    this._div.style.display = 'flex';
    this._div.style.alignItems = 'center';
    this._div.style.padding = '5px';
    this._div.style.gap = '8px'; // Spacing between items

    this._render();
  }

  get div() { return this._div; }

  private _render() {
    // 1. Color Picker Icon (Box)
    const colorBox = document.createElement('div');
    colorBox.style.width = '20px';
    colorBox.style.height = '20px';
    colorBox.style.backgroundColor = (this.annotation._options as any).textColor || '#FFFFFF';
    colorBox.style.border = '1px solid #555';
    colorBox.style.cursor = 'pointer';
    colorBox.title = "Text Color";

    // Use existing ColorPicker logic logic locally or just open it
    // Simpler: Reuse ColorPicker but bind it to this element
    // We'll attach click handler later or outside

    // 2. Font Size Input
    const fontSizeInput = document.createElement('input');
    fontSizeInput.type = 'number';
    fontSizeInput.min = '8';
    fontSizeInput.max = '72';
    fontSizeInput.value = (this.annotation.fontSize || 14).toString();
    fontSizeInput.style.width = '40px';
    fontSizeInput.style.backgroundColor = '#333';
    fontSizeInput.style.color = '#eee';
    fontSizeInput.style.border = '1px solid #555';
    fontSizeInput.style.borderRadius = '3px';
    fontSizeInput.title = "Font Size";

    fontSizeInput.onchange = () => {
      const val = parseInt(fontSizeInput.value);
      if (!isNaN(val)) {
        this.annotation.fontSize = val;
        this.saveDrawings();
      }
    };

    // 3. Style Buttons (B, I, U)
    const createButton = (text: string, isActive: boolean, onClick: () => void) => {
      const btn = document.createElement('div');
      btn.innerText = text;
      btn.style.width = '20px';
      btn.style.height = '20px';
      btn.style.display = 'flex';
      btn.style.alignItems = 'center';
      btn.style.justifyContent = 'center';
      btn.style.cursor = 'pointer';
      btn.style.borderRadius = '3px';
      btn.style.fontWeight = 'bold';
      btn.style.fontFamily = 'serif'; // Distinct look

      if (isActive) {
        btn.style.backgroundColor = '#4C9EEA'; // Active blue
        btn.style.color = 'white';
      } else {
        btn.style.backgroundColor = 'transparent';
        btn.style.color = '#ccc';
      }

      btn.onmouseover = () => { if (!isActive) btn.style.backgroundColor = '#444'; };
      btn.onmouseout = () => { if (!isActive) btn.style.backgroundColor = 'transparent'; };

      btn.onclick = onClick;
      return btn;
    };

    const boldBtn = createButton('B', this.annotation.bold, () => {
      this.annotation.bold = !this.annotation.bold;
      this.saveDrawings();
      // Re-render button state (simple way: just toggle style here)
      // But full re-render is cleaner or just update style
      boldBtn.style.backgroundColor = this.annotation.bold ? '#4C9EEA' : 'transparent';
      boldBtn.style.color = this.annotation.bold ? 'white' : '#ccc';
    });

    const italicBtn = createButton('I', this.annotation.italic, () => {
      this.annotation.italic = !this.annotation.italic;
      this.saveDrawings();
      italicBtn.style.backgroundColor = this.annotation.italic ? '#4C9EEA' : 'transparent';
      italicBtn.style.color = this.annotation.italic ? 'white' : '#ccc';
      italicBtn.style.fontStyle = 'italic';
    });
    italicBtn.style.fontStyle = 'italic';

    const underlineBtn = createButton('U', this.annotation.underline, () => {
      this.annotation.underline = !this.annotation.underline;
      this.saveDrawings();
      underlineBtn.style.backgroundColor = this.annotation.underline ? '#4C9EEA' : 'transparent';
      underlineBtn.style.color = this.annotation.underline ? 'white' : '#ccc';
      underlineBtn.style.textDecoration = 'underline';
    });
    underlineBtn.style.textDecoration = 'underline';


    // Assemble
    this._div.appendChild(colorBox);
    this._div.appendChild(fontSizeInput);
    this._div.appendChild(document.createTextNode('|'));
    // Style spacer
    (this._div.lastChild as any).style = "color: #555; margin: 0 2px;";

    this._div.appendChild(boldBtn);
    this._div.appendChild(italicBtn);
    this._div.appendChild(underlineBtn);

    // Expose color box for external picker attachment if needed
    (this._div as any)._colorBox = colorBox;
  }
}
