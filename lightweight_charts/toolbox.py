import json
import logging

logger = logging.getLogger("lightweight_charts")

class ToolBox:
    def __init__(self, chart):
        logger.debug(f"[DEBUG] ToolBox init for chart {chart.id}")
        self.run_script = chart.run_script
        self.id = chart.id
        self._save_under = None
        self.drawings = {}
        chart.win.handlers[f'save_drawings{self.id}'] = self._save_drawings
        self.run_script(f'{self.id}.createToolBox()')

    def save_drawings_under(self, widget: 'Widget'):
        """
        Drawings made on charts will be saved under the widget given. eg `chart.toolbox.save_drawings_under(chart.topbar['symbol'])`.
        """
        logger.debug(f"[DEBUG] ToolBox.save_drawings_under called for chart {self.id}")
        self._save_under = widget

    def load_drawings(self, tag: str):
        """
        Loads and displays the drawings on the chart stored under the tag given.
        """
        if not self.drawings.get(tag):
            return
        self.run_script(f'if ({self.id}.toolBox) {self.id}.toolBox.loadDrawings({json.dumps(self.drawings[tag])})')

    def clear_drawings(self):
        """
        Clears all drawings from the chart.
        """
        self.run_script(f'if ({self.id}.toolBox) {self.id}.toolBox.clearDrawings()')

    def import_drawings(self, file_path):
        """
        Imports a list of drawings stored at the given file path.
        """
        with open(file_path, 'r') as f:
            json_data = json.load(f)
            self.drawings = json_data

    def export_drawings(self, file_path):
        """
        Exports the current list of drawings to the given file path.
        """
        with open(file_path, 'w+') as f:
            json.dump(self.drawings, f, indent=4)

    def _save_drawings(self, drawings, drawing_type=None):
        logger.debug(f"[DEBUG] ToolBox._save_drawings called with type: '{drawing_type}'")
        if not self._save_under:
            logger.debug("[DEBUG] ToolBox._save_drawings: No _save_under set!")
            return
        self.drawings[self._save_under.value] = json.loads(drawings)
        if hasattr(self, 'on_drawing_changed') and callable(self.on_drawing_changed):
            logger.debug("[DEBUG] ToolBox calling on_drawing_changed callback...")
            if drawing_type:
                try:
                    self.on_drawing_changed(drawing_type)
                except TypeError:
                    self.on_drawing_changed()
            else:
                self.on_drawing_changed()
        else:
            logger.debug("[DEBUG] ToolBox has no on_drawing_changed callback!")
