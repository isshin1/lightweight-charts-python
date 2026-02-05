/**
 * SpotLevelPlugin - Manages spot level display with DOM-based labels and dismiss buttons
 * Similar pattern to OrderPlugin but for spot level lines
 */
class SpotLevelPlugin {
    constructor(handler) {
        if (!handler) return;
        this.handler = handler;
        this.levels = new Map(); // levelPrice -> { price, label, line }

        // Inject CSS for hover effect
        if (!document.getElementById('spot-level-plugin-styles')) {
            const style = document.createElement('style');
            style.id = 'spot-level-plugin-styles';
            style.innerHTML = `
                .spot-level-label {
                    position: absolute;
                    z-index: 15;
                    background-color: #9966FF;
                    color: white;
                    padding: 2px 6px;
                    font-size: 11px;
                    font-family: sans-serif;
                    font-weight: bold;
                    border-radius: 3px;
                    cursor: default;
                    white-space: nowrap;
                    display: flex;
                    align-items: center;
                    user-select: none;
                    opacity: 0.85;
                }
                .spot-level-label:hover {
                    opacity: 1;
                }
                .spot-level-close {
                    display: none;
                    padding: 0 4px;
                    margin-left: 4px;
                    cursor: pointer;
                    font-size: 12px;
                    border-left: 1px solid rgba(255,255,255,0.3);
                }
                .spot-level-label:hover .spot-level-close {
                    display: inline;
                }
                .spot-level-close:hover {
                    color: #ff6666;
                }
            `;
            document.head.appendChild(style);
        }

        this._renderLoop = this._renderLoop.bind(this);
        requestAnimationFrame(this._renderLoop);
    }

    addLevel(levelPrice, chartPrice, color, callbackName) {
        if (this.levels.has(levelPrice)) {
            this.removeLevel(levelPrice);
        }

        if (!this.handler || !this.handler.series) {
            console.warn('SpotLevelPlugin: Handler or series not ready');
            return;
        }

        // 1. Create the horizontal price line
        const line = this.handler.series.createPriceLine({
            price: chartPrice,
            color: color || '#9966FF',
            lineWidth: 1,
            lineStyle: 1, // Dotted
            axisLabelVisible: false,
            title: '',
        });

        // 2. Create DOM label with close button
        const label = document.createElement('div');
        label.className = 'spot-level-label';

        const textSpan = document.createElement('span');
        textSpan.innerText = String(levelPrice);

        const closeBtn = document.createElement('span');
        closeBtn.innerHTML = '✕';
        closeBtn.className = 'spot-level-close';
        closeBtn.title = 'Dismiss this level';
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            if (callbackName && typeof window.callbackFunction === 'function') {
                window.callbackFunction(callbackName + '_~_' + levelPrice);
            }
            this.removeLevel(levelPrice);
        };

        label.appendChild(textSpan);
        label.appendChild(closeBtn);

        this.handler.div.appendChild(label);

        this.levels.set(levelPrice, {
            chartPrice,
            label,
            line,
            callbackName
        });
    }

    removeLevel(levelPrice) {
        if (this.levels.has(levelPrice)) {
            const level = this.levels.get(levelPrice);
            if (this.handler && this.handler.series) {
                try {
                    this.handler.series.removePriceLine(level.line);
                } catch (e) { }
            }
            if (level.label && level.label.parentNode) {
                level.label.parentNode.removeChild(level.label);
            }
            this.levels.delete(levelPrice);
        }
    }

    clearAllLevels() {
        for (const [levelPrice] of this.levels) {
            this.removeLevel(levelPrice);
        }
    }

    _renderLoop() {
        requestAnimationFrame(this._renderLoop);
        try {
            if (!this.handler || !this.handler.series) return;

            const priceScale = this.handler.series.priceScale();
            const priceScaleWidth = priceScale.width();

            // Get chart element offset
            let chartTopOffset = 0;
            try {
                if (this.handler.chart && this.handler.chart.chartElement && this.handler.div) {
                    const chartEl = this.handler.chart.chartElement();
                    const divRect = this.handler.div.getBoundingClientRect();
                    const chartRect = chartEl.getBoundingClientRect();
                    chartTopOffset = chartRect.top - divRect.top;
                }
            } catch (e) { }

            for (const [levelPrice, level] of this.levels) {
                let y = null;
                try {
                    y = this.handler.series.priceToCoordinate(level.chartPrice);
                } catch (e) { }

                if (y === null) {
                    level.label.style.display = 'none';
                } else {
                    level.label.style.display = 'flex';
                    // Position above the line, anchored to right edge
                    level.label.style.top = (y + chartTopOffset - 18) + 'px';
                    level.label.style.right = (priceScaleWidth + 10) + 'px';
                }
            }
        } catch (e) {
            console.warn("SpotLevelPlugin render error:", e);
        }
    }
}
