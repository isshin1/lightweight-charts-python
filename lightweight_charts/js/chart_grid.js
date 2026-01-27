/**
 * Chart Grid Layout Manager
 * Manages a 2x2 grid layout for split charts.
 * 
 * Grid Model:
 * [0,0] [0,1]   --> Top-left, Top-right
 * [1,0] [1,1]   --> Bottom-left, Bottom-right
 */

(function () {
    'use strict';

    const MAX_ROWS = 2;
    const MAX_COLS = 2;

    // Grid state: 2x2 array of chart wrappers (null = empty)
    const cells = [
        [null, null],
        [null, null]
    ];

    // Track cell spans for layout
    const cellSpans = [
        [{ rowSpan: 2, colSpan: 2 }, { rowSpan: 1, colSpan: 1 }],
        [{ rowSpan: 1, colSpan: 1 }, { rowSpan: 1, colSpan: 1 }]
    ];

    // Divider elements between cells
    const dividers = {
        horizontal: null,  // Between row 0 and row 1
        vertical: null     // Between col 0 and col 1
    };

    /**
     * Initialize the grid system on the container.
     */
    function init() {
        const container = window.containerDiv;
        if (!container) {
            console.error('[ChartGrid] containerDiv not found');
            return;
        }

        // Set up CSS Grid on container
        container.style.display = 'grid';
        container.style.gridTemplateRows = '1fr 1fr';
        container.style.gridTemplateColumns = '1fr 1fr';
        container.style.width = '100%';
        container.style.height = '100%';
        container.style.position = 'absolute';
        container.style.top = '0';
        container.style.left = '0';
        container.style.gap = '0';

        console.log('[ChartGrid] Initialized');
    }

    /**
     * Get the number of active (non-null) cells.
     */
    function getActiveCount() {
        let count = 0;
        for (let r = 0; r < MAX_ROWS; r++) {
            for (let c = 0; c < MAX_COLS; c++) {
                if (cells[r][c]) count++;
            }
        }
        return count;
    }

    /**
     * Check if a split is possible in the given direction.
     * @param {number} row - Source cell row
     * @param {number} col - Source cell column  
     * @param {string} direction - 'right' or 'down'
     * @returns {boolean}
     */
    function canSplit(row, col, direction) {
        if (direction === 'right') {
            // Check if column to the right is available
            if (col >= MAX_COLS - 1) return false;
            // Check if any cell in that column is occupied
            for (let r = 0; r < MAX_ROWS; r++) {
                if (cells[r][col + 1]) return false;
            }
            return true;
        } else if (direction === 'down') {
            // Check if row below is available
            if (row >= MAX_ROWS - 1) return false;
            // Check if any cell in that row is occupied
            for (let c = 0; c < MAX_COLS; c++) {
                if (cells[row + 1][c]) return false;
            }
            return true;
        }
        return false;
    }

    /**
     * Find the next available slot for a split.
     * @param {number} row - Source cell row
     * @param {number} col - Source cell column
     * @param {string} direction - 'right' or 'down'
     * @returns {{row: number, col: number}|null}
     */
    function findSlotForSplit(row, col, direction) {
        if (!canSplit(row, col, direction)) return null;

        if (direction === 'right') {
            return { row: row, col: col + 1 };
        } else if (direction === 'down') {
            return { row: row + 1, col: col };
        }
        return null;
    }

    /**
     * Place a chart wrapper in a grid cell.
     * @param {HTMLElement} wrapper - The chart wrapper element
     * @param {number} row - Grid row (0 or 1)
     * @param {number} col - Grid column (0 or 1)
     */
    function placeChart(wrapper, row, col) {
        if (row < 0 || row >= MAX_ROWS || col < 0 || col >= MAX_COLS) {
            console.error('[ChartGrid] Invalid cell position:', row, col);
            return false;
        }

        cells[row][col] = wrapper;

        // Style wrapper for grid placement
        wrapper.style.position = 'relative';
        wrapper.style.width = '100%';
        wrapper.style.height = '100%';
        wrapper.style.boxSizing = 'border-box';

        // Store grid position as data attributes
        wrapper.dataset.gridRow = row;
        wrapper.dataset.gridCol = col;

        updateLayout();
        return true;
    }

    /**
     * Remove a chart from the grid and handle expansion.
     * @param {number} row - Grid row
     * @param {number} col - Grid column
     * @returns {HTMLElement|null} The removed wrapper
     */
    function removeChart(row, col) {
        const wrapper = cells[row][col];
        if (!wrapper) return null;

        cells[row][col] = null;

        // Determine which neighbor should expand
        expandNeighbor(row, col);

        updateLayout();
        return wrapper;
    }

    /**
     * Expand a neighbor to fill the empty space.
     * Priority: left neighbor, then top neighbor, then any remaining
     */
    function expandNeighbor(emptyRow, emptyCol) {
        // Check left neighbor
        if (emptyCol > 0 && cells[emptyRow][emptyCol - 1]) {
            // Left neighbor will span into this column
            return;
        }
        // Check top neighbor
        if (emptyRow > 0 && cells[emptyRow - 1][emptyCol]) {
            // Top neighbor will span into this row
            return;
        }
        // Check right neighbor
        if (emptyCol < MAX_COLS - 1 && cells[emptyRow][emptyCol + 1]) {
            // Right neighbor will span left
            return;
        }
        // Check bottom neighbor
        if (emptyRow < MAX_ROWS - 1 && cells[emptyRow + 1][emptyCol]) {
            // Bottom neighbor will span up
            return;
        }
    }

    /**
     * Update the CSS grid layout based on current cell state.
     */
    function updateLayout() {
        const container = window.containerDiv;
        if (!container) return;

        const activeCount = getActiveCount();

        // Reset all wrappers
        for (let r = 0; r < MAX_ROWS; r++) {
            for (let c = 0; c < MAX_COLS; c++) {
                const wrapper = cells[r][c];
                if (wrapper) {
                    wrapper.style.gridRow = '';
                    wrapper.style.gridColumn = '';
                    wrapper.style.display = 'block';
                }
            }
        }

        if (activeCount === 1) {
            // Single chart: span full grid
            for (let r = 0; r < MAX_ROWS; r++) {
                for (let c = 0; c < MAX_COLS; c++) {
                    if (cells[r][c]) {
                        cells[r][c].style.gridRow = '1 / -1';
                        cells[r][c].style.gridColumn = '1 / -1';
                    }
                }
            }
            // Hide dividers
            hideDividers();
        } else if (activeCount === 2) {
            // Two charts: determine if horizontal or vertical split
            const positions = [];
            for (let r = 0; r < MAX_ROWS; r++) {
                for (let c = 0; c < MAX_COLS; c++) {
                    if (cells[r][c]) positions.push({ r, c, wrapper: cells[r][c] });
                }
            }

            if (positions[0].r === positions[1].r) {
                // Same row = vertical split (side by side)
                positions[0].wrapper.style.gridRow = '1 / -1';
                positions[0].wrapper.style.gridColumn = '1';
                positions[1].wrapper.style.gridRow = '1 / -1';
                positions[1].wrapper.style.gridColumn = '2';
                showVerticalDivider();
                hideHorizontalDivider();
            } else if (positions[0].c === positions[1].c) {
                // Same column = horizontal split (stacked)
                positions[0].wrapper.style.gridRow = '1';
                positions[0].wrapper.style.gridColumn = '1 / -1';
                positions[1].wrapper.style.gridRow = '2';
                positions[1].wrapper.style.gridColumn = '1 / -1';
                showHorizontalDivider();
                hideVerticalDivider();
            } else {
                // Diagonal - treat as L-shape, first spans
                // This is a complex case - handle based on positions
                updateLShapeLayout(positions);
            }
        } else if (activeCount === 3) {
            // Three charts: L-shape configuration
            updateThreeChartLayout();
        } else if (activeCount === 4) {
            // Full 2x2 grid
            for (let r = 0; r < MAX_ROWS; r++) {
                for (let c = 0; c < MAX_COLS; c++) {
                    if (cells[r][c]) {
                        cells[r][c].style.gridRow = String(r + 1);
                        cells[r][c].style.gridColumn = String(c + 1);
                    }
                }
            }
            showHorizontalDivider();
            showVerticalDivider();
        }

        updateDividerPositions();
        console.log('[ChartGrid] Layout updated, activeCount:', activeCount);
    }

    /**
     * Handle L-shape layout for 2 charts at diagonal positions.
     */
    function updateLShapeLayout(positions) {
        // For diagonal placement, make the first chart span appropriately
        const first = positions[0];
        const second = positions[1];

        first.wrapper.style.gridRow = String(first.r + 1);
        first.wrapper.style.gridColumn = String(first.c + 1);
        second.wrapper.style.gridRow = String(second.r + 1);
        second.wrapper.style.gridColumn = String(second.c + 1);

        // Show both dividers for L-shape
        showHorizontalDivider();
        showVerticalDivider();
    }

    /**
     * Handle 3-chart layout.
     */
    function updateThreeChartLayout() {
        // Find the empty cell
        let emptyRow = -1, emptyCol = -1;
        for (let r = 0; r < MAX_ROWS; r++) {
            for (let c = 0; c < MAX_COLS; c++) {
                if (!cells[r][c]) {
                    emptyRow = r;
                    emptyCol = c;
                    break;
                }
            }
        }

        // Set standard grid positions
        for (let r = 0; r < MAX_ROWS; r++) {
            for (let c = 0; c < MAX_COLS; c++) {
                if (cells[r][c]) {
                    cells[r][c].style.gridRow = String(r + 1);
                    cells[r][c].style.gridColumn = String(c + 1);
                }
            }
        }

        // The cell opposite to empty should span into the empty space
        // Actually for 3 charts, we need to decide which one spans
        // For now, let the chart adjacent to empty span into it

        // Check if there's a chart that can span into the empty cell
        // Prefer the chart in the same row or column
        if (emptyCol > 0 && cells[emptyRow][emptyCol - 1]) {
            // Chart to the left spans right
            cells[emptyRow][emptyCol - 1].style.gridColumn = `${emptyCol} / ${emptyCol + 2}`;
        } else if (emptyRow > 0 && cells[emptyRow - 1][emptyCol]) {
            // Chart above spans down
            cells[emptyRow - 1][emptyCol].style.gridRow = `${emptyRow} / ${emptyRow + 2}`;
        } else if (emptyCol < MAX_COLS - 1 && cells[emptyRow][emptyCol + 1]) {
            // Chart to the right spans left
            cells[emptyRow][emptyCol + 1].style.gridColumn = `${emptyCol + 1} / ${emptyCol + 3}`;
        } else if (emptyRow < MAX_ROWS - 1 && cells[emptyRow + 1][emptyCol]) {
            // Chart below spans up
            cells[emptyRow + 1][emptyCol].style.gridRow = `${emptyRow + 1} / ${emptyRow + 3}`;
        }

        showHorizontalDivider();
        showVerticalDivider();
    }

    /**
     * Create or show the vertical divider.
     */
    function showVerticalDivider() {
        if (!dividers.vertical) {
            dividers.vertical = createDivider('vertical');
        }
        dividers.vertical.style.display = 'block';
    }

    /**
     * Create or show the horizontal divider.
     */
    function showHorizontalDivider() {
        if (!dividers.horizontal) {
            dividers.horizontal = createDivider('horizontal');
        }
        dividers.horizontal.style.display = 'block';
    }

    function hideVerticalDivider() {
        if (dividers.vertical) {
            dividers.vertical.style.display = 'none';
        }
    }

    function hideHorizontalDivider() {
        if (dividers.horizontal) {
            dividers.horizontal.style.display = 'none';
        }
    }

    function hideDividers() {
        hideVerticalDivider();
        hideHorizontalDivider();
    }

    /**
     * Create a resizable divider element.
     * @param {string} orientation - 'horizontal' or 'vertical'
     */
    function createDivider(orientation) {
        const container = window.containerDiv;
        const divider = document.createElement('div');
        divider.className = `grid-divider grid-divider-${orientation}`;
        divider.style.position = 'absolute';
        divider.style.zIndex = '10000';
        divider.style.backgroundColor = 'rgba(60, 67, 76, 0.3)';
        divider.style.transition = 'background-color 0.15s';

        if (orientation === 'vertical') {
            divider.style.width = '4px';
            divider.style.height = '100%';
            divider.style.top = '0';
            divider.style.cursor = 'col-resize';
        } else {
            divider.style.height = '4px';
            divider.style.width = '100%';
            divider.style.left = '0';
            divider.style.cursor = 'row-resize';
        }

        // Add grip indicator
        const grip = document.createElement('div');
        grip.style.position = 'absolute';
        grip.style.left = '50%';
        grip.style.top = '50%';
        grip.style.transform = 'translate(-50%, -50%)';
        grip.style.backgroundColor = '#3C434C';
        grip.style.borderRadius = '2px';
        grip.style.pointerEvents = 'none';

        if (orientation === 'vertical') {
            grip.style.width = '4px';
            grip.style.height = '40px';
        } else {
            grip.style.width = '40px';
            grip.style.height = '4px';
        }

        divider.appendChild(grip);
        container.appendChild(divider);

        // Set up drag behavior
        setupDividerDrag(divider, orientation, grip);

        return divider;
    }

    /**
     * Set up drag behavior for a divider.
     */
    function setupDividerDrag(divider, orientation, grip) {
        let isDragging = false;
        let startPos = 0;
        let startRatio = 0.5;

        divider.addEventListener('mouseenter', () => {
            if (!isDragging) {
                divider.style.backgroundColor = 'rgba(0, 122, 255, 0.5)';
                grip.style.backgroundColor = '#007AFF';
            }
        });

        divider.addEventListener('mouseleave', () => {
            if (!isDragging) {
                divider.style.backgroundColor = 'rgba(60, 67, 76, 0.3)';
                grip.style.backgroundColor = '#3C434C';
            }
        });

        divider.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();

            isDragging = true;
            startPos = orientation === 'vertical' ? e.clientX : e.clientY;

            const container = window.containerDiv;
            const containerRect = container.getBoundingClientRect();
            const size = orientation === 'vertical' ? containerRect.width : containerRect.height;
            const currentPos = orientation === 'vertical'
                ? parseFloat(divider.style.left) || (size / 2)
                : parseFloat(divider.style.top) || (size / 2);
            startRatio = currentPos / size;

            divider.style.backgroundColor = 'rgba(0, 122, 255, 0.7)';
            grip.style.backgroundColor = '#007AFF';

            document.body.style.cursor = orientation === 'vertical' ? 'col-resize' : 'row-resize';
            document.body.style.userSelect = 'none';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            const container = window.containerDiv;
            const containerRect = container.getBoundingClientRect();

            let newRatio;
            if (orientation === 'vertical') {
                const mouseX = e.clientX - containerRect.left;
                newRatio = mouseX / containerRect.width;
            } else {
                const mouseY = e.clientY - containerRect.top;
                newRatio = mouseY / containerRect.height;
            }

            // Clamp to 10%-90%
            newRatio = Math.max(0.1, Math.min(0.9, newRatio));

            // Update grid template
            if (orientation === 'vertical') {
                container.style.gridTemplateColumns = `${newRatio}fr ${1 - newRatio}fr`;
            } else {
                container.style.gridTemplateRows = `${newRatio}fr ${1 - newRatio}fr`;
            }

            updateDividerPositions();

            // Notify Python
            if (window.pythonObject) {
                window.pythonObject.callback(
                    `on_grid_ratio_~_${orientation}_~_${newRatio.toFixed(4)}`
                );
            }
        });

        document.addEventListener('mouseup', () => {
            if (!isDragging) return;

            isDragging = false;
            divider.style.backgroundColor = 'rgba(60, 67, 76, 0.3)';
            grip.style.backgroundColor = '#3C434C';

            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        });
    }

    /**
     * Update divider positions based on current grid layout.
     */
    function updateDividerPositions() {
        const container = window.containerDiv;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const styles = getComputedStyle(container);

        // Parse grid template
        const cols = styles.gridTemplateColumns.split(' ');
        const rows = styles.gridTemplateRows.split(' ');

        if (dividers.vertical && dividers.vertical.style.display !== 'none') {
            const firstColWidth = parseFloat(cols[0]) || rect.width / 2;
            const totalWidth = cols.reduce((sum, c) => sum + (parseFloat(c) || 0), 0);
            const ratio = firstColWidth / totalWidth;
            dividers.vertical.style.left = `${ratio * 100}%`;
            dividers.vertical.style.transform = 'translateX(-50%)';
        }

        if (dividers.horizontal && dividers.horizontal.style.display !== 'none') {
            const firstRowHeight = parseFloat(rows[0]) || rect.height / 2;
            const totalHeight = rows.reduce((sum, r) => sum + (parseFloat(r) || 0), 0);
            const ratio = firstRowHeight / totalHeight;
            dividers.horizontal.style.top = `${ratio * 100}%`;
            dividers.horizontal.style.transform = 'translateY(-50%)';
        }
    }

    /**
     * Get cell at position.
     */
    function getCell(row, col) {
        if (row >= 0 && row < MAX_ROWS && col >= 0 && col < MAX_COLS) {
            return cells[row][col];
        }
        return null;
    }

    /**
     * Get all active cells.
     */
    function getActiveCells() {
        const active = [];
        for (let r = 0; r < MAX_ROWS; r++) {
            for (let c = 0; c < MAX_COLS; c++) {
                if (cells[r][c]) {
                    active.push({ row: r, col: c, wrapper: cells[r][c] });
                }
            }
        }
        return active;
    }

    /**
     * Check if position is top-left (should hide close button).
     */
    function isTopLeft(row, col) {
        // Top-left is the first active cell when sorted by row then column
        const active = getActiveCells();
        if (active.length === 0) return false;
        active.sort((a, b) => a.row === b.row ? a.col - b.col : a.row - b.row);
        return active[0].row === row && active[0].col === col;
    }

    // Expose globally
    window.ChartGrid = {
        init,
        cells,
        getActiveCount,
        canSplit,
        findSlotForSplit,
        placeChart,
        removeChart,
        updateLayout,
        getCell,
        getActiveCells,
        isTopLeft,
        MAX_ROWS,
        MAX_COLS
    };

    console.log('[ChartGrid] Module loaded');
})();
