@echo off
echo.
echo ==========================================
echo   Mantiq Lean WASM Backend Builder
echo ==========================================
echo.

REM Locate emcc
where emcc >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo emcc not found in PATH. Checking D:\emsdk ...
    if exist "D:\emsdk\emsdk_env.bat" (
        call D:\emsdk\emsdk_env.bat >nul
    ) else (
        echo ERROR: emcc not found. Run setup_emsdk.bat first.
        exit /b 1
    )
)

REM Output destination
set OUT_DIR=%~dp0
set SRC_ROOT=%OUT_DIR%\src

REM Remove old artefacts from wasm/ folder
echo Removing old WASM artefacts...
if exist "%OUT_DIR%\index.js"   del /f /q "%OUT_DIR%\index.js"
if exist "%OUT_DIR%\index.wasm" del /f /q "%OUT_DIR%\index.wasm"

REM Also remove the old Raylib-linked artefacts from the mantiq-main root
if exist "D:\mantiq-main\index.js"   del /f /q "D:\mantiq-main\index.js"
if exist "D:\mantiq-main\index.wasm" del /f /q "D:\mantiq-main\index.wasm"
if exist "D:\mantiq-main\index.data" del /f /q "D:\mantiq-main\index.data"

echo.
echo Compiling lean backend (no Raylib, no preloaded data)...
echo.

call emcc ^
    "%SRC_ROOT%\logic\ASTProver.cpp" ^
    "%SRC_ROOT%\logic\ExpressionProcessor.cpp" ^
    "%SRC_ROOT%\logic\ProcessResult.cpp" ^
    "%SRC_ROOT%\logic\QuineMcCluskey.cpp" ^
    "%SRC_ROOT%\circuit\CircuitNode.cpp" ^
    "%SRC_ROOT%\circuit\CircuitBuilder.cpp" ^
    "%SRC_ROOT%\circuit\VerilogGenerator.cpp" ^
    "%SRC_ROOT%\app\AppState.cpp" ^
    "%SRC_ROOT%\main_web.cpp" ^
    "%SRC_ROOT%\WebBridge_web.cpp" ^
    -o "%OUT_DIR%\index.js" ^
    -I "%SRC_ROOT%" ^
    -std=c++17 ^
    -O3 ^
    -s ALLOW_MEMORY_GROWTH=1 ^
    -s EXPORTED_RUNTIME_METHODS=["ccall","cwrap","stringToUTF8","UTF8ToString"] ^
    -s EXPORTED_FUNCTIONS=["_main","_mantiq_setExpression","_mantiq_runAlgebraicProof","_mantiq_getExpression","_mantiq_setSOP","_mantiq_setMaxFanIn","_mantiq_setView","_mantiq_getView","_mantiq_toggleVariable","_mantiq_getSimplifiedExpr","_mantiq_getAllSolutions","_mantiq_getQMSteps","_mantiq_getVariables","_mantiq_getVariableStates","_mantiq_getTruthTableJSON","_mantiq_getKMapJSON","_mantiq_getVerilogCode","_mantiq_isAlwaysTrue","_mantiq_isAlwaysFalse","_mantiq_isSyntaxValid","_mantiq_hasResult","_mantiq_freeStr","_mantiq_getCircuitJSON","_mantiq_setSelectedSolution"] ^
    -s ENVIRONMENT=worker

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ==========================================
    echo   Build successful!
    for %%F in ("%OUT_DIR%\index.wasm") do echo   WASM size: %%~zF bytes
    echo   Output: %OUT_DIR%\
    echo ==========================================
    echo.
) else (
    echo.
    echo ERROR: Compilation failed.
    echo.
    exit /b 1
)
