@echo off
echo Starting DocSage...
echo.

REM Start the backend in a new window
start "DocSage Backend" cmd /k "cd /d %~dp0 && .venv\Scripts\activate.bat && cd backend && uvicorn main:app --reload"

echo Waiting 3 seconds for backend to start...
timeout /t 3 /nobreak > nul

REM Start the frontend in a new window
start "DocSage Frontend" cmd /k "cd /d %~dp0\frontend && npm run dev"

echo DocSage should now be running!
echo Backend: http://localhost:8000
echo Frontend dev server: http://localhost:5173
pause