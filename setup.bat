@echo off
echo ========================================
echo DocSage Setup
echo ========================================
echo.

echo Creating virtual environment...
python -m venv venv
call venv\Scripts\activate.bat

echo Installing backend dependencies...
pip install -r requirements.txt

echo.
echo Setup complete!
echo To start the app, run start.bat
pause
