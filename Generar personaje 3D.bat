@echo off
rem Pasa a 3D (IA TRELLIS, gratis) el siguiente personaje que falte. El cupo gratis da para ~1 al dia.
cd /d "%~dp0"
python -m pip install --quiet gradio_client
python herramientas\modelos_ia.py
echo.
echo Si ha salido "ok", reinicia el juego para verlo.
pause
