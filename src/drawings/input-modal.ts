/**
 * Input Modal Utility
 * 
 * Creates a modal dialog for text input with position options.
 * Used for adding/editing labels on drawings.
 */

export interface InputModalResult {
    text: string;
    position: 'above' | 'below';
}

export function showInputModal(
    initialText: string | null,
    initialPosition: string | null,
    callback: (result: InputModalResult) => void,
    container?: HTMLElement | null
): void {
    // Get the parent container - use provided container or fallback to document.body
    // For split charts, we want to use the chart container so the overlay only covers that chart
    const parentElement = container || document.body;
    const useAbsolutePositioning = container !== null && container !== undefined;

    // Create modal overlay
    const modal = document.createElement('div');
    modal.classList.add('confirmation-modal');

    // If we have a specific container, use absolute positioning relative to it
    if (useAbsolutePositioning) {
        modal.classList.add('chart-modal');
    }

    // Modal content container
    const content = document.createElement('div');
    content.classList.add('modal-content');

    // Label text
    const label = document.createElement('div');
    label.classList.add('modal-text');
    label.innerText = 'Enter Text:';

    // Text input
    const input = document.createElement('input');
    input.type = 'text';
    input.value = initialText || '';
    input.classList.add('modal-input');

    // Position radio buttons
    const posDiv = document.createElement('div');
    posDiv.style.marginTop = '5px';
    posDiv.style.marginBottom = '15px';
    posDiv.style.color = 'white';

    const isBelow = initialPosition === 'below';
    posDiv.innerHTML = `
        <label><input type="radio" name="pos" value="above" ${!isBelow ? 'checked' : ''}> Above</label>
        <label style="margin-left:10px;"><input type="radio" name="pos" value="below" ${isBelow ? 'checked' : ''}> Below</label>
    `;

    // Buttons container
    const buttons = document.createElement('div');
    buttons.classList.add('modal-buttons');

    // OK button
    const okBtn = document.createElement('button');
    okBtn.innerText = 'OK';
    okBtn.classList.add('modal-button', 'confirm');

    // Cancel button
    const cancelBtn = document.createElement('button');
    cancelBtn.innerText = 'Cancel';
    cancelBtn.classList.add('modal-button', 'cancel');

    // Close modal function
    const close = () => {
        parentElement.removeChild(modal);
        document.removeEventListener('keydown', onKeyDown);
    };

    // Submit function
    const submit = () => {
        const posInput = posDiv.querySelector('input[name="pos"]:checked') as HTMLInputElement;
        const position = posInput ? posInput.value as 'above' | 'below' : 'above';
        callback({
            text: input.value,
            position: position
        });
    };

    // Keyboard handler
    const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            close();
        }
        if (e.key === 'Enter') {
            submit();
            close();
        }
        if (e.key === 'Tab') {
            e.preventDefault();
            const aboveInput = posDiv.querySelector('input[value="above"]') as HTMLInputElement;
            const belowInput = posDiv.querySelector('input[value="below"]') as HTMLInputElement;
            if (aboveInput.checked) {
                belowInput.checked = true;
            } else {
                aboveInput.checked = true;
            }
        }
    };

    // Event listeners
    okBtn.addEventListener('click', () => {
        submit();
        close();
    });

    cancelBtn.addEventListener('click', close);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            close();
        }
    });

    document.addEventListener('keydown', onKeyDown);

    // Build DOM structure
    buttons.appendChild(cancelBtn);
    buttons.appendChild(okBtn);
    content.appendChild(label);
    content.appendChild(input);
    content.appendChild(posDiv);
    content.appendChild(buttons);
    modal.appendChild(content);
    parentElement.appendChild(modal);

    // Focus input after render
    setTimeout(() => {
        input.focus();
        input.select();
    }, 10);
}
