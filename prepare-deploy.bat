@echo off
setlocal enabledelayedexpansion

echo [1/4] Building MacroPulse Project...
echo Building frontend...
call npm run build
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Frontend build failed!
    exit /b %ERRORLEVEL%
)

echo Building server...
call npx tsc -p server/tsconfig.json
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Server build failed!
    exit /b %ERRORLEVEL%
)

set DEPLOY_DIR=macropulse-deploy

echo [2/4] Preparing Deployment Directory: %DEPLOY_DIR%...
if exist %DEPLOY_DIR% rm /s /q %DEPLOY_DIR%
mkdir %DEPLOY_DIR%

echo [3/4] Copying files to %DEPLOY_DIR%...

:: Create the main package.json at the ROOT of the zip
:: This tells Hostinger how to start and what to install
echo { > %DEPLOY_DIR%\package.json
echo   "name": "macropulse-server", >> %DEPLOY_DIR%\package.json
echo   "version": "1.0.0", >> %DEPLOY_DIR%\package.json
echo   "type": "module", >> %DEPLOY_DIR%\package.json
echo   "scripts": { >> %DEPLOY_DIR%\package.json
echo     "build": "echo Pre-built", >> %DEPLOY_DIR%\package.json
echo     "start": "node dist/index.js" >> %DEPLOY_DIR%\package.json
echo   }, >> %DEPLOY_DIR%\package.json
echo   "dependencies": { >> %DEPLOY_DIR%\package.json
echo     "@google/genai": "^1.29.0", >> %DEPLOY_DIR%\package.json
echo     "better-sqlite3": "^12.4.1", >> %DEPLOY_DIR%\package.json
echo     "dotenv": "^17.2.3", >> %DEPLOY_DIR%\package.json
echo     "express": "^4.21.2", >> %DEPLOY_DIR%\package.json
echo     "yahoo-finance2": "^3.13.1" >> %DEPLOY_DIR%\package.json
echo   } >> %DEPLOY_DIR%\package.json
echo } >> %DEPLOY_DIR%\package.json

:: Copy EXCLUSIVELY the server/dist contents to the root dist folder
:: This prevents the nested "server/server" issue
mkdir %DEPLOY_DIR%\dist
xcopy /s /e /i /q server\dist %DEPLOY_DIR%\dist

:: Copy the frontend/dist folder
mkdir %DEPLOY_DIR%\frontend\dist
xcopy /s /e /i /q frontend\dist %DEPLOY_DIR%\frontend\dist

echo [4/4] Creating ZIP Archive...
set ZIP_FILE=macropulse-deploy.zip
if exist %ZIP_FILE% del %ZIP_FILE%
powershell -Command "Compress-Archive -Path '%DEPLOY_DIR%\*' -DestinationPath '%ZIP_FILE%' -Force"

echo.
echo ========================================================
echo SUCCESS: Package RESTRUCTURED for Hostinger!
echo ========================================================
echo.
echo NEXT STEPS:
echo 1. Delete the failed deployment on Hostinger.
echo 2. Upload this NEW 'macropulse-deploy.zip'.
echo 3. Ensure Environment Variables are set.
echo.
pause
