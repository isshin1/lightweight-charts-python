import sys
import pandas as pd
from PyQt5.QtWidgets import QApplication, QMainWindow, QVBoxLayout, QWidget
from lightweight_charts.widgets import QtChart

def calculate_sma(df, period: int = 50):
    return pd.DataFrame({
        'time': df['date'],
        f'SMA {period}': df['close'].rolling(window=period).mean()
    }).dropna()

if __name__ == '__main__':
    app = QApplication(sys.argv)
    window = QMainWindow()
    central_widget = QWidget()
    window.setCentralWidget(central_widget)
    layout = QVBoxLayout(central_widget)

    # Initialize QtChart
    chart = QtChart(central_widget)
    layout.addWidget(chart.get_webview())

    # Enable Legend
    chart.legend(visible=True)

    # Load Data
    try:
        df = pd.read_csv('ohlcv.csv')
        chart.set(df)

        line = chart.create_line('SMA 50')
        sma_data = calculate_sma(df, period=50)
        line.set(sma_data)
        
    except Exception as e:
        print(f"Error loading data: {e}")

    window.resize(800, 600)
    window.show()

    sys.exit(app.exec())
