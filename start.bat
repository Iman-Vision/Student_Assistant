@echo off
echo ========================================
echo Starting DocSage...
echo ========================================
echo.

echo Activating virtual environment...
call venv\Scripts\activate.bat

echo.
echo Starting backend server...
cd backend
uvicorn main:app --reload
